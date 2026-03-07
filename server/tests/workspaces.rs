//! Integration tests for the workspaces data model.
//! Tests workspace lifecycle, status transitions, one-active-per-task constraint.
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
    project_id: Uuid,
    task_id: Uuid,
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
        .bind(format!("WS{}", &Uuid::new_v4().to_string()[..4]).to_uppercase())
        .bind(user_id)
        .execute(db).await.unwrap();

    let participant_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO participants (id, session_id, user_id, display_name, participant_type, joined_at)
         VALUES ($1, $2, $3, $4, 'human', NOW())"
    )
    .bind(participant_id).bind(session_id).bind(user_id).bind("Human")
    .execute(db).await.unwrap();

    let task_id = Uuid::new_v4();
    let ticket_num: i32 = rand::random::<u16>() as i32 + 1;
    sqlx::query(
        "INSERT INTO tasks (id, session_id, project_id, ticket_number, task_type, title, status, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'task', $5, 'open', $6, NOW(), NOW())"
    )
    .bind(task_id).bind(session_id).bind(project_id).bind(ticket_num)
    .bind("Test Task").bind(participant_id)
    .execute(db).await.unwrap();

    TestContext {
        project_id,
        task_id,
    }
}

#[tokio::test]
async fn test_create_workspace() {
    let db = setup_db().await;
    let ctx = create_test_context(&db).await;

    let ws_id: Uuid = sqlx::query_scalar(
        "INSERT INTO workspaces (task_id, project_id, template_name, branch, status)
         VALUES ($1, $2, 'seam-agent', 'agent/coder-test', 'pending')
         RETURNING id",
    )
    .bind(ctx.task_id)
    .bind(ctx.project_id)
    .fetch_one(&db)
    .await
    .unwrap();

    let (status, template, branch): (String, String, Option<String>) =
        sqlx::query_as("SELECT status, template_name, branch FROM workspaces WHERE id = $1")
            .bind(ws_id)
            .fetch_one(&db)
            .await
            .unwrap();

    assert_eq!(status, "pending");
    assert_eq!(template, "seam-agent");
    assert_eq!(branch, Some("agent/coder-test".to_string()));
}

#[tokio::test]
async fn test_workspace_status_transitions() {
    let db = setup_db().await;
    let ctx = create_test_context(&db).await;

    let ws_id: Uuid = sqlx::query_scalar(
        "INSERT INTO workspaces (task_id, project_id, template_name, status)
         VALUES ($1, $2, 'seam-agent', 'pending')
         RETURNING id",
    )
    .bind(ctx.task_id)
    .bind(ctx.project_id)
    .fetch_one(&db)
    .await
    .unwrap();

    // pending -> creating -> running -> stopping -> stopped -> destroyed
    for next_status in &["creating", "running", "stopping", "stopped", "destroyed"] {
        sqlx::query("UPDATE workspaces SET status = $2, updated_at = NOW() WHERE id = $1")
            .bind(ws_id)
            .bind(*next_status)
            .execute(&db)
            .await
            .unwrap();

        let status: String = sqlx::query_scalar("SELECT status FROM workspaces WHERE id = $1")
            .bind(ws_id)
            .fetch_one(&db)
            .await
            .unwrap();
        assert_eq!(status, *next_status);
    }
}

#[tokio::test]
async fn test_workspace_invalid_status() {
    let db = setup_db().await;
    let ctx = create_test_context(&db).await;

    let result = sqlx::query(
        "INSERT INTO workspaces (task_id, project_id, template_name, status)
         VALUES ($1, $2, 'seam-agent', 'invalid_status')",
    )
    .bind(ctx.task_id)
    .bind(ctx.project_id)
    .execute(&db)
    .await;

    assert!(
        result.is_err(),
        "Invalid status should be rejected by CHECK constraint"
    );
}

#[tokio::test]
async fn test_workspace_failed_with_error_message() {
    let db = setup_db().await;
    let ctx = create_test_context(&db).await;

    let ws_id: Uuid = sqlx::query_scalar(
        "INSERT INTO workspaces (task_id, project_id, template_name, status)
         VALUES ($1, $2, 'seam-agent', 'pending')
         RETURNING id",
    )
    .bind(ctx.task_id)
    .bind(ctx.project_id)
    .fetch_one(&db)
    .await
    .unwrap();

    sqlx::query(
        "UPDATE workspaces SET status = 'failed', error_message = $2, updated_at = NOW() WHERE id = $1"
    )
    .bind(ws_id).bind("Template 'seam-agent' not found")
    .execute(&db).await.unwrap();

    let (status, error): (String, Option<String>) =
        sqlx::query_as("SELECT status, error_message FROM workspaces WHERE id = $1")
            .bind(ws_id)
            .fetch_one(&db)
            .await
            .unwrap();

    assert_eq!(status, "failed");
    assert_eq!(error, Some("Template 'seam-agent' not found".to_string()));
}

