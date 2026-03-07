//! Integration tests for the task dependency system.
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

/// Create a test context. Returns (session_id, project_id, participant_id).
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

    let session_id = Uuid::new_v4();
    let session_code = session_id.to_string()[..6].to_string().to_uppercase();
    sqlx::query("INSERT INTO sessions (id, project_id, code, created_by, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(session_id).bind(project_id).bind(&session_code).bind(user_id)
        .execute(db).await.unwrap();

    let participant_id = Uuid::new_v4();
    sqlx::query("INSERT INTO participants (id, session_id, user_id, display_name, participant_type, joined_at) VALUES ($1, $2, $3, $4, 'human', NOW())")
        .bind(participant_id).bind(session_id).bind(user_id).bind("Test User")
        .execute(db).await.unwrap();

    (session_id, project_id, participant_id)
}

/// Create a task and return its ID.
async fn create_task(
    db: &PgPool,
    session_id: Uuid,
    project_id: Uuid,
    participant_id: Uuid,
    title: &str,
    ticket: i32,
) -> Uuid {
    let id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO tasks (id, session_id, project_id, ticket_number, task_type, title, status, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'task', $5, 'open', $6, NOW(), NOW())"
    )
    .bind(id).bind(session_id).bind(project_id).bind(ticket).bind(title).bind(participant_id)
    .execute(db).await.unwrap();
    id
}

/// Add a dependency: blocker blocks blocked.
async fn add_dep(db: &PgPool, blocker: Uuid, blocked: Uuid) {
    sqlx::query("INSERT INTO task_dependencies (id, blocker_id, blocked_id, created_at) VALUES ($1, $2, $3, NOW())")
        .bind(Uuid::new_v4()).bind(blocker).bind(blocked)
        .execute(db).await.unwrap();
}

#[tokio::test]
async fn test_simple_dependency() {
    let db = setup_db().await;
    let (session_id, project_id, participant_id) = create_test_context(&db).await;

    let task_a = create_task(&db, session_id, project_id, participant_id, "Task A", 70001).await;
    let task_b = create_task(&db, session_id, project_id, participant_id, "Task B", 70002).await;

    add_dep(&db, task_a, task_b).await;

    // B should be blocked by A
    let blockers: Vec<(Uuid,)> =
        sqlx::query_as("SELECT blocker_id FROM task_dependencies WHERE blocked_id = $1")
            .bind(task_b)
            .fetch_all(&db)
            .await
            .unwrap();

    assert_eq!(blockers.len(), 1);
    assert_eq!(blockers[0].0, task_a);
}

#[tokio::test]
async fn test_dependency_unique_constraint() {
    let db = setup_db().await;
    let (session_id, project_id, participant_id) = create_test_context(&db).await;

    let task_a = create_task(&db, session_id, project_id, participant_id, "Task A", 70003).await;
    let task_b = create_task(&db, session_id, project_id, participant_id, "Task B", 70004).await;

    add_dep(&db, task_a, task_b).await;

    // Duplicate should fail
    let result = sqlx::query("INSERT INTO task_dependencies (id, blocker_id, blocked_id, created_at) VALUES ($1, $2, $3, NOW())")
        .bind(Uuid::new_v4()).bind(task_a).bind(task_b)
        .execute(&db).await;

    assert!(
        result.is_err(),
        "Duplicate dependency should be rejected by unique constraint"
    );
}

#[tokio::test]
async fn test_circular_dependency_detection_sql() {
    let db = setup_db().await;
    let (session_id, project_id, participant_id) = create_test_context(&db).await;

    // Create chain: A -> B -> C (A blocks B, B blocks C)
    let task_a = create_task(&db, session_id, project_id, participant_id, "Task A", 70005).await;
    let task_b = create_task(&db, session_id, project_id, participant_id, "Task B", 70006).await;
    let task_c = create_task(&db, session_id, project_id, participant_id, "Task C", 70007).await;

    add_dep(&db, task_a, task_b).await; // A blocks B
    add_dep(&db, task_b, task_c).await; // B blocks C

    // Adding C -> A would create a cycle. Check the detection query.
    // Walk upstream from the proposed BLOCKER (C) to see if BLOCKED (A) is already in the chain
    let would_cycle: bool = sqlx::query_scalar(
        "WITH RECURSIVE chain AS (
            SELECT blocker_id FROM task_dependencies WHERE blocked_id = $1
            UNION
            SELECT d.blocker_id FROM task_dependencies d JOIN chain c ON d.blocked_id = c.blocker_id
        )
        SELECT EXISTS(SELECT 1 FROM chain WHERE blocker_id = $2)",
    )
    .bind(task_c) // $1 = C (walk upstream from the proposed blocker)
    .bind(task_a) // $2 = A (check if proposed blocked is already upstream)
    .fetch_one(&db)
    .await
    .unwrap();

    assert!(would_cycle, "Should detect cycle: A->B->C->A");
}

