//! Integration tests for the questions data model.
//! Tests question lifecycle: creation, answering, cancellation, expiry, status filtering.
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

async fn create_user(db: &PgPool) -> Uuid {
    let user_id = Uuid::new_v4();
    let external_id = format!("test-{}", Uuid::new_v4());
    sqlx::query("INSERT INTO users (id, external_id, username, display_name, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(user_id).bind(&external_id).bind(&external_id).bind("Test User")
        .execute(db).await.unwrap();
    user_id
}

struct TestSession {
    session_id: Uuid,
    project_id: Uuid,
}

async fn create_session(db: &PgPool, user_id: Uuid) -> TestSession {
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
        .bind(session_id).bind(project_id).bind(format!("Q{}", &Uuid::new_v4().to_string()[..5]).to_uppercase()).bind(user_id)
        .execute(db).await.unwrap();

    TestSession {
        session_id,
        project_id,
    }
}

async fn create_participant(db: &PgPool, session_id: Uuid, user_id: Uuid, ptype: &str) -> Uuid {
    let participant_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO participants (id, session_id, user_id, display_name, participant_type, joined_at)
         VALUES ($1, $2, $3, $4, $5, NOW())"
    )
    .bind(participant_id).bind(session_id).bind(user_id).bind("Test Participant").bind(ptype)
    .execute(db).await.unwrap();
    participant_id
}

#[tokio::test]
async fn test_create_question() {
    let db = setup_db().await;
    let user_id = create_user(&db).await;
    let sess = create_session(&db, user_id).await;
    let participant_id = create_participant(&db, sess.session_id, user_id, "agent").await;

    let question_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO questions (id, session_id, project_id, asked_by, question_text, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())",
    )
    .bind(question_id)
    .bind(sess.session_id)
    .bind(sess.project_id)
    .bind(participant_id)
    .bind("What should I do next?")
    .execute(&db)
    .await
    .unwrap();

    let (text, status): (String, String) =
        sqlx::query_as("SELECT question_text, status FROM questions WHERE id = $1")
            .bind(question_id)
            .fetch_one(&db)
            .await
            .unwrap();

    assert_eq!(text, "What should I do next?");
    assert_eq!(status, "pending");
}

#[tokio::test]
async fn test_answer_question() {
    let db = setup_db().await;
    let user_id = create_user(&db).await;
    let human_id = create_user(&db).await;
    let sess = create_session(&db, user_id).await;
    let agent_participant = create_participant(&db, sess.session_id, user_id, "agent").await;
    let human_participant = create_participant(&db, sess.session_id, human_id, "human").await;

    let question_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO questions (id, session_id, project_id, asked_by, question_text)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(question_id)
    .bind(sess.session_id)
    .bind(sess.project_id)
    .bind(agent_participant)
    .bind("Should I refactor this?")
    .execute(&db)
    .await
    .unwrap();

    // Answer the question
    let result = sqlx::query(
        "UPDATE questions SET answer_text = $1, answered_by = $2, answered_at = NOW(), status = 'answered'
         WHERE id = $3 AND status = 'pending'"
    )
    .bind("Yes, go ahead").bind(human_participant).bind(question_id)
    .execute(&db).await.unwrap();

    assert_eq!(result.rows_affected(), 1);

    let (status, answer, answered_by): (String, Option<String>, Option<Uuid>) =
        sqlx::query_as("SELECT status, answer_text, answered_by FROM questions WHERE id = $1")
            .bind(question_id)
            .fetch_one(&db)
            .await
            .unwrap();

    assert_eq!(status, "answered");
    assert_eq!(answer, Some("Yes, go ahead".to_string()));
    assert_eq!(answered_by, Some(human_participant));
}

#[tokio::test]
async fn test_cancel_question() {
    let db = setup_db().await;
    let user_id = create_user(&db).await;
    let sess = create_session(&db, user_id).await;
    let participant_id = create_participant(&db, sess.session_id, user_id, "agent").await;

    let question_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO questions (id, session_id, project_id, asked_by, question_text)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(question_id)
    .bind(sess.session_id)
    .bind(sess.project_id)
    .bind(participant_id)
    .bind("Never mind this")
    .execute(&db)
    .await
    .unwrap();

    // Cancel — only the asker can cancel
    let result = sqlx::query(
        "UPDATE questions SET status = 'cancelled' WHERE id = $1 AND asked_by = $2 AND status = 'pending'"
    )
    .bind(question_id).bind(participant_id)
    .execute(&db).await.unwrap();

    assert_eq!(result.rows_affected(), 1);

    let status: String = sqlx::query_scalar("SELECT status FROM questions WHERE id = $1")
        .bind(question_id)
        .fetch_one(&db)
        .await
        .unwrap();
    assert_eq!(status, "cancelled");
}

