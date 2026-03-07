use axum::{
    Json,
    extract::FromRequestParts,
    http::{request::Parts, StatusCode},
    response::{IntoResponse, Response},
};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::collections::HashMap;
use tokio::sync::RwLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub preferred_username: Option<String>,
    pub email: Option<String>,
    pub name: Option<String>,
    pub exp: u64,
    pub iat: u64,
    pub iss: String,
}

/// Response from the OIDC userinfo endpoint
#[derive(Debug, Deserialize)]
struct UserInfoResponse {
    preferred_username: Option<String>,
    email: Option<String>,
    name: Option<String>,
}

#[derive(Clone)]
pub struct JwksCache {
    certs_url: String,
    keys: Arc<RwLock<Vec<JwkKey>>>,
    /// Cached userinfo keyed by subject ID
    userinfo_cache: Arc<RwLock<HashMap<String, CachedUserInfo>>>,
    userinfo_url: String,
}

#[derive(Clone)]
struct CachedUserInfo {
    preferred_username: Option<String>,
    email: Option<String>,
    name: Option<String>,
    fetched_at: std::time::Instant,
}

#[derive(Debug, Clone, Deserialize)]
struct JwkKey {
    kid: String,
    n: String,
    e: String,
}

#[derive(Debug, Deserialize)]
struct JwksResponse {
    keys: Vec<JwkKey>,
}

impl JwksCache {
    pub fn new(jwks_url: &str, issuer_url: &str) -> Self {
        Self {
            certs_url: jwks_url.to_string(),
            keys: Arc::new(RwLock::new(Vec::new())),
            userinfo_cache: Arc::new(RwLock::new(HashMap::new())),
            userinfo_url: format!("{}/oidc/v1/userinfo", issuer_url),
        }
    }

    pub async fn validate_token(&self, token: &str) -> Result<Claims, AuthError> {
        let header = jsonwebtoken::decode_header(token)
            .map_err(|e| {
                tracing::warn!("Failed to decode JWT header (token may be opaque): {e}");
                AuthError::InvalidToken
            })?;
        let kid = header.kid.ok_or_else(|| {
            tracing::warn!("JWT has no 'kid' in header");
            AuthError::InvalidToken
        })?;

        // Try cached keys first
        if let Some(claims) = self.try_validate_with_cached(&kid, token).await {
            return Ok(claims);
        }

        // Refresh keys and try again
        self.refresh_keys().await?;
        self.try_validate_with_cached(&kid, token)
            .await
            .ok_or(AuthError::InvalidToken)
    }

