//! Integration tests for the plans data model.
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

/// Create a test user, org, and project. Returns (user_id, project_id).
async fn create_test_context(db: &PgPool) -> (Uuid, Uuid) {
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

    (user_id, project_id)
}

#[tokio::test]
async fn test_create_plan() {
    let db = setup_db().await;
    let (user_id, project_id) = create_test_context(&db).await;

    let plan_id = Uuid::new_v4();
    let slug = format!("plan-{}", &Uuid::new_v4().to_string()[..8]);
    sqlx::query(
        "INSERT INTO plans (id, project_id, author_id, title, slug, body, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'draft', NOW(), NOW())"
    )
    .bind(plan_id).bind(project_id).bind(user_id)
    .bind("WebSocket Architecture").bind(&slug).bind("## Overview\nReal-time message passing via WebSocket.")
    .execute(&db).await.unwrap();

    let row: (Uuid, Uuid, String, String, String, String) = sqlx::query_as(
        "SELECT project_id, author_id, title, slug, body, status FROM plans WHERE id = $1",
    )
    .bind(plan_id)
    .fetch_one(&db)
    .await
    .unwrap();

    assert_eq!(row.0, project_id);
    assert_eq!(row.1, user_id);
    assert_eq!(row.2, "WebSocket Architecture");
    assert_eq!(row.3, slug);
    assert_eq!(
        row.4,
        "## Overview\nReal-time message passing via WebSocket."
    );
    assert_eq!(row.5, "draft");
}

#[tokio::test]
async fn test_plan_status_default() {
    let db = setup_db().await;
    let (user_id, project_id) = create_test_context(&db).await;

    let plan_id = Uuid::new_v4();
    let slug = format!("default-{}", &Uuid::new_v4().to_string()[..8]);
    // Insert without explicit status — should default to 'draft'
    sqlx::query(
        "INSERT INTO plans (id, project_id, author_id, title, slug, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())",
    )
    .bind(plan_id)
    .bind(project_id)
    .bind(user_id)
    .bind("Default Status Plan")
    .bind(&slug)
    .execute(&db)
    .await
    .unwrap();

    let row: (String, String) = sqlx::query_as("SELECT status, body FROM plans WHERE id = $1")
        .bind(plan_id)
        .fetch_one(&db)
        .await
        .unwrap();

    assert_eq!(row.0, "draft", "Status should default to 'draft'");
    assert_eq!(row.1, "", "Body should default to empty string");
}

#[tokio::test]
async fn test_plan_slug_uniqueness() {
    let db = setup_db().await;
    let (user_id, project_id) = create_test_context(&db).await;

    let slug = format!("unique-{}", &Uuid::new_v4().to_string()[..8]);

    sqlx::query(
        "INSERT INTO plans (id, project_id, author_id, title, slug, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())",
    )
    .bind(Uuid::new_v4())
    .bind(project_id)
    .bind(user_id)
    .bind("First Plan")
    .bind(&slug)
    .execute(&db)
    .await
    .unwrap();

    // Duplicate slug in same project should fail
    let result = sqlx::query(
        "INSERT INTO plans (id, project_id, author_id, title, slug, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())",
    )
    .bind(Uuid::new_v4())
    .bind(project_id)
    .bind(user_id)
    .bind("Second Plan")
    .bind(&slug)
    .execute(&db)
    .await;

    assert!(
        result.is_err(),
        "Duplicate slug within same project should be rejected by unique constraint"
    );
}

#[tokio::test]
async fn test_plan_update_status() {
    let db = setup_db().await;
    let (user_id, project_id) = create_test_context(&db).await;

    let plan_id = Uuid::new_v4();
    let slug = format!("status-{}", &Uuid::new_v4().to_string()[..8]);
    sqlx::query(
        "INSERT INTO plans (id, project_id, author_id, title, slug, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())",
    )
    .bind(plan_id)
    .bind(project_id)
    .bind(user_id)
    .bind("Status Transition Plan")
    .bind(&slug)
    .execute(&db)
    .await
    .unwrap();

    // Transition through valid statuses
    for status in &["review", "accepted", "superseded", "abandoned"] {
        sqlx::query("UPDATE plans SET status = $1, updated_at = NOW() WHERE id = $2")
            .bind(status)
            .bind(plan_id)
            .execute(&db)
            .await
            .unwrap();

        let current: (String,) = sqlx::query_as("SELECT status FROM plans WHERE id = $1")
            .bind(plan_id)
            .fetch_one(&db)
            .await
            .unwrap();
        assert_eq!(current.0, *status);
    }

    // Invalid status should fail
    let result = sqlx::query("UPDATE plans SET status = 'invalid_status' WHERE id = $1")
        .bind(plan_id)
        .execute(&db)
        .await;
    assert!(
        result.is_err(),
        "Invalid status should be rejected by CHECK constraint"
    );
}

