#![allow(dead_code)]
//! Shared test harness for integration tests.
//!
//! Provides common setup functions used across most integration test files.
//! Tests require Docker Compose running (Postgres on :5433).
//!
//! # Usage
//!
//! ```rust
//! mod common;
//! use common::*;
//!
//! #[tokio::test]
//! async fn my_test() {
//!     let db = setup_db().await;
//!     let (session_id, project_id, participant_id) = create_test_session(&db).await;
//!     // ...
//! }
//! ```

use sqlx::PgPool;
use uuid::Uuid;

/// Connect to the test database and run migrations.
///
/// Reads `DATABASE_URL` from the environment, falling back to the default
/// local Docker Compose Postgres on port 5433.
pub async fn setup_db() -> PgPool {
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

/// Insert a test user and return its `user_id`.
pub async fn create_test_user(db: &PgPool) -> Uuid {
    let user_id = Uuid::new_v4();
    let external_id = format!("test-{}", Uuid::new_v4());
    sqlx::query(
        "INSERT INTO users (id, external_id, username, display_name, created_at) \
         VALUES ($1, $2, $3, $4, NOW())",
    )
    .bind(user_id)
    .bind(&external_id)
    .bind(&external_id)
    .bind("Test User")
    .execute(db)
    .await
    .unwrap();
    user_id
}

/// Insert a test organization and return its `org_id`.
pub async fn create_test_org(db: &PgPool) -> Uuid {
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
    org_id
}

/// Add a user to an org with the given role.
pub async fn add_org_member(db: &PgPool, org_id: Uuid, user_id: Uuid, role: &str) {
    sqlx::query(
        "INSERT INTO org_members (org_id, user_id, role, joined_at) VALUES ($1, $2, $3, NOW())",
    )
    .bind(org_id)
    .bind(user_id)
    .bind(role)
    .execute(db)
    .await
    .unwrap();
}

/// Insert a test project under the given org and return its `project_id`.
pub async fn create_test_project(db: &PgPool, org_id: Uuid) -> Uuid {
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
    project_id
}

/// Create a minimal user + org + project context.
///
/// Returns `(user_id, org_id, project_id)`.
pub async fn create_test_context(db: &PgPool) -> (Uuid, Uuid, Uuid) {
    let user_id = create_test_user(db).await;
    let org_id = create_test_org(db).await;
    let project_id = create_test_project(db, org_id).await;
    (user_id, org_id, project_id)
}

/// Create a full user + org + project + session + participant context.
///
/// Returns `(session_id, project_id, participant_id)`.
pub async fn create_test_session(db: &PgPool) -> (Uuid, Uuid, Uuid) {
    let (user_id, _org_id, project_id) = create_test_context(db).await;

    let session_id = Uuid::new_v4();
    let session_code = session_id.to_string()[..6].to_string().to_uppercase();
    sqlx::query(
        "INSERT INTO sessions (id, project_id, code, created_by, created_at) \
         VALUES ($1, $2, $3, $4, NOW())",
    )
    .bind(session_id)
    .bind(project_id)
    .bind(&session_code)
    .bind(user_id)
    .execute(db)
    .await
    .unwrap();

    let participant_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO participants (id, session_id, user_id, display_name, participant_type, joined_at) \
         VALUES ($1, $2, $3, $4, 'human', NOW())",
    )
    .bind(participant_id)
    .bind(session_id)
    .bind(user_id)
    .bind("Test User")
    .execute(db)
    .await
    .unwrap();

    (session_id, project_id, participant_id)
}
