//! Integration tests for the session and participant data model.
//! Requires Docker Compose running (Postgres on :5433).

use sqlx::PgPool;
use uuid::Uuid;

async fn setup_db() -> PgPool {
    let url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://seam:seam@localhost:5433/seam".to_string());
    let db = PgPool::connect(&url)
        .await
        .expect("Failed to connect to test database");
    sqlx::migrate!("./migrations")
        .run(&db)
        .await
        .expect("Failed to run migrations");
    db
}

/// Create a test user, org, and project. Returns (user_id, org_id, project_id).
async fn create_test_context(db: &PgPool) -> (Uuid, Uuid, Uuid) {
    let user_id = Uuid::new_v4();
    let external_id = format!("test-{}", Uuid::new_v4());
    sqlx::query("INSERT INTO users (id, external_id, username, display_name, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(user_id).bind(&external_id).bind(&external_id).bind("Test User")
        .execute(db).await.unwrap();

    let org_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO organizations (id, name, slug, created_at) VALUES ($1, $2, $3, NOW())",
    )
    .bind(org_id)
    .bind("Test Org")
    .bind(format!("test-org-{}", Uuid::new_v4()))
    .execute(db)
    .await
    .unwrap();

    let project_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO projects (id, org_id, name, slug, created_at) VALUES ($1, $2, $3, $4, NOW())",
    )
    .bind(project_id)
    .bind(org_id)
    .bind("Test Project")
    .bind(format!("test-proj-{}", Uuid::new_v4()))
    .execute(db)
    .await
    .unwrap();

    (user_id, org_id, project_id)
}

#[tokio::test]
async fn test_create_session() {
    let db = setup_db().await;
    let (user_id, _org_id, project_id) = create_test_context(&db).await;

    let session_id = Uuid::new_v4();
    let code = format!("S{}", &Uuid::new_v4().to_string()[..5]).to_uppercase();
    sqlx::query(
        "INSERT INTO sessions (id, project_id, code, name, created_by, created_at) VALUES ($1, $2, $3, $4, $5, NOW())"
    )
    .bind(session_id).bind(project_id).bind(&code).bind("Sprint Planning").bind(user_id)
    .execute(&db).await.unwrap();

    let row: (Uuid, String, Option<String>, Uuid) =
        sqlx::query_as("SELECT project_id, code, name, created_by FROM sessions WHERE id = $1")
            .bind(session_id)
            .fetch_one(&db)
            .await
            .unwrap();

    assert_eq!(row.0, project_id);
    assert_eq!(row.1, code);
    assert_eq!(row.2, Some("Sprint Planning".to_string()));
    assert_eq!(row.3, user_id);
}

