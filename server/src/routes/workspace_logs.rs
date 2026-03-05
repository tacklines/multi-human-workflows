use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use std::sync::Arc;
use uuid::Uuid;

use crate::log_buffer::LogLine;
use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct IngestPath {
    pub workspace_id: Uuid,
}

/// POST /api/workspaces/:workspace_id/logs
///
/// Accepts an array of log lines from the workspace sidecar.
/// Authenticated via agent token (sat_) — validated by the workspace's session.
pub async fn ingest_logs(
    State(state): State<Arc<AppState>>,
    Path(workspace_id): Path<Uuid>,
    Json(lines): Json<Vec<LogLine>>,
) -> Result<StatusCode, StatusCode> {
    // Look up workspace to find participant_id and session_code
    let row: Option<(Uuid, Uuid)> = sqlx::query_as(
        "SELECT w.id, w.task_id FROM workspaces w WHERE w.id = $1"
    )
    .bind(workspace_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to look up workspace: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let (_ws_id, _task_id) = row.ok_or(StatusCode::NOT_FOUND)?;

    // Find participant linked to this workspace via the agent launch flow
    // Workspaces are linked to a participant via the task's assigned_to or creator
    let participant_info: Option<(Uuid, String)> = sqlx::query_as(
        "SELECT p.id, s.code
         FROM workspaces w
         JOIN tasks t ON t.id = w.task_id
         JOIN participants p ON p.id = COALESCE(t.assigned_to, t.created_by)
         JOIN sessions s ON s.id = p.session_id
         WHERE w.id = $1"
    )
    .bind(workspace_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to resolve workspace participant: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let (participant_id, session_code) = participant_info.ok_or(StatusCode::NOT_FOUND)?;

    for line in lines {
        // Buffer for history retrieval
        state.log_buffer.push(participant_id, line.clone());

        // Broadcast to subscribed WebSocket clients
        state.connections.broadcast_agent_stream(
            &session_code,
            &participant_id.to_string(),
            &serde_json::json!({
                "type": "agent_stream",
                "stream": "output",
                "participant_id": participant_id,
                "data": {
                    "line": line.line,
                    "fd": line.fd,
                    "ts": line.ts,
                }
            }),
        ).await;
    }

    Ok(StatusCode::NO_CONTENT)
}

#[derive(Debug, Deserialize)]
pub struct LogHistoryQuery {
    pub limit: Option<usize>,
}

/// GET /api/workspaces/:workspace_id/logs
pub async fn get_logs(
    State(state): State<Arc<AppState>>,
    Path(workspace_id): Path<Uuid>,
    Query(query): Query<LogHistoryQuery>,
) -> Result<Json<Vec<LogLine>>, StatusCode> {
    // Resolve participant from workspace
    let participant_id: Option<(Uuid,)> = sqlx::query_as(
        "SELECT p.id
         FROM workspaces w
         JOIN tasks t ON t.id = w.task_id
         JOIN participants p ON p.id = COALESCE(t.assigned_to, t.created_by)
         WHERE w.id = $1"
    )
    .bind(workspace_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to resolve workspace participant: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let (pid,) = participant_id.ok_or(StatusCode::NOT_FOUND)?;
    let limit = query.limit.unwrap_or(100).min(500);
    let lines = state.log_buffer.recent(pid, limit);

    Ok(Json(lines))
}