#[tokio::test]
async fn test_cannot_cancel_others_question() {
    let db = setup_db().await;
    let user_a = create_user(&db).await;
    let user_b = create_user(&db).await;
    let sess = create_session(&db, user_a).await;
    let participant_a = create_participant(&db, sess.session_id, user_a, "agent").await;
    let participant_b = create_participant(&db, sess.session_id, user_b, "human").await;

    let question_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO questions (id, session_id, project_id, asked_by, question_text)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(question_id)
    .bind(sess.session_id)
    .bind(sess.project_id)
    .bind(participant_a)
    .bind("My question")
    .execute(&db)
    .await
    .unwrap();

    // participant_b tries to cancel participant_a's question — should affect 0 rows
    let result = sqlx::query(
        "UPDATE questions SET status = 'cancelled' WHERE id = $1 AND asked_by = $2 AND status = 'pending'"
    )
    .bind(question_id).bind(participant_b)
    .execute(&db).await.unwrap();

    assert_eq!(
        result.rows_affected(),
        0,
        "Should not be able to cancel another's question"
    );

    let status: String = sqlx::query_scalar("SELECT status FROM questions WHERE id = $1")
        .bind(question_id)
        .fetch_one(&db)
        .await
        .unwrap();
    assert_eq!(status, "pending", "Question should still be pending");
}

#[tokio::test]
async fn test_cannot_answer_already_answered() {
    let db = setup_db().await;
    let user_id = create_user(&db).await;
    let sess = create_session(&db, user_id).await;
    let participant_id = create_participant(&db, sess.session_id, user_id, "human").await;

    let question_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO questions (id, session_id, project_id, asked_by, question_text, status, answer_text, answered_by, answered_at)
         VALUES ($1, $2, $3, $4, $5, 'answered', $6, $4, NOW())"
    )
    .bind(question_id).bind(sess.session_id).bind(sess.project_id)
    .bind(participant_id).bind("Already answered").bind("The answer")
    .execute(&db).await.unwrap();

    // Try to answer again — should affect 0 rows because status != 'pending'
    let result = sqlx::query(
        "UPDATE questions SET answer_text = $1, answered_by = $2, answered_at = NOW(), status = 'answered'
         WHERE id = $3 AND status = 'pending'"
    )
    .bind("New answer").bind(participant_id).bind(question_id)
    .execute(&db).await.unwrap();

    assert_eq!(
        result.rows_affected(),
        0,
        "Should not re-answer an already answered question"
    );
}

#[tokio::test]
async fn test_expired_question_lazy_update() {
    let db = setup_db().await;
    let user_id = create_user(&db).await;
    let sess = create_session(&db, user_id).await;
    let participant_id = create_participant(&db, sess.session_id, user_id, "agent").await;

    // Insert a question that has already expired
    sqlx::query(
        "INSERT INTO questions (id, session_id, project_id, asked_by, question_text, expires_at)
         VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '1 second')",
    )
    .bind(Uuid::new_v4())
    .bind(sess.session_id)
    .bind(sess.project_id)
    .bind(participant_id)
    .bind("Expired question")
    .execute(&db)
    .await
    .unwrap();

    // Insert a non-expired question
    let active_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO questions (id, session_id, project_id, asked_by, question_text, expires_at)
         VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '1 hour')",
    )
    .bind(active_id)
    .bind(sess.session_id)
    .bind(sess.project_id)
    .bind(participant_id)
    .bind("Active question")
    .execute(&db)
    .await
    .unwrap();

    // Lazy expiry update (same logic as list_questions handler)
    let result = sqlx::query(
        "UPDATE questions SET status = 'expired' WHERE session_id = $1 AND status = 'pending' AND expires_at IS NOT NULL AND expires_at < NOW()"
    )
    .bind(sess.session_id)
    .execute(&db).await.unwrap();

    assert_eq!(
        result.rows_affected(),
        1,
        "Should expire exactly one question"
    );

    // Active question should still be pending
    let active_status: String = sqlx::query_scalar("SELECT status FROM questions WHERE id = $1")
        .bind(active_id)
        .fetch_one(&db)
        .await
        .unwrap();
    assert_eq!(active_status, "pending");
}