#[tokio::test]
async fn test_plan_parent_child() {
    let db = setup_db().await;
    let (user_id, project_id) = create_test_context(&db).await;

    // Create parent plan
    let parent_id = Uuid::new_v4();
    let parent_slug = format!("parent-{}", &Uuid::new_v4().to_string()[..8]);
    sqlx::query(
        "INSERT INTO plans (id, project_id, author_id, title, slug, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'accepted', NOW(), NOW())",
    )
    .bind(parent_id)
    .bind(project_id)
    .bind(user_id)
    .bind("Original Architecture")
    .bind(&parent_slug)
    .execute(&db)
    .await
    .unwrap();

    // Create child plan that supersedes the parent
    let child_id = Uuid::new_v4();
    let child_slug = format!("child-{}", &Uuid::new_v4().to_string()[..8]);
    sqlx::query(
        "INSERT INTO plans (id, project_id, author_id, title, slug, status, parent_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'draft', $6, NOW(), NOW())"
    )
    .bind(child_id).bind(project_id).bind(user_id)
    .bind("Revised Architecture").bind(&child_slug).bind(parent_id)
    .execute(&db).await.unwrap();

    // Verify parent_id is set
    let row: (Option<Uuid>,) = sqlx::query_as("SELECT parent_id FROM plans WHERE id = $1")
        .bind(child_id)
        .fetch_one(&db)
        .await
        .unwrap();
    assert_eq!(row.0, Some(parent_id));

    // Query children of parent
    let children: Vec<(Uuid, String)> =
        sqlx::query_as("SELECT id, title FROM plans WHERE parent_id = $1")
            .bind(parent_id)
            .fetch_all(&db)
            .await
            .unwrap();

    assert_eq!(children.len(), 1);
    assert_eq!(children[0].0, child_id);
    assert_eq!(children[0].1, "Revised Architecture");
}

#[tokio::test]
async fn test_plan_project_scoping() {
    let db = setup_db().await;
    let (user_id, project_id_a) = create_test_context(&db).await;

    // Create a second project under a new org
    let org_id_b = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO organizations (id, name, slug, created_at) VALUES ($1, $2, $3, NOW())",
    )
    .bind(org_id_b)
    .bind("Org B")
    .bind(format!("org-b-{}", Uuid::new_v4()))
    .execute(&db)
    .await
    .unwrap();

    let project_id_b = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO projects (id, org_id, name, slug, created_at) VALUES ($1, $2, $3, $4, NOW())",
    )
    .bind(project_id_b)
    .bind(org_id_b)
    .bind("Project B")
    .bind(format!("proj-b-{}", Uuid::new_v4()))
    .execute(&db)
    .await
    .unwrap();

    let shared_slug = format!("shared-{}", &Uuid::new_v4().to_string()[..8]);

    // Same slug in project A
    sqlx::query(
        "INSERT INTO plans (id, project_id, author_id, title, slug, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())",
    )
    .bind(Uuid::new_v4())
    .bind(project_id_a)
    .bind(user_id)
    .bind("Plan in A")
    .bind(&shared_slug)
    .execute(&db)
    .await
    .unwrap();

    // Same slug in project B — should succeed (unique is per-project)
    sqlx::query(
        "INSERT INTO plans (id, project_id, author_id, title, slug, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())",
    )
    .bind(Uuid::new_v4())
    .bind(project_id_b)
    .bind(user_id)
    .bind("Plan in B")
    .bind(&shared_slug)
    .execute(&db)
    .await
    .unwrap();

    // Each project should see only its own plan
    let plans_a: Vec<(String,)> =
        sqlx::query_as("SELECT title FROM plans WHERE project_id = $1 AND slug = $2")
            .bind(project_id_a)
            .bind(&shared_slug)
            .fetch_all(&db)
            .await
            .unwrap();
    assert_eq!(plans_a.len(), 1);
    assert_eq!(plans_a[0].0, "Plan in A");

    let plans_b: Vec<(String,)> =
        sqlx::query_as("SELECT title FROM plans WHERE project_id = $1 AND slug = $2")
            .bind(project_id_b)
            .bind(&shared_slug)
            .fetch_all(&db)
            .await
            .unwrap();
    assert_eq!(plans_b.len(), 1);
    assert_eq!(plans_b[0].0, "Plan in B");
}
