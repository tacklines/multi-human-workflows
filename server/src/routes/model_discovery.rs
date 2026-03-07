use axum::{extract::State, http::StatusCode, Json};
use std::sync::Arc;

use crate::auth::AuthUser;
use crate::model_discovery::{self, DiscoveredModel};
use crate::AppState;

/// GET /api/models — list available models from all configured providers.
/// Combines cached OpenRouter models with built-in Anthropic models.
pub async fn list_models(
    State(state): State<Arc<AppState>>,
    AuthUser(_claims): AuthUser,
) -> Result<Json<Vec<DiscoveredModel>>, StatusCode> {
    let mut all_models: Vec<DiscoveredModel> = Vec::new();

    // Always include Anthropic models
    all_models.extend(model_discovery::anthropic_models());

    // Try to get cached OpenRouter models, fetch if expired
    if let Some(cached) = state.model_cache.get().await {
        all_models.extend(cached);
    } else {
        match model_discovery::fetch_openrouter_models().await {
            Ok(models) => {
                state.model_cache.set(models.clone()).await;
                all_models.extend(models);
            }
            Err(e) => {
                tracing::warn!("Failed to fetch OpenRouter models: {e}");
                // Return Anthropic-only; don't fail the request
            }
        }
    }

    Ok(Json(all_models))
}