#[tokio::test]
async fn test_session_code_uniqueness() {
    let db = setup_db().await;
    let (user_id, _org_id, project_id) = create_test_context(&db).await;

    let code = format!("U{}", &Uuid::new_v4().to_string()[..5]).to_uppercase();

    sqlx::query("INSERT INTO sessions (id, project_id, code, created_by, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(Uuid::new_v4()).bind(project_id).bind(&code).bind(user_id)
        .execute(&db).await.unwrap();

    // Duplicate code should fail
    let result = sqlx::query("INSERT INTO sessions (id, project_id, code, created_by, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(Uuid::new_v4()).bind(project_id).bind(&code).bind(user_id)
        .execute(&db).await;

    assert!(
        result.is_err(),
        "Duplicate session code should be rejected by unique constraint"
    );
}

#[tokio::test]
async fn test_participant_join() {
    let db = setup_db().await;
    let (user_id, _org_id, project_id) = create_test_context(&db).await;

    let session_id = Uuid::new_v4();
    let code = format!("P{}", &Uuid::new_v4().to_string()[..5]).to_uppercase();
    sqlx::query("INSERT INTO sessions (id, project_id, code, created_by, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(session_id).bind(project_id).bind(&code).bind(user_id)
        .execute(&db).await.unwrap();

    let participant_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO participants (id, session_id, user_id, display_name, participant_type, joined_at) VALUES ($1, $2, $3, $4, 'human', NOW())"
    )
    .bind(participant_id).bind(session_id).bind(user_id).bind("Alice")
    .execute(&db).await.unwrap();

    let row: (Uuid, Uuid, String, String) = sqlx::query_as(
        "SELECT session_id, user_id, display_name, participant_type FROM participants WHERE id = $1"
    )
    .bind(participant_id)
    .fetch_one(&db).await.unwrap();

    assert_eq!(row.0, session_id);
    assert_eq!(row.1, user_id);
    assert_eq!(row.2, "Alice");
    assert_eq!(row.3, "human");
}

#[tokio::test]
async fn test_agent_participant() {
    let db = setup_db().await;
    let (user_id, _org_id, project_id) = create_test_context(&db).await;

    let session_id = Uuid::new_v4();
    let code = format!("A{}", &Uuid::new_v4().to_string()[..5]).to_uppercase();
    sqlx::query("INSERT INTO sessions (id, project_id, code, created_by, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(session_id).bind(project_id).bind(&code).bind(user_id)
        .execute(&db).await.unwrap();

    // Create human sponsor first
    let sponsor_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO participants (id, session_id, user_id, display_name, participant_type, joined_at) VALUES ($1, $2, $3, $4, 'human', NOW())"
    )
    .bind(sponsor_id).bind(session_id).bind(user_id).bind("Human Sponsor")
    .execute(&db).await.unwrap();

    // Create agent participant with sponsor
    let agent_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO participants (id, session_id, user_id, display_name, participant_type, sponsor_id, joined_at) VALUES ($1, $2, $3, $4, 'agent', $5, NOW())"
    )
    .bind(agent_id).bind(session_id).bind(user_id).bind("Claude Agent").bind(sponsor_id)
    .execute(&db).await.unwrap();

    let row: (String, Option<Uuid>) =
        sqlx::query_as("SELECT participant_type, sponsor_id FROM participants WHERE id = $1")
            .bind(agent_id)
            .fetch_one(&db)
            .await
            .unwrap();

    assert_eq!(row.0, "agent");
    assert_eq!(row.1, Some(sponsor_id));
}

#[tokio::test]
async fn test_agent_join_code() {
    let db = setup_db().await;
    let (user_id, _org_id, project_id) = create_test_context(&db).await;

    let session_id = Uuid::new_v4();
    let session_code = format!("J{}", &Uuid::new_v4().to_string()[..5]).to_uppercase();
    sqlx::query("INSERT INTO sessions (id, project_id, code, created_by, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(session_id).bind(project_id).bind(&session_code).bind(user_id)
        .execute(&db).await.unwrap();

    // Create an agent join code
    let ajc_id = Uuid::new_v4();
    let agent_code = format!("AJ{}", &Uuid::new_v4().to_string()[..6]).to_uppercase();
    sqlx::query(
        "INSERT INTO agent_join_codes (id, session_id, user_id, code, created_at) VALUES ($1, $2, $3, $4, NOW())"
    )
    .bind(ajc_id).bind(session_id).bind(user_id).bind(&agent_code)
    .execute(&db).await.unwrap();

    // Look up by code
    let row: (Uuid, Uuid, Uuid) =
        sqlx::query_as("SELECT id, session_id, user_id FROM agent_join_codes WHERE code = $1")
            .bind(&agent_code)
            .fetch_one(&db)
            .await
            .unwrap();

    assert_eq!(row.0, ajc_id);
    assert_eq!(row.1, session_id);
    assert_eq!(row.2, user_id);

    // Duplicate code should fail (UNIQUE constraint on code)
    let result = sqlx::query(
        "INSERT INTO agent_join_codes (id, session_id, user_id, code, created_at) VALUES ($1, $2, $3, $4, NOW())"
    )
    .bind(Uuid::new_v4()).bind(session_id).bind(user_id).bind(&agent_code)
    .execute(&db).await;

    assert!(
        result.is_err(),
        "Duplicate agent join code should be rejected by unique constraint"
    );
}

#[tokio::test]
async fn test_session_close() {
    let db = setup_db().await;
    let (user_id, _org_id, project_id) = create_test_context(&db).await;

    let session_id = Uuid::new_v4();
    let code = format!("C{}", &Uuid::new_v4().to_string()[..5]).to_uppercase();
    sqlx::query("INSERT INTO sessions (id, project_id, code, created_by, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(session_id).bind(project_id).bind(&code).bind(user_id)
        .execute(&db).await.unwrap();

    // Session should appear in open sessions
    let open: Vec<(Uuid,)> =
        sqlx::query_as("SELECT id FROM sessions WHERE project_id = $1 AND closed_at IS NULL")
            .bind(project_id)
            .fetch_all(&db)
            .await
            .unwrap();
    assert!(
        open.iter().any(|r| r.0 == session_id),
        "Session should be in open sessions"
    );

    // Close the session
    sqlx::query("UPDATE sessions SET closed_at = NOW() WHERE id = $1")
        .bind(session_id)
        .execute(&db)
        .await
        .unwrap();

    // Session should no longer appear in open sessions
    let open_after: Vec<(Uuid,)> =
        sqlx::query_as("SELECT id FROM sessions WHERE project_id = $1 AND closed_at IS NULL")
            .bind(project_id)
            .fetch_all(&db)
            .await
            .unwrap();
    assert!(
        !open_after.iter().any(|r| r.0 == session_id),
        "Closed session should not appear in open sessions query"
    );

    // But it should still exist
    let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM sessions WHERE id = $1)")
        .bind(session_id)
        .fetch_one(&db)
        .await
        .unwrap();
    assert!(exists, "Closed session should still exist in the table");
}