#[tokio::test]
async fn test_question_status_constraint() {
    let db = setup_db().await;
    let user_id = create_user(&db).await;
    let sess = create_session(&db, user_id).await;
    let participant_id = create_participant(&db, sess.session_id, user_id, "agent").await;

    let result = sqlx::query(
        "INSERT INTO questions (session_id, project_id, asked_by, question_text, status)
         VALUES ($1, $2, $3, $4, 'invalid_status')",
    )
    .bind(sess.session_id)
    .bind(sess.project_id)
    .bind(participant_id)
    .bind("Bad status")
    .execute(&db)
    .await;

    assert!(
        result.is_err(),
        "Invalid status should be rejected by CHECK constraint"
    );
}

#[tokio::test]
async fn test_question_directed_to() {
    let db = setup_db().await;
    let user_a = create_user(&db).await;
    let user_b = create_user(&db).await;
    let sess = create_session(&db, user_a).await;
    let agent = create_participant(&db, sess.session_id, user_a, "agent").await;
    let human = create_participant(&db, sess.session_id, user_b, "human").await;

    let question_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO questions (id, session_id, project_id, asked_by, directed_to, question_text)
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(question_id)
    .bind(sess.session_id)
    .bind(sess.project_id)
    .bind(agent)
    .bind(human)
    .bind("Can you review this?")
    .execute(&db)
    .await
    .unwrap();

    let directed: Option<Uuid> =
        sqlx::query_scalar("SELECT directed_to FROM questions WHERE id = $1")
            .bind(question_id)
            .fetch_one(&db)
            .await
            .unwrap();

    assert_eq!(directed, Some(human));
}

#[tokio::test]
async fn test_question_cascade_on_session_delete() {
    let db = setup_db().await;
    let user_id = create_user(&db).await;
    let sess = create_session(&db, user_id).await;
    let participant_id = create_participant(&db, sess.session_id, user_id, "agent").await;

    sqlx::query(
        "INSERT INTO questions (session_id, project_id, asked_by, question_text)
         VALUES ($1, $2, $3, $4)",
    )
    .bind(sess.session_id)
    .bind(sess.project_id)
    .bind(participant_id)
    .bind("Will I survive?")
    .execute(&db)
    .await
    .unwrap();

    // Delete the session
    sqlx::query("DELETE FROM sessions WHERE id = $1")
        .bind(sess.session_id)
        .execute(&db)
        .await
        .unwrap();

    // Questions should be cascade-deleted
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM questions WHERE session_id = $1")
        .bind(sess.session_id)
        .fetch_one(&db)
        .await
        .unwrap();
    assert_eq!(count, 0, "Questions should be cascade-deleted with session");
}

#[tokio::test]
async fn test_question_filter_by_status() {
    let db = setup_db().await;
    let user_id = create_user(&db).await;
    let sess = create_session(&db, user_id).await;
    let participant_id = create_participant(&db, sess.session_id, user_id, "agent").await;

    // Create questions with different statuses
    for (status, text) in &[
        ("pending", "Pending Q"),
        ("answered", "Answered Q"),
        ("cancelled", "Cancelled Q"),
    ] {
        sqlx::query(
            "INSERT INTO questions (session_id, project_id, asked_by, question_text, status)
             VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(sess.session_id)
        .bind(sess.project_id)
        .bind(participant_id)
        .bind(*text)
        .bind(*status)
        .execute(&db)
        .await
        .unwrap();
    }

    let pending_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM questions WHERE session_id = $1 AND status = 'pending'",
    )
    .bind(sess.session_id)
    .fetch_one(&db)
    .await
    .unwrap();
    assert_eq!(pending_count, 1);

    let total_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM questions WHERE session_id = $1")
            .bind(sess.session_id)
            .fetch_one(&db)
            .await
            .unwrap();
    assert_eq!(total_count, 3);
}
