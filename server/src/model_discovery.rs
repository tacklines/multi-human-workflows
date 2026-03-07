use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

/// A discovered model from a provider.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredModel {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub context_length: i64,
    pub pricing_prompt: Option<String>,
    pub pricing_completion: Option<String>,
    pub modality: Option<String>,
}

/// Cached model list with TTL.
#[derive(Debug)]
struct CachedModels {
    models: Vec<DiscoveredModel>,
    fetched_at: DateTime<Utc>,
}

/// In-memory model cache with 1-hour TTL.
#[derive(Debug, Clone)]
pub struct ModelCache {
    inner: Arc<RwLock<Option<CachedModels>>>,
}

const CACHE_TTL_SECS: i64 = 3600;

impl Default for ModelCache {
    fn default() -> Self {
        Self::new()
    }
}

impl ModelCache {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(RwLock::new(None)),
        }
    }

    /// Get cached models if still valid, otherwise return None.
    pub async fn get(&self) -> Option<Vec<DiscoveredModel>> {
        let guard = self.inner.read().await;
        if let Some(ref cached) = *guard {
            let age = Utc::now() - cached.fetched_at;
            if age.num_seconds() < CACHE_TTL_SECS {
                return Some(cached.models.clone());
            }
        }
        None
    }

    /// Store models in cache.
    pub async fn set(&self, models: Vec<DiscoveredModel>) {
        let mut guard = self.inner.write().await;
        *guard = Some(CachedModels {
            models,
            fetched_at: Utc::now(),
        });
    }
}

/// Fetch models from OpenRouter API.
/// GET https://openrouter.ai/api/v1/models (no auth required for listing)
pub async fn fetch_openrouter_models() -> Result<Vec<DiscoveredModel>, String> {
    #[derive(Deserialize)]
    struct OpenRouterResponse {
        data: Vec<OpenRouterModel>,
    }

    #[derive(Deserialize)]
    struct OpenRouterModel {
        id: String,
        name: String,
        context_length: Option<i64>,
        pricing: Option<OpenRouterPricing>,
        architecture: Option<OpenRouterArchitecture>,
    }

    #[derive(Deserialize)]
    struct OpenRouterPricing {
        prompt: Option<String>,
        completion: Option<String>,
    }

    #[derive(Deserialize)]
    struct OpenRouterArchitecture {
        modality: Option<String>,
    }

    let client = reqwest::Client::new();
    let resp = client
        .get("https://openrouter.ai/api/v1/models")
        .header("User-Agent", "seam-server/1.0")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch OpenRouter models: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("OpenRouter API returned {}", resp.status()));
    }

    let body: OpenRouterResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse OpenRouter response: {e}"))?;

    let models = body
        .data
        .into_iter()
        .filter(|m| {
            m.architecture
                .as_ref()
                .and_then(|a| a.modality.as_ref())
                .map(|modality| modality.contains("text"))
                .unwrap_or(true)
        })
        .map(|m| DiscoveredModel {
            id: m.id.clone(),
            name: m.name,
            provider: "openrouter".to_string(),
            context_length: m.context_length.unwrap_or(0),
            pricing_prompt: m.pricing.as_ref().and_then(|p| p.prompt.clone()),
            pricing_completion: m.pricing.as_ref().and_then(|p| p.completion.clone()),
            modality: m.architecture.and_then(|a| a.modality),
        })
        .collect();

    Ok(models)
}

/// Built-in Anthropic models (no API call needed).
pub fn anthropic_models() -> Vec<DiscoveredModel> {
    vec![
        DiscoveredModel {
            id: "claude-opus-4-6".to_string(),
            name: "Claude Opus 4.6".to_string(),
            provider: "anthropic".to_string(),
            context_length: 200000,
            pricing_prompt: Some("0.000015".to_string()),
            pricing_completion: Some("0.000075".to_string()),
            modality: Some("text+image->text".to_string()),
        },
        DiscoveredModel {
            id: "claude-sonnet-4-6".to_string(),
            name: "Claude Sonnet 4.6".to_string(),
            provider: "anthropic".to_string(),
            context_length: 200000,
            pricing_prompt: Some("0.000003".to_string()),
            pricing_completion: Some("0.000015".to_string()),
            modality: Some("text+image->text".to_string()),
        },
        DiscoveredModel {
            id: "claude-haiku-4-5".to_string(),
            name: "Claude Haiku 4.5".to_string(),
            provider: "anthropic".to_string(),
            context_length: 200000,
            pricing_prompt: Some("0.0000008".to_string()),
            pricing_completion: Some("0.000004".to_string()),
            modality: Some("text+image->text".to_string()),
        },
    ]
}
