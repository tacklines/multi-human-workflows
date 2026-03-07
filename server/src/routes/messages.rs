use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::routes::tasks::resolve_session_pub;
use crate::AppState;

#[derive(Debug, Serialize)]
pub struct MessageView {
    pub id: Uuid,
    pub sender_id: Uuid,
    pub sender_name: String,
    pub recipient_id: Uuid,
    pub recipient_name: String,
    pub content: String,
    pub read_at: Option<chrono::DateTime<chrono::Utc>>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Deserialize)]
pub struct SendMessageRequest {
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct ListMessagesQuery {
    pub limit: Option<i64>,
}

/// GET /api/sessions/:code/participants/:participant_id/messages
/// Lists messages between the current user and a participant.
pub async fn list_messages(
    State(state): State<Arc<AppState>>,
    Path((session_code, participant_id)): Path<(String, Uuid)>,
    Query(query): Query<ListMessagesQuery>,
    AuthUser(claims): AuthUser,
) -> Result<Json<Vec<MessageView>>, StatusCode> {
    let user = crate::db::upsert_user(&state.db, &claims)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let session = resolve_session_pub(&state.db, &session_code).await?;
    let me = resolve_participant_for_user(&state.db, session.id, user.id).await?;
    let limit = query.limit.unwrap_or(50).min(200);

    let rows = sqlx::query_as::<_, (Uuid, Uuid, String, Uuid, String, String, Option<chrono::DateTime<chrono::Utc>>, chrono::DateTime<chrono::Utc>)>(
        "SELECT m.id, m.sender_id, s.display_name, m.recipient_id, r.display_name, m.content, m.read_at, m.created_at
         FROM messages m
         JOIN participants s ON s.id = m.sender_id
         JOIN participants r ON r.id = m.recipient_id
         WHERE m.session_id = $1
           AND ((m.sender_id = $2 AND m.recipient_id = $3) OR (m.sender_id = $3 AND m.recipient_id = $2))
         ORDER BY m.created_at ASC
         LIMIT $4"
    )
    .bind(session.id)
    .bind(me.id)
    .bind(participant_id)
    .bind(limit)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to fetch messages: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let views: Vec<MessageView> = rows
        .into_iter()
        .map(
            |(
                id,
                sender_id,
                sender_name,
                recipient_id,
                recipient_name,
                content,
                read_at,
                created_at,
            )| {
                MessageView {
                    id,
                    sender_id,
                    sender_name,
                    recipient_id,
                    recipient_name,
                    content,
                    read_at,
                    created_at,
                }
            },
        )
        .collect();

    Ok(Json(views))
}

/// POST /api/sessions/:code/participants/:participant_id/messages
/// Send a directed message to a participant.
pub async fn send_message(
    State(state): State<Arc<AppState>>,
    Path((session_code, participant_id)): Path<(String, Uuid)>,
    AuthUser(claims): AuthUser,
    Json(req): Json<SendMessageRequest>,
) -> Result<(StatusCode, Json<MessageView>), StatusCode> {
    if req.content.trim().is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let user = crate::db::upsert_user(&state.db, &claims)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let session = resolve_session_pub(&state.db, &session_code).await?;
    let me = resolve_participant_for_user(&state.db, session.id, user.id).await?;

    // Verify recipient exists in this session
    let recipient = sqlx::query_as::<_, (String,)>(
        "SELECT display_name FROM participants WHERE id = $1 AND session_id = $2",
    )
    .bind(participant_id)
    .bind(session.id)
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)?;

    let row = sqlx::query_as::<_, (Uuid, chrono::DateTime<chrono::Utc>)>(
        "INSERT INTO messages (session_id, sender_id, recipient_id, content)
         VALUES ($1, $2, $3, $4)
         RETURNING id, created_at",
    )
    .bind(session.id)
    .bind(me.id)
    .bind(participant_id)
    .bind(&req.content)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to send message: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let view = MessageView {
        id: row.0,
        sender_id: me.id,
        sender_name: me.display_name.clone(),
        recipient_id: participant_id,
        recipient_name: recipient.0,
        content: req.content,
        read_at: None,
        created_at: row.1,
    };

    // Notify recipient via WebSocket
    state
        .connections
        .send_to_participant(
            &session.code,
            &participant_id.to_string(),
            &serde_json::json!({
                "type": "message_received",
                "messageId": view.id,
                "senderId": view.sender_id,
                "senderName": view.sender_name,
                "content": view.content,
            }),
        )
        .await;

    // Also broadcast to session so all participants see the activity
    state
        .connections
        .broadcast_to_session(
            &session.code,
            &serde_json::json!({
                "type": "message_sent",
                "senderId": view.sender_id,
                "recipientId": view.recipient_id,
            }),
        )
        .await;

    Ok((StatusCode::CREATED, Json(view)))
}

async fn resolve_participant_for_user(
    db: &sqlx::PgPool,
    session_id: Uuid,
    user_id: Uuid,
) -> Result<crate::models::Participant, StatusCode> {
    sqlx::query_as::<_, crate::models::Participant>(
        "SELECT * FROM participants WHERE session_id = $1 AND user_id = $2 AND participant_type = 'human'"
    )
    .bind(session_id)
    .bind(user_id)
    .fetch_optional(db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::FORBIDDEN)
}
