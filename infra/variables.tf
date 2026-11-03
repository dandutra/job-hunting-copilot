variable "region" {
  description = "DigitalOcean region slug."
  type        = string
  default     = "tor1"
}

variable "droplet_size" {
  description = "Droplet size slug."
  type        = string
  default     = "s-1vcpu-2gb"
}

variable "hostname" {
  description = "Droplet name and tailnet machine name. The app's address is <hostname>.<tailnet>.ts.net."
  type        = string
  default     = "copilot"
}

variable "backups_bucket_name" {
  description = "Name of the B2 bucket for nightly dumps. B2 bucket names are unique across all accounts."
  type        = string
}
