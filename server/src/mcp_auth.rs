use std::{convert::Infallible, fmt::Display, sync::Arc, task::Poll};

use bytes::Bytes;
use futures::future::BoxFuture;
use http::{Request, Response, StatusCode};
use http_body::Body;
use http_body_util::{Full, combinators::BoxBody, BodyExt};

use crate::auth::JwksCache;

/// Tower layer that validates Bearer JWTs on incoming requests.
///
/// Injects validated `Claims` into request extensions so MCP tool handlers
/// can access them via `Extension(parts): Extension<http::request::Parts>`.
#[derive(Clone)]
pub struct McpAuthLayer {
    jwks: JwksCache,
    enabled: bool,
}

impl McpAuthLayer {
    pub fn new(jwks: JwksCache, enabled: bool) -> Self {
        Self { jwks, enabled }
    }
}

impl<S> tower::Layer<S> for McpAuthLayer {
    type Service = McpAuthService<S>;

    fn layer(&self, inner: S) -> Self::Service {
        McpAuthService {
            inner,
            jwks: self.jwks.clone(),
            enabled: self.enabled,
        }
    }
}

#[derive(Clone)]
pub struct McpAuthService<S> {
    inner: S,
    jwks: JwksCache,
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

            // Validate JWT against Keycloak JWKS
            match jwks.validate_token(token).await {
                Ok(claims) => {
                    // Inject claims into request extensions for tool handlers.
                    // rmcp's StreamableHttpService calls req.into_parts() and injects
                    // the Parts (including extensions) into the MCP context, so tool
                    // handlers can access Arc<Claims> via Extension(parts).
                    req.extensions_mut().insert(Arc::new(claims));
                    inner.call(req).await
                }
                Err(_) => Ok(unauthorized_response("Invalid or expired token")),
            }
        })
    }
}
