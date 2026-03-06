//! Integration tests for participant composition metadata.
//! Tests agent composition fields, disconnection tracking, sponsor relationships.
//! Requires Docker Compose running (Postgres on :5433).

use sqlx::PgPool;
use uuid::Uuid;

async fn setup_db() -> PgPool {
    let url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://seam:seam@localhost:5433/seam".to_string());
    let db = PgPool::connect(&url).await.expect("Failed to connect to test database");
    sqlx::migrate!("./migrations").run(&db).await.expect("Failed to run migrations");
    db
}

struct TestContext {
    session_id: Uuid,
    user_id: Uuid,
}

async fn create_test_context(db: &PgPool) -> TestContext {
    let user_id = Uuid::new_v4();
    let external_id = format!("test-{}", Uuid::new_v4());
    sqlx::query("INSERT INTO users (id, external_id, username, display_name, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(user_id).bind(&external_id).bind(&external_id).bind("Test User")
        .execute(db).await.unwrap();

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
        .bind(session_id).bind(project_id)
        .bind(format!("PT{}", &Uuid::new_v4().to_string()[..4]).to_uppercase())
        .bind(user_id)
        .execute(db).await.unwrap();

    TestContext { session_id, user_id }
}

#[tokio::test]
async fn test_human_participant() {
    let db = setup_db().await;
    let ctx = create_test_context(&db).await;

    let pid = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO participants (id, session_id, user_id, display_name, participant_type, joined_at)
         VALUES ($1, $2, $3, $4, 'human', NOW())"
    )
    .bind(pid).bind(ctx.session_id).bind(ctx.user_id).bind("Alice")
    .execute(&db).await.unwrap();

    let (ptype, name): (String, String) = sqlx::query_as(
        "SELECT participant_type, display_name FROM participants WHERE id = $1"
    )
    .bind(pid)
    .fetch_one(&db).await.unwrap();

    assert_eq!(ptype, "human");
    assert_eq!(name, "Alice");
}

#[tokio::test]
async fn test_agent_composition_metadata() {
    let db = setup_db().await;
    let ctx = create_test_context(&db).await;

    let pid = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO participants (id, session_id, user_id, display_name, participant_type, client_name, client_version, model, joined_at)
         VALUES ($1, $2, $3, $4, 'agent', $5, $6, $7, NOW())"
    )
    .bind(pid).bind(ctx.session_id).bind(ctx.user_id)
    .bind("Claude Agent")
    .bind("claude-code").bind("1.0.0").bind("claude-sonnet-4-20250514")
    .execute(&db).await.unwrap();

    let (client_name, client_version, model): (Option<String>, Option<String>, Option<String>) =
        sqlx::query_as(
            "SELECT client_name, client_version, model FROM participants WHERE id = $1"
        )
        .bind(pid)
        .fetch_one(&db).await.unwrap();

    assert_eq!(client_name, Some("claude-code".to_string()));
    assert_eq!(client_version, Some("1.0.0".to_string()));
    assert_eq!(model, Some("claude-sonnet-4-20250514".to_string()));
}

#[tokio::test]
async fn test_agent_sponsor_relationship() {
    let db = setup_db().await;
    let ctx = create_test_context(&db).await;

    // Create human sponsor
    let human_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO participants (id, session_id, user_id, display_name, participant_type, joined_at)
         VALUES ($1, $2, $3, $4, 'human', NOW())"
    )
    .bind(human_id).bind(ctx.session_id).bind(ctx.user_id).bind("Human Sponsor")
    .execute(&db).await.unwrap();

    // Create agent with sponsor
    let agent_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO participants (id, session_id, user_id, display_name, participant_type, sponsor_id, joined_at)
         VALUES ($1, $2, $3, $4, 'agent', $5, NOW())"
    )
    .bind(agent_id).bind(ctx.session_id).bind(ctx.user_id)
    .bind("Sponsored Agent").bind(human_id)
    .execute(&db).await.unwrap();

    let sponsor: Option<Uuid> = sqlx::query_scalar(
        "SELECT sponsor_id FROM participants WHERE id = $1"
    )
    .bind(agent_id)
    .fetch_one(&db).await.unwrap();

    assert_eq!(sponsor, Some(human_id));

    // Query agents by sponsor
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM participants WHERE sponsor_id = $1 AND participant_type = 'agent'"
    )
    .bind(human_id)
    .fetch_one(&db).await.unwrap();

    assert_eq!(count, 1);
}

