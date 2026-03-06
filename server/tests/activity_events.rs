//! Integration tests for activity events and tool invocations.
//! Requires Docker Compose running (Postgres on :5433).

use sqlx::PgPool;
use std::sync::atomic::{AtomicI32, Ordering};
use uuid::Uuid;

static TICKET_SEQ: AtomicI32 = AtomicI32::new(90000);

fn next_ticket() -> i32 {
    TICKET_SEQ.fetch_add(1, Ordering::Relaxed)
}

async fn insert_task(db: &PgPool, id: Uuid, project_id: Uuid, session_id: Uuid, title: &str, task_type: &str, status: &str, created_by: Uuid) {
    sqlx::query(
        "INSERT INTO tasks (id, project_id, session_id, ticket_number, title, task_type, status, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())"
    )
    .bind(id).bind(project_id).bind(session_id).bind(next_ticket())
    .bind(title).bind(task_type).bind(status).bind(created_by)
    .execute(db).await.unwrap();
}

async fn setup_db() -> PgPool {
    let url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://seam:seam@localhost:5433/seam".to_string());
    let db = PgPool::connect(&url).await.expect("Failed to connect to test database");
    sqlx::migrate!("./migrations").run(&db).await.expect("Failed to run migrations");
    db
}

async fn create_test_context(db: &PgPool) -> (Uuid, Uuid, Uuid, Uuid) {
    let user_id = Uuid::new_v4();
    let external_id = format!("test-{}", Uuid::new_v4());
    sqlx::query("INSERT INTO users (id, external_id, username, display_name, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(user_id).bind(&external_id).bind(&external_id).bind("Test User")
        .execute(db).await.unwrap();

    let org_id = Uuid::new_v4();
    sqlx::query("INSERT INTO organizations (id, name, slug, created_at) VALUES ($1, $2, $3, NOW())")
        .bind(org_id).bind("Test Org").bind(format!("test-org-{}", Uuid::new_v4()))
        .execute(db).await.unwrap();

    let project_id = Uuid::new_v4();
    sqlx::query("INSERT INTO projects (id, org_id, name, slug, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(project_id).bind(org_id).bind("Test Project").bind(format!("test-proj-{}", Uuid::new_v4()))
        .execute(db).await.unwrap();

    let session_id = Uuid::new_v4();
    let code = format!("AE{}", &Uuid::new_v4().to_string()[..4]).to_uppercase();
    sqlx::query("INSERT INTO sessions (id, project_id, name, code, created_by, created_at) VALUES ($1, $2, $3, $4, $5, NOW())")
        .bind(session_id).bind(project_id).bind("Test Session").bind(&code).bind(user_id)
        .execute(db).await.unwrap();

    let participant_id = Uuid::new_v4();
    sqlx::query("INSERT INTO participants (id, session_id, user_id, display_name, participant_type, joined_at) VALUES ($1, $2, $3, $4, 'human', NOW())")
        .bind(participant_id).bind(session_id).bind(user_id).bind("Test User")
        .execute(db).await.unwrap();

    (session_id, project_id, participant_id, user_id)
}

// --- Activity Events ---

#[tokio::test]
async fn test_create_activity_event() {
    let db = setup_db().await;
    let (session_id, project_id, participant_id, _) = create_test_context(&db).await;

    let task_id = Uuid::new_v4();
    insert_task(&db, task_id, project_id, session_id, "Test Task", "task", "open", participant_id).await;

    let event_id: (Uuid,) = sqlx::query_as(
        "INSERT INTO activity_events (project_id, session_id, actor_id, event_type, target_type, target_id, summary)
         VALUES ($1, $2, $3, 'task_created', 'task', $4, $5) RETURNING id"
    )
    .bind(project_id).bind(session_id).bind(participant_id).bind(task_id)
    .bind("Created task: Test Task")
    .fetch_one(&db).await.unwrap();

    let (event_type, target_type, summary): (String, String, String) = sqlx::query_as(
        "SELECT event_type, target_type, summary FROM activity_events WHERE id = $1"
    ).bind(event_id.0).fetch_one(&db).await.unwrap();

    assert_eq!(event_type, "task_created");
    assert_eq!(target_type, "task");
    assert_eq!(summary, "Created task: Test Task");
}

#[tokio::test]
async fn test_activity_event_type_constraint() {
    let db = setup_db().await;
    let (session_id, project_id, participant_id, _) = create_test_context(&db).await;

    let result = sqlx::query(
        "INSERT INTO activity_events (project_id, session_id, actor_id, event_type, target_type, target_id, summary)
         VALUES ($1, $2, $3, 'invalid_event', 'task', $4, 'Bad event')"
    )
    .bind(project_id).bind(session_id).bind(participant_id).bind(Uuid::new_v4())
    .execute(&db).await;

    assert!(result.is_err(), "Invalid event_type should be rejected by CHECK constraint");
}

#[tokio::test]
async fn test_activity_target_type_constraint() {
    let db = setup_db().await;
    let (session_id, project_id, participant_id, _) = create_test_context(&db).await;

    let result = sqlx::query(
        "INSERT INTO activity_events (project_id, session_id, actor_id, event_type, target_type, target_id, summary)
         VALUES ($1, $2, $3, 'task_created', 'invalid_target', $4, 'Bad target')"
    )
    .bind(project_id).bind(session_id).bind(participant_id).bind(Uuid::new_v4())
    .execute(&db).await;

    assert!(result.is_err(), "Invalid target_type should be rejected by CHECK constraint");
}

#[tokio::test]
async fn test_activity_event_extended_types() {
    let db = setup_db().await;
    let (session_id, project_id, participant_id, _) = create_test_context(&db).await;

    // All extended event_type + target_type combos should be accepted
    let cases = [
        ("question_asked", "question"),
        ("question_answered", "question"),
        ("requirement_created", "requirement"),
        ("requirement_updated", "requirement"),
        ("request_created", "request"),
        ("request_updated", "request"),
    ];

    for (event_type, target_type) in cases {
        let result = sqlx::query(
            "INSERT INTO activity_events (project_id, session_id, actor_id, event_type, target_type, target_id, summary)
             VALUES ($1, $2, $3, $4, $5, $6, $7)"
        )
        .bind(project_id).bind(session_id).bind(participant_id)
        .bind(event_type).bind(target_type).bind(Uuid::new_v4())
        .bind(format!("Test: {event_type}"))
        .execute(&db).await;

        assert!(result.is_ok(), "event_type={event_type} + target_type={target_type} should be accepted");
    }
}

#[tokio::test]
async fn test_activity_events_ordered_by_time() {
    let db = setup_db().await;
    let (session_id, project_id, participant_id, _) = create_test_context(&db).await;

    let target_id = Uuid::new_v4();

    // Insert task for FK
    insert_task(&db, target_id, project_id, session_id, "Target Task", "task", "open", participant_id).await;

    for event in ["task_created", "task_updated", "task_closed"] {
        sqlx::query(
            "INSERT INTO activity_events (project_id, session_id, actor_id, event_type, target_type, target_id, summary)
             VALUES ($1, $2, $3, $4, 'task', $5, $6)"
        )
        .bind(project_id).bind(session_id).bind(participant_id).bind(event).bind(target_id)
        .bind(format!("Event: {event}"))
        .execute(&db).await.unwrap();
    }

    let events: Vec<(String,)> = sqlx::query_as(
        "SELECT event_type FROM activity_events WHERE project_id = $1 AND target_id = $2 ORDER BY created_at"
    ).bind(project_id).bind(target_id).fetch_all(&db).await.unwrap();

    assert_eq!(events.len(), 3);
    assert_eq!(events[0].0, "task_created");
    assert_eq!(events[1].0, "task_updated");
    assert_eq!(events[2].0, "task_closed");
}

#[tokio::test]
async fn test_activity_event_with_metadata() {
    let db = setup_db().await;
    let (session_id, project_id, participant_id, _) = create_test_context(&db).await;

    let metadata = serde_json::json!({
        "old_status": "open",
        "new_status": "in_progress",
        "fields_changed": ["status"]
    });

    let target_id = Uuid::new_v4();
    insert_task(&db, target_id, project_id, session_id, "Meta Task", "task", "open", participant_id).await;

    sqlx::query(
        "INSERT INTO activity_events (project_id, session_id, actor_id, event_type, target_type, target_id, summary, metadata)
         VALUES ($1, $2, $3, 'task_updated', 'task', $4, 'Status changed', $5)"
    )
    .bind(project_id).bind(session_id).bind(participant_id).bind(target_id).bind(&metadata)
    .execute(&db).await.unwrap();

    let (stored_metadata,): (serde_json::Value,) = sqlx::query_as(
        "SELECT metadata FROM activity_events WHERE project_id = $1 AND target_id = $2"
    ).bind(project_id).bind(target_id).fetch_one(&db).await.unwrap();

    assert_eq!(stored_metadata["old_status"], "open");
    assert_eq!(stored_metadata["new_status"], "in_progress");
}

// --- Tool Invocations ---

#[tokio::test]
async fn test_record_tool_invocation() {
    let db = setup_db().await;
    let (session_id, _, participant_id, _) = create_test_context(&db).await;

    let params = serde_json::json!({"title": "New Task", "task_type": "bug"});
    let response = serde_json::json!({"id": Uuid::new_v4().to_string(), "status": "created"});

    let (inv_id,): (Uuid,) = sqlx::query_as(
        "INSERT INTO tool_invocations (session_id, participant_id, tool_name, request_params, response, is_error, duration_ms)
         VALUES ($1, $2, $3, $4, $5, false, 42) RETURNING id"
    )
    .bind(session_id).bind(participant_id).bind("create_task")
    .bind(&params).bind(&response)
    .fetch_one(&db).await.unwrap();

    let (tool_name, is_error, duration_ms): (String, bool, i32) = sqlx::query_as(
        "SELECT tool_name, is_error, duration_ms FROM tool_invocations WHERE id = $1"
    ).bind(inv_id).fetch_one(&db).await.unwrap();

    assert_eq!(tool_name, "create_task");
    assert!(!is_error);
    assert_eq!(duration_ms, 42);
}

#[tokio::test]
async fn test_tool_invocation_error() {
    let db = setup_db().await;
    let (session_id, _, participant_id, _) = create_test_context(&db).await;

    sqlx::query(
        "INSERT INTO tool_invocations (session_id, participant_id, tool_name, request_params, response, is_error, duration_ms)
         VALUES ($1, $2, 'delete_task', $3, $4, true, 5)"
    )
    .bind(session_id).bind(participant_id)
    .bind(serde_json::json!({"id": "nonexistent"}))
    .bind(serde_json::json!({"error": "Task not found"}))
    .execute(&db).await.unwrap();

    let error_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM tool_invocations WHERE session_id = $1 AND is_error = true"
    ).bind(session_id).fetch_one(&db).await.unwrap();

    assert_eq!(error_count, 1);
}

#[tokio::test]
async fn test_tool_invocations_by_participant() {
    let db = setup_db().await;
    let (session_id, _, participant_id, user_id) = create_test_context(&db).await;

    // Create a second participant (agent)
    let agent_id = Uuid::new_v4();
    sqlx::query("INSERT INTO participants (id, session_id, user_id, display_name, participant_type, sponsor_id, joined_at) VALUES ($1, $2, $3, $4, 'agent', $5, NOW())")
        .bind(agent_id).bind(session_id).bind(user_id).bind("Agent").bind(participant_id)
        .execute(&db).await.unwrap();

    // Human makes 2 calls, agent makes 3
    for _ in 0..2 {
        sqlx::query(
            "INSERT INTO tool_invocations (session_id, participant_id, tool_name, is_error, duration_ms)
             VALUES ($1, $2, 'list_tasks', false, 10)"
        ).bind(session_id).bind(participant_id).execute(&db).await.unwrap();
    }
    for _ in 0..3 {
        sqlx::query(
            "INSERT INTO tool_invocations (session_id, participant_id, tool_name, is_error, duration_ms)
             VALUES ($1, $2, 'create_task', false, 20)"
        ).bind(session_id).bind(agent_id).execute(&db).await.unwrap();
    }

    let human_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM tool_invocations WHERE participant_id = $1"
    ).bind(participant_id).fetch_one(&db).await.unwrap();

    let agent_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM tool_invocations WHERE participant_id = $1"
    ).bind(agent_id).fetch_one(&db).await.unwrap();

    assert_eq!(human_count, 2);
    assert_eq!(agent_count, 3);
}

