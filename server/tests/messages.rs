//! Integration tests for the messaging and questions data model.
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

async fn create_test_context(db: &PgPool) -> (Uuid, Uuid, Uuid, Uuid, Uuid) {
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
    let code = format!("MS{}", &Uuid::new_v4().to_string()[..4]).to_uppercase();
    sqlx::query("INSERT INTO sessions (id, project_id, name, code, created_by, created_at) VALUES ($1, $2, $3, $4, $5, NOW())")
        .bind(session_id).bind(project_id).bind("Test Session").bind(&code).bind(user_id)
        .execute(db).await.unwrap();

    let human_id = Uuid::new_v4();
    sqlx::query("INSERT INTO participants (id, session_id, user_id, display_name, participant_type, joined_at) VALUES ($1, $2, $3, $4, 'human', NOW())")
        .bind(human_id).bind(session_id).bind(user_id).bind("Human User")
        .execute(db).await.unwrap();

    let agent_id = Uuid::new_v4();
    sqlx::query("INSERT INTO participants (id, session_id, user_id, display_name, participant_type, sponsor_id, joined_at) VALUES ($1, $2, $3, $4, 'agent', $5, NOW())")
        .bind(agent_id).bind(session_id).bind(user_id).bind("Agent").bind(human_id)
        .execute(db).await.unwrap();

    (session_id, project_id, human_id, agent_id, user_id)
}

#[tokio::test]
async fn test_send_message() {
    let db = setup_db().await;
    let (session_id, _, human_id, agent_id, _) = create_test_context(&db).await;

    let (msg_id,): (Uuid,) = sqlx::query_as(
        "INSERT INTO messages (session_id, sender_id, recipient_id, content) VALUES ($1, $2, $3, $4) RETURNING id"
    )
    .bind(session_id).bind(human_id).bind(agent_id).bind("Please investigate the auth bug")
    .fetch_one(&db).await.unwrap();

    let (content, read_at): (String, Option<chrono::DateTime<chrono::Utc>>) =
        sqlx::query_as("SELECT content, read_at FROM messages WHERE id = $1")
            .bind(msg_id)
            .fetch_one(&db)
            .await
            .unwrap();

    assert_eq!(content, "Please investigate the auth bug");
    assert!(read_at.is_none(), "Message should be unread initially");
}

#[tokio::test]
async fn test_mark_messages_read() {
    let db = setup_db().await;
    let (session_id, _, human_id, agent_id, _) = create_test_context(&db).await;

    // Send 3 messages
    let mut msg_ids = Vec::new();
    for i in 0..3 {
        let (id,): (Uuid,) = sqlx::query_as(
            "INSERT INTO messages (session_id, sender_id, recipient_id, content) VALUES ($1, $2, $3, $4) RETURNING id"
        )
        .bind(session_id).bind(human_id).bind(agent_id).bind(format!("Message {i}"))
        .fetch_one(&db).await.unwrap();
        msg_ids.push(id);
    }

    // Mark first two as read
    sqlx::query("UPDATE messages SET read_at = NOW() WHERE id = ANY($1)")
        .bind(&msg_ids[..2])
        .execute(&db)
        .await
        .unwrap();

    let unread_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM messages WHERE session_id = $1 AND recipient_id = $2 AND read_at IS NULL"
    ).bind(session_id).bind(agent_id).fetch_one(&db).await.unwrap();

    assert_eq!(unread_count, 1);
}

#[tokio::test]
async fn test_create_question() {
    let db = setup_db().await;
    let (session_id, project_id, _, agent_id, _) = create_test_context(&db).await;

    let question_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO questions (id, session_id, project_id, asked_by, question_text, status) VALUES ($1, $2, $3, $4, $5, 'pending')"
    )
    .bind(question_id).bind(session_id).bind(project_id).bind(agent_id)
    .bind("What is the expected behavior for expired tokens?")
    .execute(&db).await.unwrap();

    let (status, answer): (String, Option<String>) =
        sqlx::query_as("SELECT status, answer_text FROM questions WHERE id = $1")
            .bind(question_id)
            .fetch_one(&db)
            .await
            .unwrap();

    assert_eq!(status, "pending");
    assert!(answer.is_none());
}

