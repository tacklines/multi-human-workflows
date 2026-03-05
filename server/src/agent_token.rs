use rand::Rng;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

/// Raw token prefix for identification: "sat_" (seam agent token)
const TOKEN_PREFIX: &str = "sat_";

/// Generate a crypto-random agent token and store its hash.
/// Returns the raw token (only returned once — not stored).
pub async fn create_token(
    db: &PgPool,
    user_id: Uuid,
    session_id: Option<Uuid>,
    display_name: &str,
    ttl: chrono::Duration,
) -> Result<String, sqlx::Error> {
    let raw_bytes: [u8; 32] = rand::rng().random();
    let raw_token = format!("{}{}", TOKEN_PREFIX, hex::encode(raw_bytes));
    let token_hash = hash_token(&raw_token);
    let expires_at = chrono::Utc::now() + ttl;

    sqlx::query(
        r#"INSERT INTO agent_tokens (token_hash, user_id, session_id, display_name, expires_at)
           VALUES ($1, $2, $3, $4, $5)"#,
    )
    .bind(&token_hash)
    .bind(user_id)
    .bind(session_id)
    .bind(display_name)
    .bind(expires_at)
    .execute(db)
    .await?;

    Ok(raw_token)
}

/// Validate a raw token against stored hashes.
/// Returns token metadata if valid, None if not found/expired/revoked.
pub async fn validate_token(db: &PgPool, raw_token: &str) -> Result<Option<AgentTokenInfo>, sqlx::Error> {
    let token_hash = hash_token(raw_token);

    let row = sqlx::query_as::<_, AgentTokenInfo>(
        r#"SELECT t.id, t.user_id, t.session_id, t.display_name,
                  u.external_id as user_external_id, u.username
           FROM agent_tokens t
           JOIN users u ON u.id = t.user_id
           WHERE t.token_hash = $1
             AND t.expires_at > now()
             AND t.revoked_at IS NULL"#,
    )
    .bind(&token_hash)
    .fetch_optional(db)
    .await?;

    Ok(row)
}

/// Revoke a token by ID.
pub async fn revoke_token(db: &PgPool, token_id: Uuid) -> Result<bool, sqlx::Error> {
    let result = sqlx::query(
        "UPDATE agent_tokens SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL",
    )
    .bind(token_id)
    .execute(db)
    .await?;

    Ok(result.rows_affected() > 0)
}

/// Revoke all tokens for a session (e.g., when session closes).
pub async fn revoke_session_tokens(db: &PgPool, session_id: Uuid) -> Result<u64, sqlx::Error> {
    let result = sqlx::query(
        "UPDATE agent_tokens SET revoked_at = now() WHERE session_id = $1 AND revoked_at IS NULL",
    )
    .bind(session_id)
    .execute(db)
    .await?;

    Ok(result.rows_affected())
}

fn hash_token(raw_token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(raw_token.as_bytes());
    hex::encode(hasher.finalize())
}

/// Returns true if the token looks like an opaque agent token (not a JWT).
pub fn is_agent_token(token: &str) -> bool {
    token.starts_with(TOKEN_PREFIX)
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct AgentTokenInfo {
    pub id: Uuid,
    pub user_id: Uuid,
    pub session_id: Option<Uuid>,
    pub display_name: String,
    pub user_external_id: String,
    pub username: String,
}