#[tokio::test]
async fn test_no_false_positive_cycle() {
    let db = setup_db().await;
    let (session_id, project_id, participant_id) = create_test_context(&db).await;

    // A -> B (A blocks B), want to add C -> A (C blocks A)
    // This is NOT a cycle
    let task_a = create_task(&db, session_id, project_id, participant_id, "Task A", 70008).await;
    let task_b = create_task(&db, session_id, project_id, participant_id, "Task B", 70009).await;
    let task_c = create_task(&db, session_id, project_id, participant_id, "Task C", 70010).await;

    add_dep(&db, task_a, task_b).await; // A blocks B

    // Adding C -> A should be fine (C blocks A, not a cycle)
    let would_cycle: bool = sqlx::query_scalar(
        "WITH RECURSIVE chain AS (
            SELECT blocker_id FROM task_dependencies WHERE blocked_id = $1
            UNION
            SELECT d.blocker_id FROM task_dependencies d JOIN chain c ON d.blocked_id = c.blocker_id
        )
        SELECT EXISTS(SELECT 1 FROM chain WHERE blocker_id = $2)",
    )
    .bind(task_c) // $1 = C (walk upstream from the proposed blocker)
    .bind(task_a) // $2 = A (check if proposed blocked is already upstream)
    .fetch_one(&db)
    .await
    .unwrap();

    assert!(
        !would_cycle,
        "C->A should NOT be a cycle (C is not downstream of A)"
    );
}

#[tokio::test]
async fn test_transitive_dependency_chain() {
    let db = setup_db().await;
    let (session_id, project_id, participant_id) = create_test_context(&db).await;

    // Build: A -> B -> C -> D
    let a = create_task(&db, session_id, project_id, participant_id, "A", 70011).await;
    let b = create_task(&db, session_id, project_id, participant_id, "B", 70012).await;
    let c = create_task(&db, session_id, project_id, participant_id, "C", 70013).await;
    let d = create_task(&db, session_id, project_id, participant_id, "D", 70014).await;

    add_dep(&db, a, b).await;
    add_dep(&db, b, c).await;
    add_dep(&db, c, d).await;

    // D -> A would be a cycle (length 4)
    let would_cycle: bool = sqlx::query_scalar(
        "WITH RECURSIVE chain AS (
            SELECT blocker_id FROM task_dependencies WHERE blocked_id = $1
            UNION
            SELECT d.blocker_id FROM task_dependencies d JOIN chain c ON d.blocked_id = c.blocker_id
        )
        SELECT EXISTS(SELECT 1 FROM chain WHERE blocker_id = $2)",
    )
    .bind(d) // $1 = D (walk upstream from the proposed blocker)
    .bind(a) // $2 = A (check if proposed blocked is already upstream)
    .fetch_one(&db)
    .await
    .unwrap();

    assert!(would_cycle, "Should detect 4-node cycle: A->B->C->D->A");
}

#[tokio::test]
async fn test_dependency_cascade_on_task_delete() {
    let db = setup_db().await;
    let (session_id, project_id, participant_id) = create_test_context(&db).await;

    let task_a = create_task(&db, session_id, project_id, participant_id, "Task A", 70015).await;
    let task_b = create_task(&db, session_id, project_id, participant_id, "Task B", 70016).await;
    let task_c = create_task(&db, session_id, project_id, participant_id, "Task C", 70017).await;

    add_dep(&db, task_a, task_b).await; // A blocks B
    add_dep(&db, task_a, task_c).await; // A blocks C

    // Delete A — dependencies should cascade
    sqlx::query("DELETE FROM tasks WHERE id = $1")
        .bind(task_a)
        .execute(&db)
        .await
        .unwrap();

    let deps: Vec<(Uuid,)> =
        sqlx::query_as("SELECT blocked_id FROM task_dependencies WHERE blocker_id = $1")
            .bind(task_a)
            .fetch_all(&db)
            .await
            .unwrap();
    assert_eq!(
        deps.len(),
        0,
        "Dependencies should be cascade deleted with task"
    );

    // B and C should still exist
    let b_exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM tasks WHERE id = $1)")
        .bind(task_b)
        .fetch_one(&db)
        .await
        .unwrap();
    assert!(b_exists, "Task B should survive");
}

#[tokio::test]
async fn test_remove_dependency() {
    let db = setup_db().await;
    let (session_id, project_id, participant_id) = create_test_context(&db).await;

    let task_a = create_task(&db, session_id, project_id, participant_id, "Task A", 70018).await;
    let task_b = create_task(&db, session_id, project_id, participant_id, "Task B", 70019).await;

    add_dep(&db, task_a, task_b).await;

    // Remove dependency
    let result =
        sqlx::query("DELETE FROM task_dependencies WHERE blocker_id = $1 AND blocked_id = $2")
            .bind(task_a)
            .bind(task_b)
            .execute(&db)
            .await
            .unwrap();
    assert_eq!(result.rows_affected(), 1);

    // Verify it's gone
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM task_dependencies WHERE blocker_id = $1 AND blocked_id = $2",
    )
    .bind(task_a)
    .bind(task_b)
    .fetch_one(&db)
    .await
    .unwrap();
    assert_eq!(count, 0);
}
