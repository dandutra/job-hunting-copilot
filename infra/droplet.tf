resource "tailscale_tailnet_key" "server" {
  description   = "${var.hostname} first boot"
  reusable      = false
  ephemeral     = false
  preauthorized = true
  expiry        = 3600
  tags          = ["tag:server"]

  # Already the default for single-use keys; set so a switch to reusable doesn't start replacing it.
  recreate_if_invalid = "never"

  depends_on = [tailscale_acl.policy]
}

resource "digitalocean_droplet" "app" {
  name       = var.hostname
  region     = var.region
  size       = var.droplet_size
  image      = "ubuntu-24-04-x64"
  monitoring = true
  backups    = false
  ipv6       = false

  user_data = templatefile("${path.module}/cloud-init.yaml", {
    hostname         = var.hostname
    first_boot_b64   = base64encode(file("${path.module}/first-boot.sh"))
    first_boot_env64 = base64encode("TS_AUTHKEY='${tailscale_tailnet_key.server.key}'\nTS_HOSTNAME='${var.hostname}'\n")
  })

  lifecycle {
    # cloud-init runs once. A changed key must not replace a running server.
    ignore_changes = [user_data]
  }
}

resource "digitalocean_firewall" "app" {
  name        = "${var.hostname}-no-inbound"
  droplet_ids = [digitalocean_droplet.app.id]

  # No inbound rules: DigitalOcean drops all inbound traffic. Everything arrives through Tailscale.

  outbound_rule {
    protocol              = "tcp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "udp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "icmp"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
}
