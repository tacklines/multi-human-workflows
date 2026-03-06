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

resource "aws_ssm_parameter" "zitadel_masterkey" {
  name  = "/seam/zitadel-masterkey"
  type  = "SecureString"
  value = var.zitadel_masterkey
}

resource "aws_ssm_parameter" "zitadel_db_password" {
  name  = "/seam/zitadel-db-password"
  type  = "SecureString"
  value = var.zitadel_db_password
}

resource "aws_ssm_parameter" "zitadel_admin_password" {
  name  = "/seam/zitadel-admin-password"
  type  = "SecureString"
  value = var.zitadel_admin_password
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
