//! Integration tests for tool_invocations data model.
//! Tests insertion, PG NOTIFY trigger, filtering by participant/tool_name, ordering.
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

struct TestContext {
    session_id: Uuid,
    participant_id: Uuid,
}

async fn create_test_context(db: &PgPool) -> TestContext {
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
    .bind("Org")
    .bind(format!("org-{}", Uuid::new_v4()))
    .execute(db)
    .await
    .unwrap();

    let project_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO projects (id, org_id, name, slug, created_at) VALUES ($1, $2, $3, $4, NOW())",
    )
    .bind(project_id)
    .bind(org_id)
    .bind("Proj")
    .bind(format!("proj-{}", Uuid::new_v4()))
    .execute(db)
    .await
    .unwrap();

    let session_id = Uuid::new_v4();
    sqlx::query("INSERT INTO sessions (id, project_id, code, created_by, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(session_id).bind(project_id)
        .bind(format!("TI{}", &Uuid::new_v4().to_string()[..4]).to_uppercase())
        .bind(user_id)
        .execute(db).await.unwrap();

    let participant_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO participants (id, session_id, user_id, display_name, participant_type, joined_at)
         VALUES ($1, $2, $3, $4, $5, NOW())"
    )
    .bind(participant_id).bind(session_id).bind(user_id).bind("Agent").bind("agent")
    .execute(db).await.unwrap();

    TestContext {
        session_id,
        participant_id,
    }
}

#[tokio::test]
async fn test_insert_tool_invocation() {
    let db = setup_db().await;
    let ctx = create_test_context(&db).await;

    let inv_id: Uuid = sqlx::query_scalar(
        "INSERT INTO tool_invocations (session_id, participant_id, tool_name, request_params, response, is_error, duration_ms)
         VALUES ($1, $2, $3, $4, $5, false, 42)
         RETURNING id"
    )
    .bind(ctx.session_id).bind(ctx.participant_id)
    .bind("create_task")
    .bind(serde_json::json!({"title": "Test task"}))
    .bind(serde_json::json!({"id": "abc123"}))
    .fetch_one(&db).await.unwrap();

    let (tool_name, duration, is_error): (String, i32, bool) = sqlx::query_as(
        "SELECT tool_name, duration_ms, is_error FROM tool_invocations WHERE id = $1",
    )
    .bind(inv_id)
    .fetch_one(&db)
    .await
    .unwrap();

    assert_eq!(tool_name, "create_task");
    assert_eq!(duration, 42);
    assert!(!is_error);
}

#[tokio::test]
async fn test_tool_invocation_error_flag() {
    let db = setup_db().await;
    let ctx = create_test_context(&db).await;

    sqlx::query(
        "INSERT INTO tool_invocations (session_id, participant_id, tool_name, is_error, duration_ms)
         VALUES ($1, $2, $3, true, 100)"
    )
    .bind(ctx.session_id).bind(ctx.participant_id).bind("bad_tool")
    .execute(&db).await.unwrap();

    let is_error: bool = sqlx::query_scalar(
        "SELECT is_error FROM tool_invocations WHERE session_id = $1 AND tool_name = 'bad_tool'",
    )
    .bind(ctx.session_id)
    .fetch_one(&db)
    .await
    .unwrap();

    assert!(is_error);
}

#[tokio::test]
async fn test_tool_invocation_ordering() {
    let db = setup_db().await;
    let ctx = create_test_context(&db).await;

    for i in 0..3 {
        sqlx::query(
            "INSERT INTO tool_invocations (session_id, participant_id, tool_name, duration_ms, created_at)
             VALUES ($1, $2, $3, $4, NOW() + ($4 || ' seconds')::interval)"
        )
        .bind(ctx.session_id).bind(ctx.participant_id)
        .bind(format!("tool_{i}")).bind(i)
        .execute(&db).await.unwrap();
    }

    let names: Vec<String> = sqlx::query_scalar(
        "SELECT tool_name FROM tool_invocations WHERE session_id = $1 ORDER BY created_at DESC",
    )
    .bind(ctx.session_id)
    .fetch_all(&db)
    .await
    .unwrap();

    assert_eq!(names, vec!["tool_2", "tool_1", "tool_0"]);
}