// --- Task Provenance ---

#[tokio::test]
async fn test_task_commit_hashes_array() {
    let db = setup_db().await;
    let (session_id, project_id, participant_id, _) = create_test_context(&db).await;

    let task_id = Uuid::new_v4();
    insert_task(&db, task_id, project_id, session_id, "Provenance Task", "task", "open", participant_id).await;

    // Add commit hashes
    let hashes = vec!["abc123", "def456", "789ghi"];
    sqlx::query("UPDATE tasks SET commit_hashes = $1 WHERE id = $2")
        .bind(&hashes).bind(task_id)
        .execute(&db).await.unwrap();

    let (stored_hashes,): (Vec<String>,) = sqlx::query_as(
        "SELECT commit_hashes FROM tasks WHERE id = $1"
    ).bind(task_id).fetch_one(&db).await.unwrap();

    assert_eq!(stored_hashes.len(), 3);
    assert_eq!(stored_hashes[0], "abc123");
}

#[tokio::test]
async fn test_task_no_code_change_flag() {
    let db = setup_db().await;
    let (session_id, project_id, participant_id, _) = create_test_context(&db).await;

    let task_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO tasks (id, project_id, session_id, ticket_number, title, task_type, status, created_by, no_code_change, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'Doc Task', 'task', 'done', $5, true, NOW(), NOW())"
    )
    .bind(task_id).bind(project_id).bind(session_id).bind(next_ticket()).bind(participant_id)
    .execute(&db).await.unwrap();

    let (no_code, hashes): (bool, Vec<String>) = sqlx::query_as(
        "SELECT no_code_change, commit_hashes FROM tasks WHERE id = $1"
    ).bind(task_id).fetch_one(&db).await.unwrap();

    assert!(no_code);
    assert!(hashes.is_empty(), "No commits expected for no-code-change task");
}

