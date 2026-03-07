use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use std::sync::Arc;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::db;
use crate::models::*;
use crate::AppState;

/// List orgs the authenticated user belongs to
pub async fn list_orgs(
    State(state): State<Arc<AppState>>,
    AuthUser(claims): AuthUser,
) -> Result<Json<Vec<OrgView>>, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let rows = sqlx::query_as::<
        _,
        (
            Uuid,
            String,
            String,
            bool,
            chrono::DateTime<chrono::Utc>,
            OrgRole,
            i64,
        ),
    >(
        "SELECT o.id, o.name, o.slug, o.personal, o.created_at, om.role,
                (SELECT COUNT(*) FROM org_members om2 WHERE om2.org_id = o.id) as member_count
         FROM organizations o
         JOIN org_members om ON om.org_id = o.id
         WHERE om.user_id = $1
         ORDER BY o.personal DESC, o.name",
    )
    .bind(user.id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to list orgs: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Auto-bootstrap personal org for new users
    if rows.is_empty() {
        let _ = db::ensure_default_project(&state.db, user.id)
            .await
            .map_err(|e| tracing::warn!("Failed to bootstrap personal org: {e}"));

        // Re-fetch after bootstrap
        let rows = sqlx::query_as::<
            _,
            (
                Uuid,
                String,
                String,
                bool,
                chrono::DateTime<chrono::Utc>,
                OrgRole,
                i64,
            ),
        >(
            "SELECT o.id, o.name, o.slug, o.personal, o.created_at, om.role,
                    (SELECT COUNT(*) FROM org_members om2 WHERE om2.org_id = o.id) as member_count
             FROM organizations o
             JOIN org_members om ON om.org_id = o.id
             WHERE om.user_id = $1
             ORDER BY o.personal DESC, o.name",
        )
        .bind(user.id)
        .fetch_all(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to list orgs after bootstrap: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

        return Ok(Json(
            rows.into_iter()
                .map(
                    |(id, name, slug, personal, created_at, role, member_count)| OrgView {
                        id,
                        name,
                        slug,
                        personal,
                        role,
                        created_at,
                        member_count,
                    },
                )
                .collect(),
        ));
    }

    Ok(Json(
        rows.into_iter()
            .map(
                |(id, name, slug, personal, created_at, role, member_count)| OrgView {
                    id,
                    name,
                    slug,
                    personal,
                    role,
                    created_at,
                    member_count,
                },
            )
            .collect(),
    ))
}

/// Get org by slug
pub async fn get_org(
    State(state): State<Arc<AppState>>,
    Path(slug): Path<String>,
    AuthUser(claims): AuthUser,
) -> Result<Json<OrgView>, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let row = sqlx::query_as::<
        _,
        (
            Uuid,
            String,
            String,
            bool,
            chrono::DateTime<chrono::Utc>,
            OrgRole,
            i64,
        ),
    >(
        "SELECT o.id, o.name, o.slug, o.personal, o.created_at, om.role,
                (SELECT COUNT(*) FROM org_members om2 WHERE om2.org_id = o.id) as member_count
         FROM organizations o
         JOIN org_members om ON om.org_id = o.id
         WHERE o.slug = $1 AND om.user_id = $2",
    )
    .bind(&slug)
    .bind(user.id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to get org: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    let (id, name, slug, personal, created_at, role, member_count) = row;
    Ok(Json(OrgView {
        id,
        name,
        slug,
        personal,
        role,
        created_at,
        member_count,
    }))
}

/// Create a new organization
pub async fn create_org(
    State(state): State<Arc<AppState>>,
    AuthUser(claims): AuthUser,
    Json(req): Json<CreateOrgRequest>,
) -> Result<(StatusCode, Json<OrgView>), StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let slug = req.slug.unwrap_or_else(|| slugify(&req.name));
    let org_id = Uuid::new_v4();

    sqlx::query(
        "INSERT INTO organizations (id, name, slug, personal, created_at) VALUES ($1, $2, $3, false, NOW())"
    )
    .bind(org_id)
    .bind(&req.name)
    .bind(&slug)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to create org: {e}");
        if e.to_string().contains("duplicate key") || e.to_string().contains("unique") {
            StatusCode::CONFLICT
        } else {
            StatusCode::INTERNAL_SERVER_ERROR
        }
    })?;

    sqlx::query(
        "INSERT INTO org_members (org_id, user_id, role, joined_at) VALUES ($1, $2, 'owner', NOW())"
    )
    .bind(org_id)
    .bind(user.id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to add org owner: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok((
        StatusCode::CREATED,
        Json(OrgView {
            id: org_id,
            name: req.name,
            slug,
            personal: false,
            role: OrgRole::Owner,
            created_at: chrono::Utc::now(),
            member_count: 1,
        }),
    ))
}

