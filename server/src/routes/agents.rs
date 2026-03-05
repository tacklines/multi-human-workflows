use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use std::sync::Arc;
use uuid::Uuid;

use crate::agent_token;
use crate::auth::AuthUser;
use crate::coder;
use crate::db;
use crate::models::*;
use crate::AppState;

// --- DTOs ---

#[derive(Debug, serde::Deserialize)]
pub struct LaunchAgentRequest {
    /// Agent type determines the template behavior: "coder", "planner", "reviewer"
    pub agent_type: Option<String>,
    /// Optional task to associate the agent with
    pub task_id: Option<Uuid>,
    /// Git branch override (defaults to project's default_branch)
    pub branch: Option<String>,
    /// Custom instructions passed to the agent
    pub instructions: Option<String>,
}

#[derive(Debug, serde::Serialize)]
pub struct LaunchAgentResponse {
    pub workspace_id: Uuid,
    pub participant_id: Uuid,
    pub agent_code: String,
    pub status: WorkspaceStatus,
}

// --- Handler ---

/// POST /api/sessions/:code/agents
///
/// Launch an AI agent into a session. Creates a Coder workspace with:
/// - The project's repo cloned
/// - Seam MCP tools configured (pointing back to this server)
/// - The human's agent code injected for session authentication
pub async fn launch_agent(
    State(state): State<Arc<AppState>>,
    Path(code): Path<String>,
    AuthUser(claims): AuthUser,
    Json(req): Json<LaunchAgentRequest>,
) -> Result<(StatusCode, Json<LaunchAgentResponse>), StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Verify session exists and is open
    let session: Session = sqlx::query_as(
        "SELECT * FROM sessions WHERE code = $1 AND closed_at IS NULL",
    )
    .bind(&code)
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)?;

    // Verify user is a participant
    let participant: Participant = sqlx::query_as(
        "SELECT * FROM participants WHERE session_id = $1 AND user_id = $2 AND participant_type = 'human'",
    )
    .bind(session.id)
    .bind(user.id)
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::FORBIDDEN)?;

    // Verify Coder is configured
    let _coder_client = state.coder.as_ref().ok_or_else(|| {
        tracing::warn!("Coder integration not configured");
        StatusCode::SERVICE_UNAVAILABLE
    })?;

    // Get the user's agent code for this session
    let (agent_code,): (String,) = sqlx::query_as(
        "SELECT code FROM agent_join_codes WHERE session_id = $1 AND user_id = $2",
    )
    .bind(session.id)
    .bind(user.id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to find agent code: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Get project for repo URL
    let project: Project = sqlx::query_as("SELECT * FROM projects WHERE id = $1")
        .bind(session.project_id)
        .fetch_one(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let agent_type = req.agent_type.unwrap_or_else(|| "coder".to_string());
    let branch = req.branch.or_else(|| {
        let b = &project.default_branch;
        if b.is_empty() { None } else { Some(b.clone()) }
    });
    let template_name = "seam-agent".to_string();

    // Determine the Seam server URL that the agent should connect to.
    // In production this would be a public URL; for local dev we use host.docker.internal
    // since the agent runs in a Docker container.
    let seam_url = std::env::var("SEAM_URL")
        .unwrap_or_else(|_| "http://host.docker.internal:3002".to_string());

    // Create workspace record
    let workspace = sqlx::query_as::<_, Workspace>(
        "INSERT INTO workspaces (task_id, project_id, template_name, branch, status)
         VALUES ($1, $2, $3, $4, 'pending')
         RETURNING *",
    )
    .bind(req.task_id.unwrap_or(Uuid::nil()))
    .bind(session.project_id)
    .bind(&template_name)
    .bind(&branch)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to create workspace record: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Create the agent participant record immediately so it shows in the UI
    let agent_display_name = format!("{}'s {} Agent", user.display_name, capitalize(&agent_type));
    let agent_participant_id = Uuid::new_v4();

    sqlx::query(
        "INSERT INTO participants (id, session_id, user_id, display_name, participant_type, sponsor_id, joined_at)
         VALUES ($1, $2, $3, $4, 'agent', $5, NOW())",
    )
    .bind(agent_participant_id)
    .bind(session.id)
    .bind(user.id)
    .bind(&agent_display_name)
    .bind(participant.id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to create agent participant: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Broadcast participant joined
    state
        .connections
        .broadcast_to_session(
            &session.code,
            &serde_json::json!({
                "type": "participant_joined",
                "participant": {
                    "id": agent_participant_id,
                    "display_name": agent_display_name,
                    "participant_type": "agent",
                    "sponsor_id": participant.id,
                    "joined_at": chrono::Utc::now(),
                }
            }),
        )
        .await;

    // Emit domain event
    let event = crate::events::DomainEvent::new(
        "agent.launched",
        "workspace",
        workspace.id,
        Some(user.id),
        serde_json::json!({
            "session_code": code,
            "agent_type": agent_type,
            "agent_participant_id": agent_participant_id,
            "workspace_id": workspace.id,
        }),
    );
    if let Err(e) = crate::events::emit(&state.db, &event).await {
        tracing::warn!("Failed to emit domain event: {e}");
    }

    // Generate agent token for MCP authentication (24h TTL)
    let seam_token = agent_token::create_token(
        &state.db,
        user.id,
        Some(session.id),
        &agent_display_name,
        chrono::Duration::hours(24),
    )
    .await
    .map_err(|e| {
        tracing::error!("Failed to create agent token: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Spawn async provisioning
    let ws_id = workspace.id;
    let db = state.db.clone();
    let coder_url = std::env::var("CODER_URL").unwrap_or_default();
    let coder_token = std::env::var("CODER_TOKEN").unwrap_or_default();
    let repo_url = project.repo_url.clone().unwrap_or_default();
    let agent_code_clone = agent_code.clone();

    tokio::spawn(async move {
        let client = coder::CoderClient::new(coder_url, coder_token);
        provision_agent_workspace(
            &db,
            &client,
            ws_id,
            &template_name,
            branch.as_deref(),
            &repo_url,
            &seam_url,
            &agent_code_clone,
            &agent_type,
            req.instructions.as_deref(),
            &seam_token,
        )
        .await;
    });

    Ok((
        StatusCode::CREATED,
        Json(LaunchAgentResponse {
            workspace_id: workspace.id,
            participant_id: agent_participant_id,
            agent_code,
            status: WorkspaceStatus::Pending,
        }),
    ))
}

/// Background task: create Coder workspace with agent-specific params.
async fn provision_agent_workspace(
    db: &sqlx::PgPool,
    client: &coder::CoderClient,
    workspace_id: Uuid,
    template_name: &str,
    branch: Option<&str>,
    repo_url: &str,
    seam_url: &str,
    agent_code: &str,
    agent_type: &str,
    instructions: Option<&str>,
    seam_token: &str,
) {
    // Mark as creating
    let _ = sqlx::query(
        "UPDATE workspaces SET status = 'creating', updated_at = NOW() WHERE id = $1",
    )
    .bind(workspace_id)
    .execute(db)
    .await;

    // Resolve template
    let template = match client.get_template_by_name(template_name).await {
        Ok(Some(t)) => t,
        Ok(None) => {
            fail_workspace(db, workspace_id, &format!("Template '{template_name}' not found")).await;
            return;
        }
        Err(e) => {
            fail_workspace(db, workspace_id, &format!("Failed to resolve template: {e}")).await;
            return;
        }
    };

    let ws_name = format!("seam-{}", &workspace_id.to_string()[..8]);

    let mut params = vec![
        coder::RichParameterValue {
            name: "seam_url".to_string(),
            value: seam_url.to_string(),
        },
        coder::RichParameterValue {
            name: "agent_code".to_string(),
            value: agent_code.to_string(),
        },
        coder::RichParameterValue {
            name: "agent_type".to_string(),
            value: agent_type.to_string(),
        },
        coder::RichParameterValue {
            name: "seam_token".to_string(),
            value: seam_token.to_string(),
        },
    ];

    if !repo_url.is_empty() {
        params.push(coder::RichParameterValue {
            name: "repo_url".to_string(),
            value: repo_url.to_string(),
        });
    }
    if let Some(b) = branch {
        params.push(coder::RichParameterValue {
            name: "branch".to_string(),
            value: b.to_string(),
        });
    }
    if let Some(instr) = instructions {
        params.push(coder::RichParameterValue {
            name: "instructions".to_string(),
            value: instr.to_string(),
        });
    }

    let req = coder::CreateWorkspaceRequest {
        name: ws_name,
        template_id: template.id,
        rich_parameter_values: params,
    };

    match client.create_workspace("me", req).await {
        Ok(coder_ws) => {
            let _ = sqlx::query(
                "UPDATE workspaces SET
                    coder_workspace_id = $2,
                    coder_workspace_name = $3,
                    status = 'running',
                    started_at = NOW(),
                    updated_at = NOW()
                 WHERE id = $1",
            )
            .bind(workspace_id)
            .bind(coder_ws.id)
            .bind(&coder_ws.name)
            .execute(db)
            .await;

            let event = crate::events::DomainEvent::new(
                "workspace.running",
                "workspace",
                workspace_id,
                None,
                serde_json::json!({
                    "coder_workspace_id": coder_ws.id,
                    "coder_workspace_name": coder_ws.name,
                }),
            );
            if let Err(e) = crate::events::emit(db, &event).await {
                tracing::warn!("Failed to emit domain event: {e}");
            }

            tracing::info!(
                workspace_id = %workspace_id,
                coder_id = %coder_ws.id,
                "Agent workspace created"
            );
        }
        Err(e) => {
            fail_workspace(db, workspace_id, &format!("Failed to create workspace: {e}")).await;
        }
    }
}

async fn fail_workspace(db: &sqlx::PgPool, workspace_id: Uuid, error_message: &str) {
    tracing::error!(workspace_id = %workspace_id, "{error_message}");
    let _ = sqlx::query(
        "UPDATE workspaces SET status = 'failed', error_message = $2, updated_at = NOW() WHERE id = $1",
    )
    .bind(workspace_id)
    .bind(error_message)
    .execute(db)
    .await;
    let event = crate::events::DomainEvent::new(
        "workspace.failed",
        "workspace",
        workspace_id,
        None,
        serde_json::json!({ "error_message": error_message }),
    );
    if let Err(e) = crate::events::emit(db, &event).await {
        tracing::warn!("Failed to emit domain event: {e}");
    }
}

fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        None => String::new(),
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
    }
}