#[tokio::test]
async fn test_task_source_provenance() {
    let db = setup_db().await;
    let (session_id, project_id, participant_id, _) = create_test_context(&db).await;

    // Create parent task
    let parent_id = Uuid::new_v4();
    insert_task(&db, parent_id, project_id, session_id, "Parent Task", "task", "in_progress", participant_id).await;

    // Create child task with source_task_id pointing to parent
    let child_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO tasks (id, project_id, session_id, ticket_number, title, task_type, status, created_by, source_task_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'Discovered Bug', 'bug', 'open', $5, $6, NOW(), NOW())"
    )
    .bind(child_id).bind(project_id).bind(session_id).bind(next_ticket())
    .bind(participant_id).bind(parent_id)
    .execute(&db).await.unwrap();

    let (source_id,): (Option<Uuid>,) = sqlx::query_as(
        "SELECT source_task_id FROM tasks WHERE id = $1"
    ).bind(child_id).fetch_one(&db).await.unwrap();

    assert_eq!(source_id.unwrap(), parent_id);
}

#[tokio::test]
async fn test_source_task_set_null_on_delete() {
    let db = setup_db().await;
    let (session_id, project_id, participant_id, _) = create_test_context(&db).await;

    let source_id = Uuid::new_v4();
    insert_task(&db, source_id, project_id, session_id, "Source", "task", "open", participant_id).await;

    let derived_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO tasks (id, project_id, session_id, ticket_number, title, task_type, status, created_by, source_task_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'Derived', 'task', 'open', $5, $6, NOW(), NOW())"
    )
    .bind(derived_id).bind(project_id).bind(session_id).bind(next_ticket())
    .bind(participant_id).bind(source_id)
    .execute(&db).await.unwrap();

    // Delete the source task
    sqlx::query("DELETE FROM tasks WHERE id = $1").bind(source_id).execute(&db).await.unwrap();

    // Derived task should still exist with source_task_id set to NULL
    let (source_ref,): (Option<Uuid>,) = sqlx::query_as(
        "SELECT source_task_id FROM tasks WHERE id = $1"
    ).bind(derived_id).fetch_one(&db).await.unwrap();

    assert!(source_ref.is_none(), "source_task_id should be NULL after source deletion (ON DELETE SET NULL)");
}
