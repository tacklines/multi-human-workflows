use lapin::{options::*, types::FieldTable, Connection, ConnectionProperties, ExchangeKind};
use sqlx::postgres::PgPoolOptions;
use tracing::info;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    // Connect to Postgres
    let database_url =
        std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;
    info!("Connected to Postgres");

    // Connect to RabbitMQ
    let amqp_url = std::env::var("AMQP_URL")
        .unwrap_or_else(|_| "amqp://seam:seam@localhost:5672".to_string());
    let conn = Connection::connect(&amqp_url, ConnectionProperties::default()).await?;
    let channel = conn.create_channel().await?;
    info!("Connected to RabbitMQ");

    // Declare the topic exchange
    channel
        .exchange_declare(
            "seam.events",
            ExchangeKind::Topic,
            ExchangeDeclareOptions {
                durable: true,
                ..Default::default()
            },
            FieldTable::default(),
        )
        .await?;
    info!("Declared exchange: seam.events");

    // Declare the reactions queue and bind it to the exchange
    channel
        .queue_declare(
            "seam.reactions",
            QueueDeclareOptions {
                durable: true,
                ..Default::default()
            },
            FieldTable::default(),
        )
        .await?;
    channel
        .queue_bind(
            "seam.reactions",
            "seam.events",
            "#",
            QueueBindOptions::default(),
            FieldTable::default(),
        )
        .await?;
    info!("Declared and bound queue: seam.reactions");

    info!("seam-worker is ready");

    // TODO: Spawn the domain-event bridge (PG NOTIFY → RabbitMQ)
    // TODO: Spawn the reactions consumer (RabbitMQ → reaction handlers)
    // TODO: Spawn the cron scheduler

    // Keep the pool alive for background tasks
    let _pool = pool;

    // Wait for shutdown signal
    tokio::signal::ctrl_c().await?;
    info!("Shutting down seam-worker");

    Ok(())
}
