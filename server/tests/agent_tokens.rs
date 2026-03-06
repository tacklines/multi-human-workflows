//! Integration tests for agent tokens at the database level.
//! Tests the token lifecycle: creation, hash-based lookup, expiry, revocation.
//! Requires Docker Compose running (Postgres on :5433).

use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

async fn setup_db() -> PgPool {
    let url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://seam:seam@localhost:5433/seam".to_string());
    let db = PgPool::connect(&url).await.expect("Failed to connect to test database");
    sqlx::migrate!("./migrations").run(&db).await.expect("Failed to run migrations");
    db
}

fn hash_token(raw: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(raw.as_bytes());
    hex::encode(hasher.finalize())
}

async fn create_user(db: &PgPool) -> Uuid {
    let user_id = Uuid::new_v4();
    let external_id = format!("test-{}", Uuid::new_v4());
    sqlx::query("INSERT INTO users (id, external_id, username, display_name, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(user_id).bind(&external_id).bind(&external_id).bind("Test User")
        .execute(db).await.unwrap();
    user_id
}

async fn create_session(db: &PgPool, user_id: Uuid) -> Uuid {
    let org_id = Uuid::new_v4();
    sqlx::query("INSERT INTO organizations (id, name, slug, created_at) VALUES ($1, $2, $3, NOW())")
        .bind(org_id).bind("Org").bind(format!("org-{}", Uuid::new_v4()))
        .execute(db).await.unwrap();

    let project_id = Uuid::new_v4();
    sqlx::query("INSERT INTO projects (id, org_id, name, slug, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(project_id).bind(org_id).bind("Proj").bind(format!("proj-{}", Uuid::new_v4()))
        .execute(db).await.unwrap();

    let session_id = Uuid::new_v4();
    sqlx::query("INSERT INTO sessions (id, project_id, code, created_by, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(session_id).bind(project_id).bind(format!("T{}", &Uuid::new_v4().to_string()[..5]).to_uppercase()).bind(user_id)
        .execute(db).await.unwrap();

    session_id
}

#[tokio::test]
async fn test_create_and_validate_token() {
    let db = setup_db().await;
    let user_id = create_user(&db).await;
    let session_id = create_session(&db, user_id).await;

    let raw_token = format!("sat_{}", hex::encode(Uuid::new_v4().as_bytes()));
    let token_hash = hash_token(&raw_token);

    sqlx::query(
        "INSERT INTO agent_tokens (token_hash, user_id, session_id, display_name, expires_at)
         VALUES ($1, $2, $3, $4, NOW() + INTERVAL '1 hour')"
    )
    .bind(&token_hash).bind(user_id).bind(session_id).bind("Test Agent")
    .execute(&db).await.unwrap();

    // Look up by hash (mimics validate_token)
    let row: Option<(Uuid, Option<Uuid>, String)> = sqlx::query_as(
        "SELECT t.user_id, t.session_id, t.display_name
         FROM agent_tokens t
         WHERE t.token_hash = $1 AND t.expires_at > NOW() AND t.revoked_at IS NULL"
    )
    .bind(&token_hash)
    .fetch_optional(&db).await.unwrap();

    assert!(row.is_some());
    let (uid, sid, name) = row.unwrap();
    assert_eq!(uid, user_id);
    assert_eq!(sid, Some(session_id));
    assert_eq!(name, "Test Agent");
}

#[tokio::test]
async fn test_invalid_hash_returns_nothing() {
    let db = setup_db().await;

    let row: Option<(Uuid,)> = sqlx::query_as(
        "SELECT user_id FROM agent_tokens WHERE token_hash = $1 AND expires_at > NOW() AND revoked_at IS NULL"
    )
    .bind("nonexistent_hash_value")
    .fetch_optional(&db).await.unwrap();

    assert!(row.is_none());
}

#[tokio::test]
async fn test_expired_token_not_found() {
    let db = setup_db().await;
    let user_id = create_user(&db).await;

    let raw_token = format!("sat_{}", hex::encode(Uuid::new_v4().as_bytes()));
    let token_hash = hash_token(&raw_token);

    // Insert already-expired token
    sqlx::query(
        "INSERT INTO agent_tokens (token_hash, user_id, display_name, expires_at)
         VALUES ($1, $2, $3, NOW() - INTERVAL '1 second')"
    )
    .bind(&token_hash).bind(user_id).bind("Expired Agent")
    .execute(&db).await.unwrap();

    let row: Option<(Uuid,)> = sqlx::query_as(
        "SELECT user_id FROM agent_tokens WHERE token_hash = $1 AND expires_at > NOW() AND revoked_at IS NULL"
    )
    .bind(&token_hash)
    .fetch_optional(&db).await.unwrap();

    assert!(row.is_none(), "Expired token should not be found");
}

#[tokio::test]
async fn test_revoke_token() {
    let db = setup_db().await;
    let user_id = create_user(&db).await;

    let raw_token = format!("sat_{}", hex::encode(Uuid::new_v4().as_bytes()));
    let token_hash = hash_token(&raw_token);

    sqlx::query(
        "INSERT INTO agent_tokens (token_hash, user_id, display_name, expires_at)
         VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour')"
    )
    .bind(&token_hash).bind(user_id).bind("Revocable Agent")
    .execute(&db).await.unwrap();

    // Get token ID
    let token_id: Uuid = sqlx::query_scalar("SELECT id FROM agent_tokens WHERE token_hash = $1")
        .bind(&token_hash).fetch_one(&db).await.unwrap();

    // Revoke
    let result = sqlx::query("UPDATE agent_tokens SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL")
        .bind(token_id).execute(&db).await.unwrap();
    assert_eq!(result.rows_affected(), 1);

    // Should no longer be found
    let row: Option<(Uuid,)> = sqlx::query_as(
        "SELECT user_id FROM agent_tokens WHERE token_hash = $1 AND expires_at > NOW() AND revoked_at IS NULL"
    )
    .bind(&token_hash)
    .fetch_optional(&db).await.unwrap();

    assert!(row.is_none(), "Revoked token should not be found");

    // Double-revoke should affect 0 rows
    let result = sqlx::query("UPDATE agent_tokens SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL")
        .bind(token_id).execute(&db).await.unwrap();
    assert_eq!(result.rows_affected(), 0);
}

#[tokio::test]
async fn test_revoke_session_tokens() {
    let db = setup_db().await;
    let user_id = create_user(&db).await;
    let session_id = create_session(&db, user_id).await;

    // Create two session-scoped tokens
    for name in &["Agent A", "Agent B"] {
        let raw = format!("sat_{}", hex::encode(Uuid::new_v4().as_bytes()));
        sqlx::query(
            "INSERT INTO agent_tokens (token_hash, user_id, session_id, display_name, expires_at)
             VALUES ($1, $2, $3, $4, NOW() + INTERVAL '1 hour')"
        )
        .bind(hash_token(&raw)).bind(user_id).bind(session_id).bind(*name)
        .execute(&db).await.unwrap();
    }

    // Create one unscoped token
    let unscoped_raw = format!("sat_{}", hex::encode(Uuid::new_v4().as_bytes()));
    let unscoped_hash = hash_token(&unscoped_raw);
    sqlx::query(
        "INSERT INTO agent_tokens (token_hash, user_id, display_name, expires_at)
         VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour')"
    )
    .bind(&unscoped_hash).bind(user_id).bind("Unscoped Agent")
    .execute(&db).await.unwrap();

    // Revoke all session tokens
    let result = sqlx::query("UPDATE agent_tokens SET revoked_at = NOW() WHERE session_id = $1 AND revoked_at IS NULL")
        .bind(session_id).execute(&db).await.unwrap();
    assert_eq!(result.rows_affected(), 2);

    // Unscoped token should still be valid
    let row: Option<(Uuid,)> = sqlx::query_as(
        "SELECT user_id FROM agent_tokens WHERE token_hash = $1 AND expires_at > NOW() AND revoked_at IS NULL"
    )
    .bind(&unscoped_hash)
    .fetch_optional(&db).await.unwrap();
    assert!(row.is_some(), "Unscoped token should survive session revocation");
}

#[tokio::test]
async fn test_token_hash_uniqueness() {
    let db = setup_db().await;
    let user_id = create_user(&db).await;

    let token_hash = hash_token("sat_duplicate_test");

    sqlx::query(
        "INSERT INTO agent_tokens (token_hash, user_id, display_name, expires_at)
         VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour')"
    )
    .bind(&token_hash).bind(user_id).bind("First")
    .execute(&db).await.unwrap();

    // Duplicate hash should fail (unique constraint)
    let result = sqlx::query(
        "INSERT INTO agent_tokens (token_hash, user_id, display_name, expires_at)
         VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour')"
    )
    .bind(&token_hash).bind(user_id).bind("Duplicate")
    .execute(&db).await;

    assert!(result.is_err(), "Duplicate token hash should be rejected");
}