/// Update org (owner/admin only)
pub async fn update_org(
    State(state): State<Arc<AppState>>,
    Path(slug): Path<String>,
    AuthUser(claims): AuthUser,
    Json(req): Json<UpdateOrgRequest>,
) -> Result<Json<OrgView>, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let (org, role) = get_org_with_role(&state.db, &slug, user.id).await?;
    if role == OrgRole::Member {
        return Err(StatusCode::FORBIDDEN);
    }

    if let Some(ref name) = req.name {
        sqlx::query("UPDATE organizations SET name = $1 WHERE id = $2")
            .bind(name)
            .bind(org.id)
            .execute(&state.db)
            .await
            .map_err(|e| {
                tracing::error!("Failed to update org: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
    }

    let member_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM org_members WHERE org_id = $1")
            .bind(org.id)
            .fetch_one(&state.db)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(OrgView {
        id: org.id,
        name: req.name.unwrap_or(org.name),
        slug: org.slug,
        personal: org.personal,
        role,
        created_at: org.created_at,
        member_count,
    }))
}

/// List org members
pub async fn list_members(
    State(state): State<Arc<AppState>>,
    Path(slug): Path<String>,
    AuthUser(claims): AuthUser,
) -> Result<Json<Vec<OrgMemberView>>, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let (org, _role) = get_org_with_role(&state.db, &slug, user.id).await?;

    let members =
        sqlx::query_as::<_, (Uuid, String, String, OrgRole, chrono::DateTime<chrono::Utc>)>(
            "SELECT u.id, u.username, u.display_name, om.role, om.joined_at
         FROM org_members om
         JOIN users u ON u.id = om.user_id
         WHERE om.org_id = $1
         ORDER BY om.joined_at",
        )
        .bind(org.id)
        .fetch_all(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to list org members: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(
        members
            .into_iter()
            .map(
                |(user_id, username, display_name, role, joined_at)| OrgMemberView {
                    user_id,
                    username,
                    display_name,
                    role,
                    joined_at,
                },
            )
            .collect(),
    ))
}

/// Invite member to org (owner/admin only)
pub async fn invite_member(
    State(state): State<Arc<AppState>>,
    Path(slug): Path<String>,
    AuthUser(claims): AuthUser,
    Json(req): Json<InviteOrgMemberRequest>,
) -> Result<(StatusCode, Json<OrgMemberView>), StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let (org, role) = get_org_with_role(&state.db, &slug, user.id).await?;
    if role == OrgRole::Member {
        return Err(StatusCode::FORBIDDEN);
    }

    // Find the user to invite by username
    let invite_user: User = sqlx::query_as("SELECT * FROM users WHERE username = $1")
        .bind(&req.username)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to find user: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or(StatusCode::NOT_FOUND)?;

    let member_role = req.role.unwrap_or(OrgRole::Member);

    // Only owners can add admins/owners
    if member_role != OrgRole::Member && role != OrgRole::Owner {
        return Err(StatusCode::FORBIDDEN);
    }

    sqlx::query(
        "INSERT INTO org_members (org_id, user_id, role, joined_at) VALUES ($1, $2, $3, NOW())
         ON CONFLICT (org_id, user_id) DO NOTHING",
    )
    .bind(org.id)
    .bind(invite_user.id)
    .bind(member_role)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to invite member: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok((
        StatusCode::CREATED,
        Json(OrgMemberView {
            user_id: invite_user.id,
            username: invite_user.username,
            display_name: invite_user.display_name,
            role: member_role,
            joined_at: chrono::Utc::now(),
        }),
    ))
}

/// Update member role (owner only for admin promotion)
pub async fn update_member(
    State(state): State<Arc<AppState>>,
    Path((slug, member_user_id)): Path<(String, Uuid)>,
    AuthUser(claims): AuthUser,
    Json(req): Json<UpdateOrgMemberRequest>,
) -> Result<Json<OrgMemberView>, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let (org, caller_role) = get_org_with_role(&state.db, &slug, user.id).await?;

    // Only owner can change roles
    if caller_role != OrgRole::Owner {
        return Err(StatusCode::FORBIDDEN);
    }

    // Can't change your own role
    if member_user_id == user.id {
        return Err(StatusCode::FORBIDDEN);
    }

    sqlx::query("UPDATE org_members SET role = $1 WHERE org_id = $2 AND user_id = $3")
        .bind(req.role)
        .bind(org.id)
        .bind(member_user_id)
        .execute(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to update member role: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let member_user: User = sqlx::query_as("SELECT * FROM users WHERE id = $1")
        .bind(member_user_id)
        .fetch_one(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(OrgMemberView {
        user_id: member_user.id,
        username: member_user.username,
        display_name: member_user.display_name,
        role: req.role,
        joined_at: chrono::Utc::now(), // approximate
    }))
}