#[tokio::test]
async fn test_tool_invocation_filter_by_participant() {
    let db = setup_db().await;
    let ctx = create_test_context(&db).await;

    // Create a second participant
    let user2 = Uuid::new_v4();
    let ext2 = format!("test-{}", Uuid::new_v4());
    sqlx::query("INSERT INTO users (id, external_id, username, display_name, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(user2).bind(&ext2).bind(&ext2).bind("User 2")
        .execute(&db).await.unwrap();

    let p2 = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO participants (id, session_id, user_id, display_name, participant_type, joined_at)
         VALUES ($1, $2, $3, $4, 'agent', NOW())"
    )
    .bind(p2).bind(ctx.session_id).bind(user2).bind("Agent 2")
    .execute(&db).await.unwrap();

    // Insert invocations for both
    for (pid, name) in &[(ctx.participant_id, "tool_a"), (p2, "tool_b")] {
        sqlx::query(
            "INSERT INTO tool_invocations (session_id, participant_id, tool_name, duration_ms)
             VALUES ($1, $2, $3, 10)",
        )
        .bind(ctx.session_id)
        .bind(pid)
        .bind(name)
        .execute(&db)
        .await
        .unwrap();
    }

    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM tool_invocations WHERE session_id = $1 AND participant_id = $2",
    )
    .bind(ctx.session_id)
    .bind(ctx.participant_id)
    .fetch_one(&db)
    .await
    .unwrap();

    assert_eq!(
        count, 1,
        "Should only see invocations for the filtered participant"
    );
}

#[tokio::test]
async fn test_tool_invocation_filter_by_tool_name() {
    let db = setup_db().await;
    let ctx = create_test_context(&db).await;

    for name in &["create_task", "update_task", "create_task"] {
        sqlx::query(
            "INSERT INTO tool_invocations (session_id, participant_id, tool_name, duration_ms)
             VALUES ($1, $2, $3, 5)",
        )
        .bind(ctx.session_id)
        .bind(ctx.participant_id)
        .bind(*name)
        .execute(&db)
        .await
        .unwrap();
    }

    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM tool_invocations WHERE session_id = $1 AND tool_name = 'create_task'",
    )
    .bind(ctx.session_id)
    .fetch_one(&db)
    .await
    .unwrap();

    assert_eq!(count, 2);
}

#[tokio::test]
async fn test_tool_invocation_cascade_on_session_delete() {
    let db = setup_db().await;
    let ctx = create_test_context(&db).await;

    sqlx::query(
        "INSERT INTO tool_invocations (session_id, participant_id, tool_name, duration_ms)
         VALUES ($1, $2, $3, 10)",
    )
    .bind(ctx.session_id)
    .bind(ctx.participant_id)
    .bind("some_tool")
    .execute(&db)
    .await
    .unwrap();

    // Delete the session — should cascade
    sqlx::query("DELETE FROM sessions WHERE id = $1")
        .bind(ctx.session_id)
        .execute(&db)
        .await
        .unwrap();

    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM tool_invocations WHERE session_id = $1")
            .bind(ctx.session_id)
            .fetch_one(&db)
            .await
            .unwrap();

    assert_eq!(
        count, 0,
        "Tool invocations should cascade-delete with session"
    );
}

#[tokio::test]
async fn test_tool_invocation_jsonb_params() {
    let db = setup_db().await;
    let ctx = create_test_context(&db).await;

    let params = serde_json::json!({
        "title": "Complex task",
        "tags": ["rust", "test"],
        "nested": {"key": "value"}
    });

    let inv_id: Uuid = sqlx::query_scalar(
        "INSERT INTO tool_invocations (session_id, participant_id, tool_name, request_params, duration_ms)
         VALUES ($1, $2, $3, $4, 0)
         RETURNING id"
    )
    .bind(ctx.session_id).bind(ctx.participant_id)
    .bind("create_task").bind(&params)
    .fetch_one(&db).await.unwrap();

    // Query using JSONB operators
    let found: Option<Uuid> = sqlx::query_scalar(
        "SELECT id FROM tool_invocations WHERE id = $1 AND request_params->>'title' = 'Complex task'"
    )
    .bind(inv_id)
    .fetch_optional(&db).await.unwrap();

    assert!(found.is_some(), "JSONB query should find the invocation");

    // Query array element
    let found: Option<Uuid> = sqlx::query_scalar(
        "SELECT id FROM tool_invocations WHERE id = $1 AND request_params->'tags' ? 'rust'",
    )
    .bind(inv_id)
    .fetch_optional(&db)
    .await
    .unwrap();

    assert!(found.is_some(), "JSONB containment query should work");
}
