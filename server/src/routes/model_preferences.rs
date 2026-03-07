use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::db;
use crate::models::{OrgRole, Organization};
use crate::AppState;

#[derive(Debug, Serialize)]
pub struct ModelPreferenceView {
    pub key: String,
    pub value: Value,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct UpsertModelPreferencesRequest {
    pub preferences: Vec<PreferenceEntry>,
}

#[derive(Debug, Deserialize)]
pub struct PreferenceEntry {
    pub key: String,
    pub value: Value,
}

/// Valid preference keys shared by both user and org.
const VALID_KEYS: &[&str] = &[
    "default_model",
    "default_budget",
    "default_provider",
    "model_allowlist",
    "model_denylist",
];

fn validate_keys(entries: &[PreferenceEntry]) -> Result<(), (StatusCode, String)> {
    for entry in entries {
        if !VALID_KEYS.contains(&entry.key.as_str()) {
            return Err((
                StatusCode::BAD_REQUEST,
                format!("Unknown preference key: {}", entry.key),
            ));
        }
    }
    Ok(())
}

// --- User endpoints ---

/// GET /api/me/model-preferences
pub async fn list_user_model_preferences(
    State(state): State<Arc<AppState>>,
    AuthUser(claims): AuthUser,
) -> Result<Json<Vec<ModelPreferenceView>>, StatusCode> {
    let user = db::upsert_user(&state.db, &claims)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let rows = sqlx::query_as::<_, (String, Value, DateTime<Utc>)>(
        "SELECT preference_key, preference_value, updated_at
         FROM user_model_preferences
         WHERE user_id = $1
         ORDER BY preference_key",
    )
    .bind(user.id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to list user model preferences: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(
        rows.into_iter()
            .map(|(key, value, updated_at)| ModelPreferenceView {
                key,
                value,
                updated_at,
            })
            .collect(),
    ))
}

/// PUT /api/me/model-preferences
pub async fn upsert_user_model_preferences(
    State(state): State<Arc<AppState>>,
    AuthUser(claims): AuthUser,
    Json(req): Json<UpsertModelPreferencesRequest>,
) -> Result<Json<Vec<ModelPreferenceView>>, (StatusCode, Json<serde_json::Value>)> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": "internal error"})),
        )
    })?;

    validate_keys(&req.preferences)
        .map_err(|(status, msg)| (status, Json(serde_json::json!({"error": msg}))))?;

    for entry in &req.preferences {
        sqlx::query(
            "INSERT INTO user_model_preferences (user_id, preference_key, preference_value, updated_at)
             VALUES ($1, $2, $3, now())
             ON CONFLICT (user_id, preference_key)
             DO UPDATE SET preference_value = EXCLUDED.preference_value, updated_at = now()",
        )
        .bind(user.id)
        .bind(&entry.key)
        .bind(&entry.value)
        .execute(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to upsert user model preference: {e}");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": "internal error"})))
        })?;
    }

    let rows = sqlx::query_as::<_, (String, Value, DateTime<Utc>)>(
        "SELECT preference_key, preference_value, updated_at
         FROM user_model_preferences
         WHERE user_id = $1
         ORDER BY preference_key",
    )
    .bind(user.id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to fetch user model preferences after upsert: {e}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": "internal error"})),
        )
    })?;

    Ok(Json(
        rows.into_iter()
            .map(|(key, value, updated_at)| ModelPreferenceView {
                key,
                value,
                updated_at,
            })
            .collect(),
    ))
}

// --- Org endpoints ---

/// GET /api/orgs/{slug}/model-preferences
pub async fn list_org_model_preferences(
    State(state): State<Arc<AppState>>,
    Path(slug): Path<String>,
    AuthUser(claims): AuthUser,
) -> Result<Json<Vec<ModelPreferenceView>>, StatusCode> {
    let user = db::upsert_user(&state.db, &claims)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let (org, _role) = get_org_with_role(&state.db, &slug, user.id).await?;

    let rows = sqlx::query_as::<_, (String, Value, DateTime<Utc>)>(
        "SELECT preference_key, preference_value, updated_at
         FROM org_model_preferences
         WHERE org_id = $1
         ORDER BY preference_key",
    )
    .bind(org.id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to list org model preferences: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(
        rows.into_iter()
            .map(|(key, value, updated_at)| ModelPreferenceView {
                key,
                value,
                updated_at,
            })
            .collect(),
    ))
}

/// PUT /api/orgs/{slug}/model-preferences
pub async fn upsert_org_model_preferences(
    State(state): State<Arc<AppState>>,
    Path(slug): Path<String>,
    AuthUser(claims): AuthUser,
    Json(req): Json<UpsertModelPreferencesRequest>,
) -> Result<Json<Vec<ModelPreferenceView>>, (StatusCode, Json<serde_json::Value>)> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": "internal error"})),
        )
    })?;

    let (org, role) = get_org_with_role(&state.db, &slug, user.id)
        .await
        .map_err(|status| {
            (
                status,
                Json(serde_json::json!({"error": "not found or forbidden"})),
            )
        })?;

    if role == OrgRole::Member {
        return Err((
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({"error": "owner or admin required"})),
        ));
    }

    validate_keys(&req.preferences)
        .map_err(|(status, msg)| (status, Json(serde_json::json!({"error": msg}))))?;

    for entry in &req.preferences {
        sqlx::query(
            "INSERT INTO org_model_preferences (org_id, preference_key, preference_value, updated_at)
             VALUES ($1, $2, $3, now())
             ON CONFLICT (org_id, preference_key)
             DO UPDATE SET preference_value = EXCLUDED.preference_value, updated_at = now()",
        )
        .bind(org.id)
        .bind(&entry.key)
        .bind(&entry.value)
        .execute(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to upsert org model preference: {e}");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": "internal error"})))
        })?;
    }

    let rows = sqlx::query_as::<_, (String, Value, DateTime<Utc>)>(
        "SELECT preference_key, preference_value, updated_at
         FROM org_model_preferences
         WHERE org_id = $1
         ORDER BY preference_key",
    )
    .bind(org.id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to fetch org model preferences after upsert: {e}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": "internal error"})),
        )
    })?;

    Ok(Json(
        rows.into_iter()
            .map(|(key, value, updated_at)| ModelPreferenceView {
                key,
                value,
                updated_at,
            })
            .collect(),
    ))
}

// --- Helpers ---

async fn get_org_with_role(
    db: &sqlx::PgPool,
    slug: &str,
    user_id: Uuid,
) -> Result<(Organization, OrgRole), StatusCode> {
    let row = sqlx::query_as::<_, (Uuid, String, String, bool, DateTime<Utc>, OrgRole)>(
        "SELECT o.id, o.name, o.slug, o.personal, o.created_at, om.role
         FROM organizations o
         JOIN org_members om ON om.org_id = o.id
         WHERE o.slug = $1 AND om.user_id = $2",
    )
    .bind(slug)
    .bind(user_id)
    .fetch_optional(db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to get org: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    let (id, name, slug, personal, created_at, role) = row;
    Ok((
        Organization {
            id,
            name,
            slug,
            personal,
            created_at,
        },
        role,
    ))
}
