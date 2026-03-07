resource "aws_ssm_parameter" "postgres_password" {
  name  = "/seam/postgres-password"
  type  = "SecureString"
  value = var.postgres_password
}

resource "aws_ssm_parameter" "rabbitmq_password" {
  name  = "/seam/rabbitmq-password"
  type  = "SecureString"
  value = var.rabbitmq_password
}

resource "aws_ssm_parameter" "hydra_secrets_system" {
  name  = "/seam/hydra-secrets-system"
  type  = "SecureString"
  value = var.hydra_secrets_system
}

resource "aws_ssm_parameter" "kratos_secrets_cookie" {
  name  = "/seam/kratos-secrets-cookie"
  type  = "SecureString"
  value = var.kratos_secrets_cookie
}

resource "aws_ssm_parameter" "kratos_secrets_cipher" {
  name  = "/seam/kratos-secrets-cipher"
  type  = "SecureString"
  value = var.kratos_secrets_cipher
}

resource "aws_ssm_parameter" "credential_master_key" {
  name  = "/seam/credential-master-key"
  type  = "SecureString"
  value = var.credential_master_key
}

resource "aws_ssm_parameter" "worker_api_token" {
  name  = "/seam/worker-api-token"
  type  = "SecureString"
  value = var.worker_api_token
}
