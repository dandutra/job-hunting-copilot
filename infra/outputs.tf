output "droplet_ipv4" {
  description = "Public address, for the port scan in the runbook."
  value       = digitalocean_droplet.app.ipv4_address
}

output "tailnet_hostname" {
  description = "Machine name on the tailnet."
  value       = var.hostname
}

output "backups_bucket" {
  value = b2_bucket.backups.bucket_name
}

output "backups_key_id" {
  value = b2_application_key.backups_writer.application_key_id
}

output "backups_key" {
  description = "Read it with: terraform output -raw backups_key"
  value       = b2_application_key.backups_writer.application_key
  sensitive   = true
}
