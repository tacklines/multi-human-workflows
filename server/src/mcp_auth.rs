use std::{convert::Infallible, fmt::Display, sync::Arc, task::Poll};

use bytes::Bytes;
use futures::future::BoxFuture;
use http::{Request, Response, StatusCode};
use http_body::Body;
use http_body_util::{Full, combinators::BoxBody, BodyExt};
use sqlx::PgPool;
use uuid::Uuid;

use crate::agent_token;
use crate::auth::JwksCache;

/// Authenticated MCP caller identity, injected into request extensions.
/// Tool handlers access this via `Extension(parts)` → `parts.extensions.get::<Arc<McpIdentity>>()`.
#[derive(Debug, Clone)]
pub struct McpIdentity {
    /// Keycloak subject (for JWT) or user's external_id (for agent token)
    pub subject: String,
    /// Human-readable name
    pub display_name: String,
    /// The user ID in our DB
    pub user_id: Option<Uuid>,
    /// If authenticated via agent token, the session it's scoped to
    pub session_id: Option<Uuid>,
    /// Which auth method was used
    pub auth_method: AuthMethod,
}

#[derive(Debug, Clone, PartialEq)]
pub enum AuthMethod {
    Jwt,
    AgentToken,
}

/// Tower layer that validates Bearer tokens (JWT or opaque agent token).
///
/// Injects `Arc<McpIdentity>` into request extensions so MCP tool handlers
/// can access them via `Extension(parts): Extension<http::request::Parts>`.
#[derive(Clone)]
pub struct McpAuthLayer {
    jwks: JwksCache,
    db: PgPool,
    enabled: bool,
}

impl McpAuthLayer {
    pub fn new(jwks: JwksCache, db: PgPool, enabled: bool) -> Self {
        Self { jwks, db, enabled }
    }
}

impl<S> tower::Layer<S> for McpAuthLayer {
    type Service = McpAuthService<S>;

    fn layer(&self, inner: S) -> Self::Service {
        McpAuthService {
            inner,
            jwks: self.jwks.clone(),
            db: self.db.clone(),
            enabled: self.enabled,
        }
    }
}

#[derive(Clone)]
pub struct McpAuthService<S> {
    inner: S,
    jwks: JwksCache,
    db: PgPool,
    enabled: bool,
}

/// rmcp's StreamableHttpService returns Response<BoxBody<Bytes, Infallible>>
type McpResponse = Response<BoxBody<Bytes, Infallible>>;

fn unauthorized_response(message: &str) -> McpResponse {
    let body = serde_json::json!({
        "error": "unauthorized",
        "message": message,
    });
    Response::builder()
        .status(StatusCode::UNAUTHORIZED)
        .header("content-type", "application/json")
        .header("www-authenticate", "Bearer")
        .body(Full::new(Bytes::from(body.to_string())).boxed())
        .expect("valid response")
}

impl<S, ReqBody> tower_service::Service<Request<ReqBody>> for McpAuthService<S>
where
    S: tower_service::Service<Request<ReqBody>, Response = McpResponse, Error = Infallible>
        + Clone
        + Send
        + 'static,
    S::Future: Send,
    ReqBody: Body + Send + 'static,
    ReqBody::Error: Display,
    ReqBody::Data: Send,
{
    type Response = McpResponse;
    type Error = Infallible;
    type Future = BoxFuture<'static, Result<Self::Response, Self::Error>>;

    fn poll_ready(&mut self, cx: &mut std::task::Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, mut req: Request<ReqBody>) -> Self::Future {
        // Auth disabled — pass through
        if !self.enabled {
            let mut inner = self.inner.clone();
            return Box::pin(async move { inner.call(req).await });
        }

        let jwks = self.jwks.clone();
        let db = self.db.clone();
        let mut inner = self.inner.clone();

        Box::pin(async move {
            // Extract Bearer token
            let token = req
                .headers()
                .get("authorization")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.strip_prefix("Bearer "));

            let Some(token) = token else {
                return Ok(unauthorized_response(
                    "Authorization header with Bearer token required",
                ));
            };

            // Dual-path auth: agent token (sat_ prefix) or JWT
            let identity = if agent_token::is_agent_token(token) {
                match agent_token::validate_token(&db, token).await {
                    Ok(Some(info)) => McpIdentity {
                        subject: info.user_external_id,
                        display_name: info.display_name,
                        user_id: Some(info.user_id),
                        session_id: info.session_id,
                        auth_method: AuthMethod::AgentToken,
                    },
                    Ok(None) => return Ok(unauthorized_response("Invalid or expired agent token")),
                    Err(e) => {
                        tracing::error!("Agent token validation failed: {e}");
                        return Ok(unauthorized_response("Authentication service error"));
                    }
                }
            } else {
                match jwks.validate_token(token).await {
                    Ok(claims) => McpIdentity {
                        subject: claims.sub.clone(),
                        display_name: claims.preferred_username.clone()
                            .or(claims.name.clone())
                            .unwrap_or_else(|| claims.sub.clone()),
                        user_id: None, // JWT doesn't carry our internal user_id
                        session_id: None,
                        auth_method: AuthMethod::Jwt,
                    },
                    Err(_) => return Ok(unauthorized_response("Invalid or expired token")),
                }
            };

            // Inject identity into request extensions for tool handlers.
            // rmcp's StreamableHttpService calls req.into_parts() and injects
            // the Parts (including extensions) into the MCP context, so tool
            // handlers can access Arc<McpIdentity> via Extension(parts).
            req.extensions_mut().insert(Arc::new(identity));
            inner.call(req).await
        })
    }
}
