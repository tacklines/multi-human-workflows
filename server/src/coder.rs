use reqwest::Client;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Trait abstracting the Coder API calls used by the dispatch layer.
///
/// Implementing this trait on a mock allows dispatch functions to be tested
/// without a real Coder instance.
pub trait CoderApi {
    fn start_workspace(
        &self,
        id: Uuid,
    ) -> impl std::future::Future<Output = Result<CoderWorkspaceBuild, CoderError>> + Send;

    fn get_template_by_name(
        &self,
        name: &str,
    ) -> impl std::future::Future<Output = Result<Option<CoderTemplate>, CoderError>> + Send;

    fn create_workspace(
        &self,
        owner: &str,
        req: CreateWorkspaceRequest,
    ) -> impl std::future::Future<Output = Result<CoderWorkspace, CoderError>> + Send;
}

/// Thin HTTP client for Coder's REST API.
///
/// Coder API docs: https://coder.com/docs/api
pub struct CoderClient {
    client: Client,
    base_url: String,
    token: String,
}

#[derive(Debug, thiserror::Error)]
pub enum CoderError {
    #[error("HTTP request failed: {0}")]
    Request(#[from] reqwest::Error),
    #[error("Coder API error {status}: {message}")]
    Api { status: u16, message: String },
    #[error("Coder not configured")]
    NotConfigured,
}

// --- Coder API response types ---

#[derive(Debug, Deserialize)]
pub struct CoderWorkspace {
    pub id: Uuid,
    pub name: String,
    pub owner_id: Uuid,
    pub owner_name: String,
    pub template_id: Uuid,
    pub template_name: String,
    pub latest_build: CoderWorkspaceBuild,
}

#[derive(Debug, Deserialize)]
pub struct CoderWorkspaceBuild {
    pub id: Uuid,
    pub status: String,
    pub job: CoderProvisionerJob,
}

#[derive(Debug, Deserialize)]
pub struct CoderProvisionerJob {
    pub id: Uuid,
    pub status: String,
    pub error: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CoderTemplate {
    pub id: Uuid,
    pub name: String,
    pub organization_id: Uuid,
}

#[derive(Debug, Deserialize)]
pub struct CoderUser {
    pub id: Uuid,
    pub username: String,
    pub email: String,
}

// --- Request types ---

#[derive(Debug, Serialize)]
pub struct CreateWorkspaceRequest {
    pub name: String,
    pub template_id: Uuid,
    pub rich_parameter_values: Vec<RichParameterValue>,
}

#[derive(Debug, Serialize)]
pub struct RichParameterValue {
    pub name: String,
    pub value: String,
}

impl CoderClient {
    /// Create a new Coder client. Returns None if CODER_URL is not set.
    pub fn from_env() -> Option<Self> {
        let base_url = std::env::var("CODER_URL").ok()?;
        let token = std::env::var("CODER_TOKEN").unwrap_or_default();
        Some(Self::new(base_url, token))
    }

    pub fn new(base_url: String, token: String) -> Self {
        Self {
            client: Client::new(),
            base_url: base_url.trim_end_matches('/').to_string(),
            token,
        }
    }

    fn url(&self, path: &str) -> String {
        format!("{}/api/v2{}", self.base_url, path)
    }

    async fn check_response(
        &self,
        resp: reqwest::Response,
    ) -> Result<reqwest::Response, CoderError> {
        if resp.status().is_success() {
            Ok(resp)
        } else {
            let status = resp.status().as_u16();
            let message = resp.text().await.unwrap_or_else(|_| "unknown error".into());
            Err(CoderError::Api { status, message })
        }
    }

    // --- User ---

    /// Get the authenticated user's info
    pub async fn me(&self) -> Result<CoderUser, CoderError> {
        let resp = self
            .client
            .get(self.url("/users/me"))
            .header("Coder-Session-Token", &self.token)
            .send()
            .await?;
        let resp = self.check_response(resp).await?;
        Ok(resp.json().await?)
    }

    // --- Templates ---

    /// List templates in the default organization
    pub async fn list_templates(&self) -> Result<Vec<CoderTemplate>, CoderError> {
        let resp = self
            .client
            .get(self.url("/templates"))
            .header("Coder-Session-Token", &self.token)
            .send()
            .await?;
        let resp = self.check_response(resp).await?;
        Ok(resp.json().await?)
    }

