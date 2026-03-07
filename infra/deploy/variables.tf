variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (dev, prod)"
  type        = string
  default     = "prod"
}

variable "instance_type" {
  description = "EC2 instance type (ARM64)"
  type        = string
  default     = "t4g.large"
}

variable "domain_name" {
  description = "Base domain name"
  type        = string
  default     = "tacklines.com"
}

variable "acme_email" {
  description = "Email address for ACME certificate registration (ZeroSSL, Let's Encrypt)"
  type        = string
}

variable "ssh_public_key" {
  description = "SSH public key for EC2 access"
  type        = string
}

variable "ssh_allowed_cidrs" {
  description = "CIDR blocks allowed to SSH into the EC2 instance"
  type        = list(string)
  default     = [] # Set to your IP, e.g. ["1.2.3.4/32"]
}

variable "github_repo" {
  description = "GitHub repository in org/repo format for OIDC trust"
  type        = string
  default     = "tacklines/seam"
}

variable "postgres_password" {
  description = "PostgreSQL password for the seam database"
  type        = string
  sensitive   = true
}

variable "rabbitmq_password" {
  description = "RabbitMQ password for the seam user"
  type        = string
  sensitive   = true
}

variable "hydra_secrets_system" {
  description = "Hydra system secret for cookie/token signing"
  type        = string
  sensitive   = true
}

variable "kratos_secrets_cookie" {
  description = "Kratos cookie secret"
  type        = string
  sensitive   = true
}

variable "kratos_secrets_cipher" {
  description = "Kratos cipher secret (exactly 32 chars)"
  type        = string
  sensitive   = true
}

variable "credential_master_key" {
  description = "Fernet key for credential envelope encryption"
  type        = string
  sensitive   = true
}

variable "worker_api_token" {
  description = "Bearer token for seam-worker to call server API"
  type        = string
  sensitive   = true
}

variable "tailscale_auth_key" {
  description = "Tailscale auth key for automated VPN join"
  type        = string
  sensitive   = true
}
