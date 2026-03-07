use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::db;
use crate::models::*;
use crate::AppState;

// --- DTOs ---

#[derive(Debug, Serialize)]
pub struct PlanListView {
    pub id: Uuid,
    pub title: String,
    pub slug: String,
    pub status: PlanStatus,
    pub author_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct PlanDetailView {
    pub id: Uuid,
    pub project_id: Uuid,
    pub author_id: Uuid,
    pub title: String,
    pub slug: String,
    pub body: String,
    pub status: PlanStatus,
    pub parent_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreatePlanRequest {
    pub title: String,
    pub slug: Option<String>,
    pub body: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePlanRequest {
    pub title: Option<String>,
    pub body: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ListPlansQuery {
    pub status: Option<String>,
}

// --- Helpers ---

fn slugify(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

/// Verify that a user is a member of the given project. Returns 404 if not.
async fn verify_project_member(
    db: &sqlx::PgPool,
    project_id: Uuid,
    user_id: Uuid,
) -> Result<(), StatusCode> {
    let exists: Option<(Uuid,)> = sqlx::query_as(
        "SELECT project_id FROM project_members WHERE project_id = $1 AND user_id = $2",
    )
    .bind(project_id)
    .bind(user_id)
    .fetch_optional(db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to check project membership: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if exists.is_none() {
        return Err(StatusCode::NOT_FOUND);
    }
    Ok(())
}

/// Validate a status transition. Returns the new PlanStatus or an error.
fn validate_transition(current: PlanStatus, requested: &str) -> Result<PlanStatus, StatusCode> {
    let new_status = match requested {
        "draft" => PlanStatus::Draft,
        "review" => PlanStatus::Review,
        "accepted" => PlanStatus::Accepted,
        "superseded" => PlanStatus::Superseded,
        "abandoned" => PlanStatus::Abandoned,
        _ => return Err(StatusCode::BAD_REQUEST),
    };

    let allowed = match current {
        PlanStatus::Draft => matches!(new_status, PlanStatus::Review | PlanStatus::Abandoned),
        PlanStatus::Review => matches!(
            new_status,
            PlanStatus::Accepted | PlanStatus::Draft | PlanStatus::Abandoned
        ),
        PlanStatus::Accepted => {
            matches!(new_status, PlanStatus::Superseded | PlanStatus::Abandoned)
        }
        PlanStatus::Superseded | PlanStatus::Abandoned => false,
    };

    if !allowed {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }

    Ok(new_status)
}

// --- Handlers ---

pub async fn list_plans(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<Uuid>,
    Query(query): Query<ListPlansQuery>,
    AuthUser(claims): AuthUser,
) -> Result<Json<Vec<PlanListView>>, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    verify_project_member(&state.db, project_id, user.id).await?;

    let plans = if let Some(ref status) = query.status {
        sqlx::query_as::<_, Plan>(
            "SELECT * FROM plans WHERE project_id = $1 AND status = $2 ORDER BY updated_at DESC",
        )
        .bind(project_id)
        .bind(status)
        .fetch_all(&state.db)
        .await
    } else {
        sqlx::query_as::<_, Plan>(
            "SELECT * FROM plans WHERE project_id = $1 ORDER BY updated_at DESC",
        )
        .bind(project_id)
        .fetch_all(&state.db)
        .await
    }
    .map_err(|e| {
        tracing::error!("Failed to list plans: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(
        plans
            .into_iter()
            .map(|p| PlanListView {
                id: p.id,
                title: p.title,
                slug: p.slug,
                status: p.status,
                author_id: p.author_id,
                created_at: p.created_at,
                updated_at: p.updated_at,
            })
            .collect(),
    ))
}

pub async fn get_plan(
    State(state): State<Arc<AppState>>,
    Path((project_id, plan_id)): Path<(Uuid, Uuid)>,
    AuthUser(claims): AuthUser,
) -> Result<Json<PlanDetailView>, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    verify_project_member(&state.db, project_id, user.id).await?;

    let plan = sqlx::query_as::<_, Plan>("SELECT * FROM plans WHERE id = $1 AND project_id = $2")
        .bind(plan_id)
        .bind(project_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to get plan: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(PlanDetailView {
        id: plan.id,
        project_id: plan.project_id,
        author_id: plan.author_id,
        title: plan.title,
        slug: plan.slug,
        body: plan.body,
        status: plan.status,
        parent_id: plan.parent_id,
        created_at: plan.created_at,
        updated_at: plan.updated_at,
    }))
}

pub async fn create_plan(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<Uuid>,
    AuthUser(claims): AuthUser,
    Json(req): Json<CreatePlanRequest>,
) -> Result<(StatusCode, Json<PlanDetailView>), StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    verify_project_member(&state.db, project_id, user.id).await?;

    let slug = req.slug.unwrap_or_else(|| slugify(&req.title));
    let body = req.body.unwrap_or_default();

    let plan = sqlx::query_as::<_, Plan>(
        "INSERT INTO plans (project_id, author_id, title, slug, body)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *",
    )
    .bind(project_id)
    .bind(user.id)
    .bind(&req.title)
    .bind(&slug)
    .bind(&body)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to create plan: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok((
        StatusCode::CREATED,
        Json(PlanDetailView {
            id: plan.id,
            project_id: plan.project_id,
            author_id: plan.author_id,
            title: plan.title,
            slug: plan.slug,
            body: plan.body,
            status: plan.status,
            parent_id: plan.parent_id,
            created_at: plan.created_at,
            updated_at: plan.updated_at,
        }),
    ))
}

pub async fn update_plan(
    State(state): State<Arc<AppState>>,
    Path((project_id, plan_id)): Path<(Uuid, Uuid)>,
    AuthUser(claims): AuthUser,
    Json(req): Json<UpdatePlanRequest>,
) -> Result<Json<PlanDetailView>, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    verify_project_member(&state.db, project_id, user.id).await?;

    // Fetch current plan
    let current =
        sqlx::query_as::<_, Plan>("SELECT * FROM plans WHERE id = $1 AND project_id = $2")
            .bind(plan_id)
            .bind(project_id)
            .fetch_optional(&state.db)
            .await
            .map_err(|e| {
                tracing::error!("Failed to get plan: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            })?
            .ok_or(StatusCode::NOT_FOUND)?;

    // Validate status transition if requested
    let new_status = if let Some(ref status_str) = req.status {
        Some(validate_transition(current.status, status_str)?)
    } else {
        None
    };

    // Build dynamic update
    let has_updates = req.title.is_some() || req.body.is_some() || new_status.is_some();

    let plan = if has_updates {
        let mut set_clauses = vec!["updated_at = NOW()".to_string()];
        let mut bind_idx = 3u32; // $1 = plan_id, $2 = project_id

        if req.title.is_some() {
            set_clauses.push(format!("title = ${bind_idx}"));
            bind_idx += 1;
        }
        if req.body.is_some() {
            set_clauses.push(format!("body = ${bind_idx}"));
            bind_idx += 1;
        }
        if new_status.is_some() {
            set_clauses.push(format!("status = ${bind_idx}"));
        }

        let query = format!(
            "UPDATE plans SET {} WHERE id = $1 AND project_id = $2 RETURNING *",
            set_clauses.join(", ")
        );

        let mut q = sqlx::query_as::<_, Plan>(&query)
            .bind(plan_id)
            .bind(project_id);

        if let Some(ref title) = req.title {
            q = q.bind(title);
        }
        if let Some(ref body) = req.body {
            q = q.bind(body);
        }
        if let Some(ref status) = new_status {
            // Bind as text representation
            let status_str = match status {
                PlanStatus::Draft => "draft",
                PlanStatus::Review => "review",
                PlanStatus::Accepted => "accepted",
                PlanStatus::Superseded => "superseded",
                PlanStatus::Abandoned => "abandoned",
            };
            q = q.bind(status_str);
        }

        q.fetch_one(&state.db).await.map_err(|e| {
            tracing::error!("Failed to update plan: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?
    } else {
        current
    };

    Ok(Json(PlanDetailView {
        id: plan.id,
        project_id: plan.project_id,
        author_id: plan.author_id,
        title: plan.title,
        slug: plan.slug,
        body: plan.body,
        status: plan.status,
        parent_id: plan.parent_id,
        created_at: plan.created_at,
        updated_at: plan.updated_at,
    }))
}
