output "instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.app.id
}

output "public_ip" {
  description = "Elastic IP of the Seam server"
  value       = aws_eip.app.public_ip
}

output "eip" {
  description = "Elastic IP allocation ID"
  value       = aws_eip.app.id
}

output "ecr_url" {
  description = "ECR repository URL for seam/server"
  value       = aws_ecr_repository.server.repository_url
}

output "github_actions_role_arn" {
  description = "IAM role ARN for GitHub Actions OIDC"
  value       = aws_iam_role.github_actions.arn
}

output "s3_bucket_name" {
  description = "S3 bucket for backups"
  value       = aws_s3_bucket.backups.bucket
}

output "ssh_command" {
  description = "SSH command to connect to the Seam server"
  value       = "ssh ec2-user@${aws_eip.app.public_ip}"
}

output "dns_records" {
  description = "Create these DNS A records at your registrar"
  value = {
    "seam.${var.domain_name}"      = aws_eip.app.public_ip
    "auth.seam.${var.domain_name}" = aws_eip.app.public_ip
  }
}
