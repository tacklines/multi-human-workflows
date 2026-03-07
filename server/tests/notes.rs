//! Integration tests for the notes (collaborative documents) data model.
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

async fn create_test_context(db: &PgPool) -> (Uuid, Uuid, Uuid, Uuid) {
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
    let code = format!("NT{}", &Uuid::new_v4().to_string()[..4]).to_uppercase();
    sqlx::query("INSERT INTO sessions (id, project_id, name, code, created_by, created_at) VALUES ($1, $2, $3, $4, $5, NOW())")
        .bind(session_id).bind(project_id).bind("Test Session").bind(&code).bind(user_id)
        .execute(db).await.unwrap();

    let participant_id = Uuid::new_v4();
    sqlx::query("INSERT INTO participants (id, session_id, user_id, display_name, participant_type, joined_at) VALUES ($1, $2, $3, $4, 'human', NOW())")
        .bind(participant_id).bind(session_id).bind(user_id).bind("Test User")
        .execute(db).await.unwrap();

    (session_id, participant_id, project_id, user_id)
}

#[tokio::test]
async fn test_create_note() {
    let db = setup_db().await;
    let (session_id, participant_id, _, _) = create_test_context(&db).await;

    let note_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO notes (id, session_id, slug, title, content, updated_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())"
    )
    .bind(note_id).bind(session_id).bind("scratchpad").bind("Scratchpad").bind("# Notes\n\nSome content here.")
    .bind(participant_id)
    .execute(&db).await.unwrap();

    let (slug, title, content): (String, String, String) =
        sqlx::query_as("SELECT slug, title, content FROM notes WHERE id = $1")
            .bind(note_id)
            .fetch_one(&db)
            .await
            .unwrap();

    assert_eq!(slug, "scratchpad");
    assert_eq!(title, "Scratchpad");
    assert!(content.contains("Some content here."));
}

#[tokio::test]
async fn test_upsert_note() {
    let db = setup_db().await;
    let (session_id, participant_id, _, _) = create_test_context(&db).await;

    // Insert initial note
    sqlx::query(
        "INSERT INTO notes (id, session_id, slug, title, content, updated_by, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT (session_id, slug) DO UPDATE
         SET content = EXCLUDED.content, title = EXCLUDED.title, updated_by = EXCLUDED.updated_by, updated_at = NOW()"
    )
    .bind(session_id).bind("decisions").bind("Decisions").bind("v1 content").bind(participant_id)
    .execute(&db).await.unwrap();

    // Upsert with new content
    sqlx::query(
        "INSERT INTO notes (id, session_id, slug, title, content, updated_by, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT (session_id, slug) DO UPDATE
         SET content = EXCLUDED.content, title = EXCLUDED.title, updated_by = EXCLUDED.updated_by, updated_at = NOW()"
    )
    .bind(session_id).bind("decisions").bind("Decisions v2").bind("v2 content").bind(participant_id)
    .execute(&db).await.unwrap();

    // Should only have one note with the updated content
    let notes: Vec<(String, String)> =
        sqlx::query_as("SELECT title, content FROM notes WHERE session_id = $1 AND slug = $2")
            .bind(session_id)
            .bind("decisions")
            .fetch_all(&db)
            .await
            .unwrap();

    assert_eq!(notes.len(), 1);
    assert_eq!(notes[0].0, "Decisions v2");
    assert_eq!(notes[0].1, "v2 content");
}

#[tokio::test]
async fn test_notes_scoped_to_session() {
    let db = setup_db().await;
    let (session_id_1, participant_id, _, _) = create_test_context(&db).await;
    let (session_id_2, _, _, _) = create_test_context(&db).await;

    // Create same slug in different sessions
    for sid in [session_id_1, session_id_2] {
        sqlx::query(
            "INSERT INTO notes (id, session_id, slug, title, content, updated_by, created_at, updated_at)
             VALUES (gen_random_uuid(), $1, 'shared-slug', 'Title', 'content', $2, NOW(), NOW())"
        ).bind(sid).bind(participant_id).execute(&db).await.unwrap();
    }

    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM notes WHERE session_id = $1")
        .bind(session_id_1)
        .fetch_one(&db)
        .await
        .unwrap();

    assert_eq!(count, 1, "Each session should have its own note");
}

#[tokio::test]
async fn test_list_notes_for_session() {
    let db = setup_db().await;
    let (session_id, participant_id, _, _) = create_test_context(&db).await;

    for slug in ["scratchpad", "decisions", "findings"] {
        sqlx::query(
            "INSERT INTO notes (id, session_id, slug, title, content, updated_by, created_at, updated_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW())"
        )
        .bind(session_id).bind(slug).bind(slug).bind(format!("Content for {slug}")).bind(participant_id)
        .execute(&db).await.unwrap();
    }

    let notes: Vec<(String,)> =
        sqlx::query_as("SELECT slug FROM notes WHERE session_id = $1 ORDER BY created_at")
            .bind(session_id)
            .fetch_all(&db)
            .await
            .unwrap();

    assert_eq!(notes.len(), 3);
    assert_eq!(notes[0].0, "scratchpad");
    assert_eq!(notes[1].0, "decisions");
    assert_eq!(notes[2].0, "findings");
}