    /// Get a template by name (searches default org)
    pub async fn get_template_by_name(
        &self,
        name: &str,
    ) -> Result<Option<CoderTemplate>, CoderError> {
        let templates = self.list_templates().await?;
        Ok(templates.into_iter().find(|t| t.name == name))
    }

    // --- Workspaces ---

    /// Create a workspace
    pub async fn create_workspace(
        &self,
        owner: &str,
        req: CreateWorkspaceRequest,
    ) -> Result<CoderWorkspace, CoderError> {
        let resp = self
            .client
            .post(self.url(&format!("/users/{}/workspaces", owner)))
            .header("Coder-Session-Token", &self.token)
            .json(&req)
            .send()
            .await?;
        let resp = self.check_response(resp).await?;
        Ok(resp.json().await?)
    }

    /// Get workspace by ID
    pub async fn get_workspace(&self, id: Uuid) -> Result<CoderWorkspace, CoderError> {
        let resp = self
            .client
            .get(self.url(&format!("/workspaces/{}", id)))
            .header("Coder-Session-Token", &self.token)
            .send()
            .await?;
        let resp = self.check_response(resp).await?;
        Ok(resp.json().await?)
    }

    /// Start a workspace (create a new build with "start" transition)
    pub async fn start_workspace(&self, id: Uuid) -> Result<CoderWorkspaceBuild, CoderError> {
        let resp = self
            .client
            .put(self.url(&format!("/workspaces/{}/builds", id)))
            .header("Coder-Session-Token", &self.token)
            .json(&serde_json::json!({ "transition": "start" }))
            .send()
            .await?;
        let resp = self.check_response(resp).await?;
        Ok(resp.json().await?)
    }

    /// Stop a workspace
    pub async fn stop_workspace(&self, id: Uuid) -> Result<CoderWorkspaceBuild, CoderError> {
        let resp = self
            .client
            .put(self.url(&format!("/workspaces/{}/builds", id)))
            .header("Coder-Session-Token", &self.token)
            .json(&serde_json::json!({ "transition": "stop" }))
            .send()
            .await?;
        let resp = self.check_response(resp).await?;
        Ok(resp.json().await?)
    }

    /// Delete a workspace
    pub async fn delete_workspace(&self, id: Uuid) -> Result<(), CoderError> {
        let resp = self
            .client
            .delete(self.url(&format!("/workspaces/{}", id)))
            .header("Coder-Session-Token", &self.token)
            .send()
            .await?;
        self.check_response(resp).await?;
        Ok(())
    }
}

impl CoderApi for CoderClient {
    async fn start_workspace(&self, id: Uuid) -> Result<CoderWorkspaceBuild, CoderError> {
        self.start_workspace(id).await
    }

    async fn get_template_by_name(&self, name: &str) -> Result<Option<CoderTemplate>, CoderError> {
        self.get_template_by_name(name).await
    }

    async fn create_workspace(
        &self,
        owner: &str,
        req: CreateWorkspaceRequest,
    ) -> Result<CoderWorkspace, CoderError> {
        self.create_workspace(owner, req).await
    }
}

/// Test double for the Coder API. Configure each field with the desired
/// return value before passing to dispatch helpers under test.
#[cfg(test)]
pub mod testing {
    use super::*;
    use std::sync::Mutex;

    /// A configurable mock of the Coder API.
    ///
    /// Each method records calls and returns a pre-configured result.
    pub struct MockCoderClient {
        /// Result returned by `start_workspace`.
        pub start_workspace_result: Mutex<Result<CoderWorkspaceBuild, String>>,
        /// Result returned by `get_template_by_name`.
        pub get_template_result: Mutex<Result<Option<CoderTemplate>, String>>,
        /// Result returned by `create_workspace`.
        pub create_workspace_result: Mutex<Result<CoderWorkspace, String>>,

        /// Call counts for assertions.
        pub start_workspace_calls: Mutex<Vec<Uuid>>,
        pub get_template_calls: Mutex<Vec<String>>,
        pub create_workspace_calls: Mutex<Vec<(String, String)>>, // (owner, workspace_name)
    }