#[tokio::test]
async fn test_agent_disconnection_tracking() {
    let db = setup_db().await;
    let ctx = create_test_context(&db).await;

    let pid = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO participants (id, session_id, user_id, display_name, participant_type, joined_at)
         VALUES ($1, $2, $3, $4, 'agent', NOW())"
    )
    .bind(pid).bind(ctx.session_id).bind(ctx.user_id).bind("Disconnectable Agent")
    .execute(&db).await.unwrap();

    // Initially no disconnected_at
    let disconnected: Option<chrono::DateTime<chrono::Utc>> = sqlx::query_scalar(
        "SELECT disconnected_at FROM participants WHERE id = $1"
    )
    .bind(pid)
    .fetch_one(&db).await.unwrap();
    assert!(disconnected.is_none());

    // Mark as disconnected
    sqlx::query("UPDATE participants SET disconnected_at = NOW() WHERE id = $1")
        .bind(pid).execute(&db).await.unwrap();

    let disconnected: Option<chrono::DateTime<chrono::Utc>> = sqlx::query_scalar(
        "SELECT disconnected_at FROM participants WHERE id = $1"
    )
    .bind(pid)
    .fetch_one(&db).await.unwrap();
    assert!(disconnected.is_some());

    // Query for active (non-disconnected) agents
    let active_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM participants WHERE session_id = $1 AND participant_type = 'agent' AND disconnected_at IS NULL"
    )
    .bind(ctx.session_id)
    .fetch_one(&db).await.unwrap();
    assert_eq!(active_count, 0);
}

#[tokio::test]
async fn test_participant_metadata_jsonb() {
    let db = setup_db().await;
    let ctx = create_test_context(&db).await;

    let pid = Uuid::new_v4();
    let meta = serde_json::json!({
        "capabilities": ["code", "review"],
        "max_context": 200000
    });

    sqlx::query(
        "INSERT INTO participants (id, session_id, user_id, display_name, participant_type, metadata, joined_at)
         VALUES ($1, $2, $3, $4, 'agent', $5, NOW())"
    )
    .bind(pid).bind(ctx.session_id).bind(ctx.user_id)
    .bind("Meta Agent").bind(&meta)
    .execute(&db).await.unwrap();

    let stored: serde_json::Value = sqlx::query_scalar(
        "SELECT metadata FROM participants WHERE id = $1"
    )
    .bind(pid)
    .fetch_one(&db).await.unwrap();

    assert_eq!(stored["max_context"], 200000);
    assert_eq!(stored["capabilities"][0], "code");
}

#[tokio::test]
async fn test_multiple_agents_per_session() {
    let db = setup_db().await;
    let ctx = create_test_context(&db).await;

    // Create 3 agents from the same user (different processes)
    for i in 0..3 {
        let pid = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO participants (id, session_id, user_id, display_name, participant_type, client_name, model, joined_at)
             VALUES ($1, $2, $3, $4, 'agent', $5, $6, NOW())"
        )
        .bind(pid).bind(ctx.session_id).bind(ctx.user_id)
        .bind(format!("Agent {i}"))
        .bind("claude-code")
        .bind(format!("model-{i}"))
        .execute(&db).await.unwrap();
    }

    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM participants WHERE session_id = $1 AND participant_type = 'agent'"
    )
    .bind(ctx.session_id)
    .fetch_one(&db).await.unwrap();

    assert_eq!(count, 3, "Multiple agents from same user should be allowed");
}

#[tokio::test]
async fn test_participant_cascade_on_session_delete() {
    let db = setup_db().await;
    let ctx = create_test_context(&db).await;

    sqlx::query(
        "INSERT INTO participants (id, session_id, user_id, display_name, participant_type, joined_at)
         VALUES ($1, $2, $3, $4, 'human', NOW())"
    )
    .bind(Uuid::new_v4()).bind(ctx.session_id).bind(ctx.user_id).bind("Cascade Test")
    .execute(&db).await.unwrap();

    sqlx::query("DELETE FROM sessions WHERE id = $1")
        .bind(ctx.session_id)
        .execute(&db).await.unwrap();

    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM participants WHERE session_id = $1"
    )
    .bind(ctx.session_id)
    .fetch_one(&db).await.unwrap();

    assert_eq!(count, 0, "Participants should cascade-delete with session");
}