#[tokio::test]
async fn test_answer_question() {
    let db = setup_db().await;
    let (session_id, project_id, human_id, agent_id, _) = create_test_context(&db).await;

    let question_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO questions (id, session_id, project_id, asked_by, question_text, status) VALUES ($1, $2, $3, $4, $5, 'pending')"
    )
    .bind(question_id).bind(session_id).bind(project_id).bind(agent_id)
    .bind("Should we retry failed requests?")
    .execute(&db).await.unwrap();

    // Human answers
    sqlx::query(
        "UPDATE questions SET status = 'answered', answer_text = $1, answered_by = $2, answered_at = NOW() WHERE id = $3"
    )
    .bind("Yes, retry with exponential backoff up to 3 times")
    .bind(human_id).bind(question_id)
    .execute(&db).await.unwrap();

    let (status, answer, answered_by): (String, Option<String>, Option<Uuid>) =
        sqlx::query_as("SELECT status, answer_text, answered_by FROM questions WHERE id = $1")
            .bind(question_id)
            .fetch_one(&db)
            .await
            .unwrap();

    assert_eq!(status, "answered");
    assert_eq!(
        answer.unwrap(),
        "Yes, retry with exponential backoff up to 3 times"
    );
    assert_eq!(answered_by.unwrap(), human_id);
}

#[tokio::test]
async fn test_directed_question() {
    let db = setup_db().await;
    let (session_id, project_id, human_id, agent_id, _) = create_test_context(&db).await;

    let question_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO questions (id, session_id, project_id, asked_by, directed_to, question_text, context, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')"
    )
    .bind(question_id).bind(session_id).bind(project_id).bind(agent_id)
    .bind(human_id)
    .bind("Can you clarify the auth requirement?")
    .bind(serde_json::json!({"task_id": "some-task", "topic": "authentication"}))
    .execute(&db).await.unwrap();

    let (directed_to, context): (Option<Uuid>, Option<serde_json::Value>) =
        sqlx::query_as("SELECT directed_to, context FROM questions WHERE id = $1")
            .bind(question_id)
            .fetch_one(&db)
            .await
            .unwrap();

    assert_eq!(directed_to.unwrap(), human_id);
    assert_eq!(context.unwrap()["topic"], "authentication");
}

#[tokio::test]
async fn test_cancel_own_question() {
    let db = setup_db().await;
    let (session_id, project_id, _, agent_id, _) = create_test_context(&db).await;

    let question_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO questions (id, session_id, project_id, asked_by, question_text, status) VALUES ($1, $2, $3, $4, $5, 'pending')"
    )
    .bind(question_id).bind(session_id).bind(project_id).bind(agent_id)
    .bind("Never mind this question")
    .execute(&db).await.unwrap();

    // Cancel — must match asked_by and status=pending
    let result = sqlx::query(
        "UPDATE questions SET status = 'cancelled' WHERE id = $1 AND asked_by = $2 AND status = 'pending'"
    ).bind(question_id).bind(agent_id).execute(&db).await.unwrap();

    assert_eq!(result.rows_affected(), 1);

    let (status,): (String,) = sqlx::query_as("SELECT status FROM questions WHERE id = $1")
        .bind(question_id)
        .fetch_one(&db)
        .await
        .unwrap();

    assert_eq!(status, "cancelled");
}

#[tokio::test]
async fn test_cannot_cancel_others_question() {
    let db = setup_db().await;
    let (session_id, project_id, human_id, agent_id, _) = create_test_context(&db).await;

    let question_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO questions (id, session_id, project_id, asked_by, question_text, status) VALUES ($1, $2, $3, $4, $5, 'pending')"
    )
    .bind(question_id).bind(session_id).bind(project_id).bind(agent_id)
    .bind("Agent's question")
    .execute(&db).await.unwrap();

    // Human tries to cancel agent's question
    let result = sqlx::query(
        "UPDATE questions SET status = 'cancelled' WHERE id = $1 AND asked_by = $2 AND status = 'pending'"
    ).bind(question_id).bind(human_id).execute(&db).await.unwrap();

    assert_eq!(
        result.rows_affected(),
        0,
        "Should not be able to cancel someone else's question"
    );
}
