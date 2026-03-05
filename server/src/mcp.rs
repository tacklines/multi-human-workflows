#[allow(dead_code)]
mod models;
mod mcp_handler;

use clap::Parser;
use rmcp::ServiceExt;
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Parser)]
#[command(name = "seam-mcp", about = "Seam MCP server for agent session access")]
struct Cli {
    /// Agent join code (8-character)
    #[arg(long)]
    agent_code: Option<String>,

    /// Display name for the agent
    #[arg(long)]
    agent_name: Option<String>,

    /// Database URL
    #[arg(long, env = "DATABASE_URL", default_value = "postgres://seam:seam@localhost:5433/seam")]
    database_url: String,
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    let cli = Cli::parse();

    eprintln!("[seam-mcp] Connecting to database...");
    let db = PgPool::connect(&cli.database_url)
        .await
        .expect("Failed to connect to database");

    let mcp = mcp_handler::SeamMcp::new_with_persisted_state(db);

    // Auto-join if agent code provided
    if let Some(ref code) = cli.agent_code {
        eprintln!("[seam-mcp] Joining session with agent code {}...", &code[..3.min(code.len())]);
        match mcp.do_agent_join(code, cli.agent_name.as_deref()).await {
            Ok(result) => {
                let session_code = result["session"]["code"].as_str().unwrap().to_string();
                let participant_id = result["participant_id"].as_str()
                    .and_then(|s| Uuid::parse_str(s).ok());
                let sponsor_name = result["sponsor_name"].as_str().map(|s| s.to_string());

                eprintln!("[seam-mcp] Joined session {}", session_code);
                if let Some(ref name) = sponsor_name {
                    eprintln!("[seam-mcp] Sponsored by: {}", name);
                }

                // Fetch project info
                let mut project_id = None;
                let mut ticket_prefix = None;
                if let Ok(Some(session)) = sqlx::query_as::<_, models::Session>(
                    "SELECT * FROM sessions WHERE code = $1"
                ).bind(&session_code).fetch_optional(&mcp.db).await {
                    if let Ok(Some(project)) = sqlx::query_as::<_, models::Project>(
                        "SELECT * FROM projects WHERE id = $1"
                    ).bind(session.project_id).fetch_optional(&mcp.db).await {
                        project_id = Some(project.id);
                        ticket_prefix = Some(project.ticket_prefix);
                    }
                }

                if let Ok(mut state) = mcp.state.lock() {
                    state.session_code = Some(session_code);
                    state.participant_id = participant_id;
                    state.sponsor_name = sponsor_name;
                    state.project_id = project_id;
                    state.ticket_prefix = ticket_prefix;
                    state.save();
                }
            }
            Err(e) => {
                eprintln!("[seam-mcp] Failed to auto-join: {e}");
                eprintln!("[seam-mcp] Continuing — use join_session tool manually");
            }
        }
    }

    eprintln!("[seam-mcp] Starting stdio transport...");
    let transport = rmcp::transport::io::stdio();

    match mcp.serve(transport).await {
        Ok(server) => {
            if let Err(e) = server.waiting().await {
                eprintln!("[seam-mcp] Server stopped: {e}");
            }
        }
        Err(e) => {
            eprintln!("[seam-mcp] Failed to start: {e}");
            std::process::exit(1);
        }
    }
}
