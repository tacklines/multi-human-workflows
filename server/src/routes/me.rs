use axum::{extract::State, http::StatusCode, Json};
use std::sync::Arc;

use crate::auth::AuthUser;
use crate::db;
use crate::AppState;

#[derive(serde::Serialize)]
pub struct MeResponse {
    pub id: uuid::Uuid,
    pub username: String,
    pub display_name: String,
    pub email: Option<String>,
}

pub async fn get_me(
    State(state): State<Arc<AppState>>,
    AuthUser(claims): AuthUser,
) -> Result<Json<MeResponse>, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await
        .map_err(|e| {
            tracing::error!("Failed to upsert user: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(MeResponse {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        email: user.email,
    }))
}