    impl MockCoderClient {
        /// Create a mock where all operations succeed with the given template/workspace IDs.
        pub fn new_ok(template_id: Uuid, coder_workspace_id: Uuid) -> Self {
            let template = CoderTemplate {
                id: template_id,
                name: "seam-agent".to_string(),
                organization_id: Uuid::new_v4(),
            };
            let job = CoderProvisionerJob {
                id: Uuid::new_v4(),
                status: "succeeded".to_string(),
                error: None,
            };
            let build = CoderWorkspaceBuild {
                id: Uuid::new_v4(),
                status: "running".to_string(),
                job,
            };
            let workspace = CoderWorkspace {
                id: coder_workspace_id,
                name: "seam-test".to_string(),
                owner_id: Uuid::new_v4(),
                owner_name: "me".to_string(),
                template_id,
                template_name: "seam-agent".to_string(),
                latest_build: CoderWorkspaceBuild {
                    id: Uuid::new_v4(),
                    status: "running".to_string(),
                    job: CoderProvisionerJob {
                        id: Uuid::new_v4(),
                        status: "succeeded".to_string(),
                        error: None,
                    },
                },
            };

            Self {
                start_workspace_result: Mutex::new(Ok(build)),
                get_template_result: Mutex::new(Ok(Some(template))),
                create_workspace_result: Mutex::new(Ok(workspace)),
                start_workspace_calls: Mutex::new(vec![]),
                get_template_calls: Mutex::new(vec![]),
                create_workspace_calls: Mutex::new(vec![]),
            }
        }

        /// Create a mock where `create_workspace` fails with the given message.
        pub fn new_create_fails(template_id: Uuid, error_msg: &str) -> Self {
            let mock = Self::new_ok(template_id, Uuid::new_v4());
            *mock.create_workspace_result.lock().unwrap() = Err(error_msg.to_string());
            mock
        }

        /// Create a mock where `get_template_by_name` returns None (template not found).
        pub fn new_no_template() -> Self {
            let mock = Self::new_ok(Uuid::new_v4(), Uuid::new_v4());
            *mock.get_template_result.lock().unwrap() = Ok(None);
            mock
        }
    }

    impl CoderApi for MockCoderClient {
        async fn start_workspace(&self, id: Uuid) -> Result<CoderWorkspaceBuild, CoderError> {
            self.start_workspace_calls.lock().unwrap().push(id);
            self.start_workspace_result
                .lock()
                .unwrap()
                .as_ref()
                .map(|b| CoderWorkspaceBuild {
                    id: b.id,
                    status: b.status.clone(),
                    job: CoderProvisionerJob {
                        id: b.job.id,
                        status: b.job.status.clone(),
                        error: b.job.error.clone(),
                    },
                })
                .map_err(|e| CoderError::Api {
                    status: 500,
                    message: e.clone(),
                })
        }

        async fn get_template_by_name(
            &self,
            name: &str,
        ) -> Result<Option<CoderTemplate>, CoderError> {
            self.get_template_calls
                .lock()
                .unwrap()
                .push(name.to_string());
            self.get_template_result
                .lock()
                .unwrap()
                .as_ref()
                .map(|opt| {
                    opt.as_ref().map(|t| CoderTemplate {
                        id: t.id,
                        name: t.name.clone(),
                        organization_id: t.organization_id,
                    })
                })
                .map_err(|e| CoderError::Api {
                    status: 500,
                    message: e.clone(),
                })
        }

        async fn create_workspace(
            &self,
            owner: &str,
            req: CreateWorkspaceRequest,
        ) -> Result<CoderWorkspace, CoderError> {
            self.create_workspace_calls
                .lock()
                .unwrap()
                .push((owner.to_string(), req.name.clone()));
            self.create_workspace_result
                .lock()
                .unwrap()
                .as_ref()
                .map(|ws| CoderWorkspace {
                    id: ws.id,
                    name: ws.name.clone(),
                    owner_id: ws.owner_id,
                    owner_name: ws.owner_name.clone(),
                    template_id: ws.template_id,
                    template_name: ws.template_name.clone(),
                    latest_build: CoderWorkspaceBuild {
                        id: ws.latest_build.id,
                        status: ws.latest_build.status.clone(),
                        job: CoderProvisionerJob {
                            id: ws.latest_build.job.id,
                            status: ws.latest_build.job.status.clone(),
                            error: ws.latest_build.job.error.clone(),
                        },
                    },
                })
                .map_err(|e| CoderError::Api {
                    status: 500,
                    message: e.clone(),
                })
        }
    }
}