/// Remove member from org (owner/admin only; owner can't remove self)
pub async fn remove_member(
    State(state): State<Arc<AppState>>,
    Path((slug, member_user_id)): Path<(String, Uuid)>,
    AuthUser(claims): AuthUser,
) -> Result<StatusCode, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let (org, caller_role) = get_org_with_role(&state.db, &slug, user.id).await?;

    if caller_role == OrgRole::Member {
        return Err(StatusCode::FORBIDDEN);
    }

    // Check target's role — admins can't remove other admins/owners
    if caller_role == OrgRole::Admin {
        let target_role: OrgRole =
            sqlx::query_scalar("SELECT role FROM org_members WHERE org_id = $1 AND user_id = $2")
                .bind(org.id)
                .bind(member_user_id)
                .fetch_optional(&state.db)
                .await
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
                .ok_or(StatusCode::NOT_FOUND)?;

        if target_role != OrgRole::Member {
            return Err(StatusCode::FORBIDDEN);
        }
    }

    // Owner can't remove self (would orphan the org)
    if member_user_id == user.id && caller_role == OrgRole::Owner {
        return Err(StatusCode::FORBIDDEN);
    }

    let result = sqlx::query("DELETE FROM org_members WHERE org_id = $1 AND user_id = $2")
        .bind(org.id)
        .bind(member_user_id)
        .execute(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to remove member: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    Ok(StatusCode::NO_CONTENT)
}

/// List projects within an org
pub async fn list_org_projects(
    State(state): State<Arc<AppState>>,
    Path(slug): Path<String>,
    AuthUser(claims): AuthUser,
) -> Result<Json<Vec<ProjectView>>, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let (org, _role) = get_org_with_role(&state.db, &slug, user.id).await?;

    let projects = sqlx::query_as::<_, Project>(
        "SELECT p.* FROM projects p WHERE p.org_id = $1 ORDER BY p.created_at",
    )
    .bind(org.id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to list org projects: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(
        projects
            .into_iter()
            .map(|p| ProjectView {
                id: p.id,
                name: p.name,
                slug: p.slug,
                ticket_prefix: p.ticket_prefix,
                created_at: p.created_at,
                repo_url: p.repo_url,
                default_branch: Some(p.default_branch),
            })
            .collect(),
    ))
}

/// Create project in a specific org
pub async fn create_org_project(
    State(state): State<Arc<AppState>>,
    Path(slug): Path<String>,
    AuthUser(claims): AuthUser,
    Json(req): Json<CreateProjectRequest>,
) -> Result<(StatusCode, Json<ProjectView>), StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let (org, role) = get_org_with_role(&state.db, &slug, user.id).await?;

    // Only owner/admin can create projects
    if role == OrgRole::Member {
        return Err(StatusCode::FORBIDDEN);
    }

    let project_slug = req.slug.unwrap_or_else(|| slugify(&req.name));
    let ticket_prefix = req.ticket_prefix.unwrap_or_else(|| "TASK".to_string());
    let default_branch = req.default_branch.unwrap_or_else(|| "main".to_string());
    let project_id = Uuid::new_v4();

    sqlx::query(
        "INSERT INTO projects (id, org_id, name, slug, ticket_prefix, repo_url, default_branch, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())"
    )
    .bind(project_id)
    .bind(org.id)
    .bind(&req.name)
    .bind(&project_slug)
    .bind(&ticket_prefix)
    .bind(&req.repo_url)
    .bind(&default_branch)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to create project: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Add creator as project admin
    sqlx::query(
        "INSERT INTO project_members (project_id, user_id, role, joined_at) VALUES ($1, $2, 'admin', NOW())"
    )
    .bind(project_id)
    .bind(user.id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to add project member: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok((
        StatusCode::CREATED,
        Json(ProjectView {
            id: project_id,
            name: req.name,
            slug: project_slug,
            ticket_prefix,
            created_at: chrono::Utc::now(),
            repo_url: req.repo_url,
            default_branch: Some(default_branch),
        }),
    ))
}

// --- Helpers ---

async fn get_org_with_role(
    db: &sqlx::PgPool,
    slug: &str,
    user_id: Uuid,
) -> Result<(Organization, OrgRole), StatusCode> {
    let row = sqlx::query_as::<
        _,
        (
            Uuid,
            String,
            String,
            bool,
            chrono::DateTime<chrono::Utc>,
            OrgRole,
        ),
    >(
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
