terraform {
  required_version = ">= 1.11"

  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.106"
    }
    tailscale = {
      source  = "tailscale/tailscale"
      version = "~> 0.29"
    }
    b2 = {
      source  = "Backblaze/b2"
      version = "~> 0.14"
    }
  }

  # Bucket, key, region and endpoint live in the gitignored backend.hcl. See backend.hcl.example.
  backend "s3" {
    use_path_style              = true
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
  }
}

# Credentials come from the environment: DIGITALOCEAN_TOKEN, TAILSCALE_API_KEY,
# TAILSCALE_TAILNET, B2_APPLICATION_KEY_ID and B2_APPLICATION_KEY.
provider "digitalocean" {}
provider "tailscale" {}
provider "b2" {}