    /// Enrich claims with userinfo (cached for 5 minutes per subject)
    pub async fn enrich_claims(&self, claims: &mut Claims, token: &str) {
        // Check cache first
        {
            let cache = self.userinfo_cache.read().await;
            if let Some(cached) = cache.get(&claims.sub) {
                if cached.fetched_at.elapsed() < std::time::Duration::from_secs(300) {
                    if claims.preferred_username.is_none() {
                        claims.preferred_username = cached.preferred_username.clone();
                    }
                    if claims.email.is_none() {
                        claims.email = cached.email.clone();
                    }
                    if claims.name.is_none() {
                        claims.name = cached.name.clone();
                    }
                    return;
                }
            }
        }

        // Fetch from userinfo endpoint
        let client = reqwest::Client::new();
        match client
            .get(&self.userinfo_url)
            .bearer_auth(token)
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(info) = resp.json::<UserInfoResponse>().await {
                    let cached = CachedUserInfo {
                        preferred_username: info.preferred_username.clone(),
                        email: info.email.clone(),
                        name: info.name.clone(),
                        fetched_at: std::time::Instant::now(),
                    };

                    if claims.preferred_username.is_none() {
                        claims.preferred_username = info.preferred_username;
                    }
                    if claims.email.is_none() {
                        claims.email = info.email;
                    }
                    if claims.name.is_none() {
                        claims.name = info.name;
                    }

                    let mut cache = self.userinfo_cache.write().await;
                    cache.insert(claims.sub.clone(), cached);
                }
            }
            Ok(resp) => {
                tracing::warn!("Userinfo endpoint returned {}", resp.status());
            }
            Err(e) => {
                tracing::warn!("Failed to fetch userinfo: {e}");
            }
        }
    }

    async fn try_validate_with_cached(&self, kid: &str, token: &str) -> Option<Claims> {
        let keys = self.keys.read().await;
        let key = keys.iter().find(|k| k.kid == kid)?;

        let decoding_key = DecodingKey::from_rsa_components(&key.n, &key.e).ok()?;
        let mut validation = Validation::new(Algorithm::RS256);
        validation.validate_aud = false;

        match decode::<Claims>(token, &decoding_key, &validation) {
            Ok(data) => Some(data.claims),
            Err(e) => {
                tracing::warn!("JWT decode failed for kid={kid}: {e}");
                None
            }
        }
    }

    async fn refresh_keys(&self) -> Result<(), AuthError> {
        let resp = reqwest::get(&self.certs_url)
            .await
            .map_err(|_| AuthError::OidcProviderUnavailable)?;

        let jwks: JwksResponse = resp.json()
            .await
            .map_err(|_| AuthError::OidcProviderUnavailable)?;

        let mut keys = self.keys.write().await;
        *keys = jwks.keys;
        Ok(())
    }
}

#[derive(Debug, thiserror::Error)]
pub enum AuthError {
    #[error("Invalid or expired token")]
    InvalidToken,
    #[error("Missing authorization header")]
    MissingToken,
    #[error("OIDC provider unavailable")]
    OidcProviderUnavailable,
}

impl From<AuthError> for StatusCode {
    fn from(err: AuthError) -> Self {
        match err {
            AuthError::InvalidToken => StatusCode::UNAUTHORIZED,
            AuthError::MissingToken => StatusCode::UNAUTHORIZED,
            AuthError::OidcProviderUnavailable => StatusCode::SERVICE_UNAVAILABLE,
        }
    }
}

/// JSON error response for auth failures
fn auth_error_response(status: StatusCode, error: &str, message: &str) -> Response {
    (status, Json(serde_json::json!({ "error": error, "message": message }))).into_response()
}

/// Extractor that validates the Bearer token and provides Claims
pub struct AuthUser(pub Claims);

impl FromRequestParts<Arc<crate::AppState>> for AuthUser {
    type Rejection = Response;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &Arc<crate::AppState>,
    ) -> Result<Self, Self::Rejection> {
        let auth_header = parts.headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| auth_error_response(
                StatusCode::UNAUTHORIZED, "missing_token", "Authorization header required"
            ))?;

        let token = auth_header
            .strip_prefix("Bearer ")
            .ok_or_else(|| auth_error_response(
                StatusCode::UNAUTHORIZED, "invalid_header", "Expected Bearer token"
            ))?;

        let mut claims = state.jwks.validate_token(token)
            .await
            .map_err(|e| match e {
                AuthError::InvalidToken => auth_error_response(
                    StatusCode::UNAUTHORIZED, "invalid_token", "Token is invalid or expired"
                ),
                AuthError::MissingToken => auth_error_response(
                    StatusCode::UNAUTHORIZED, "missing_token", "Authorization header required"
                ),
                AuthError::OidcProviderUnavailable => auth_error_response(
                    StatusCode::SERVICE_UNAVAILABLE, "auth_unavailable", "Authentication service unavailable"
                ),
            })?;

        // Enrich claims with userinfo if access token lacks profile claims
        if claims.preferred_username.is_none() || claims.name.is_none() || claims.email.is_none() {
            state.jwks.enrich_claims(&mut claims, token).await;
        }

        Ok(AuthUser(claims))
    }
}