#[tokio::test]
async fn test_workspace_unique_per_task() {
    let db = setup_db().await;
    let ctx = create_test_context(&db).await;

    // First workspace succeeds
    sqlx::query(
        "INSERT INTO workspaces (task_id, project_id, template_name, status)
         VALUES ($1, $2, 'seam-agent', 'pending')",
    )
    .bind(ctx.task_id)
    .bind(ctx.project_id)
    .execute(&db)
    .await
    .unwrap();

    // Second workspace for same task should fail (UNIQUE constraint)
    let result = sqlx::query(
        "INSERT INTO workspaces (task_id, project_id, template_name, status)
         VALUES ($1, $2, 'seam-agent', 'pending')",
    )
    .bind(ctx.task_id)
    .bind(ctx.project_id)
    .execute(&db)
    .await;

    assert!(
        result.is_err(),
        "Should not allow two workspaces for the same task"
    );
}

#[tokio::test]
async fn test_workspace_cascade_on_task_delete() {
    let db = setup_db().await;
    let ctx = create_test_context(&db).await;

    sqlx::query(
        "INSERT INTO workspaces (task_id, project_id, template_name, status)
         VALUES ($1, $2, 'seam-agent', 'running')",
    )
    .bind(ctx.task_id)
    .bind(ctx.project_id)
    .execute(&db)
    .await
    .unwrap();

    // Delete the task
    sqlx::query("DELETE FROM tasks WHERE id = $1")
        .bind(ctx.task_id)
        .execute(&db)
        .await
        .unwrap();

    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM workspaces WHERE task_id = $1")
        .bind(ctx.task_id)
        .fetch_one(&db)
        .await
        .unwrap();

    assert_eq!(count, 0, "Workspace should cascade-delete with task");
}

#[tokio::test]
async fn test_workspace_cascade_on_project_delete() {
    let db = setup_db().await;
    let ctx = create_test_context(&db).await;

    sqlx::query(
        "INSERT INTO workspaces (task_id, project_id, template_name, status)
         VALUES ($1, $2, 'seam-agent', 'pending')",
    )
    .bind(ctx.task_id)
    .bind(ctx.project_id)
    .execute(&db)
    .await
    .unwrap();

    // Delete the project
    sqlx::query("DELETE FROM projects WHERE id = $1")
        .bind(ctx.project_id)
        .execute(&db)
        .await
        .unwrap();

    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM workspaces WHERE project_id = $1")
        .bind(ctx.project_id)
        .fetch_one(&db)
        .await
        .unwrap();

    assert_eq!(count, 0, "Workspace should cascade-delete with project");
}

#[tokio::test]
async fn test_workspace_coder_fields() {
    let db = setup_db().await;
    let ctx = create_test_context(&db).await;

    let ws_id: Uuid = sqlx::query_scalar(
        "INSERT INTO workspaces (task_id, project_id, template_name, status)
         VALUES ($1, $2, 'seam-agent', 'creating')
         RETURNING id",
    )
    .bind(ctx.task_id)
    .bind(ctx.project_id)
    .fetch_one(&db)
    .await
    .unwrap();

    // Simulate Coder workspace creation
    let coder_id = Uuid::new_v4();
    sqlx::query(
        "UPDATE workspaces SET
            coder_workspace_id = $2,
            coder_workspace_name = $3,
            status = 'running',
            started_at = NOW(),
            updated_at = NOW()
         WHERE id = $1",
    )
    .bind(ws_id)
    .bind(coder_id)
    .bind("seam-abcd1234")
    .execute(&db)
    .await
    .unwrap();

    let (status, coder_name, started): (
        String,
        Option<String>,
        Option<chrono::DateTime<chrono::Utc>>,
    ) = sqlx::query_as(
        "SELECT status, coder_workspace_name, started_at FROM workspaces WHERE id = $1",
    )
    .bind(ws_id)
    .fetch_one(&db)
    .await
    .unwrap();

    assert_eq!(status, "running");
    assert_eq!(coder_name, Some("seam-abcd1234".to_string()));
    assert!(started.is_some(), "started_at should be set when running");
}
