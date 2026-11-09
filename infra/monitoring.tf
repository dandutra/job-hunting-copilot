resource "digitalocean_monitor_alert" "disk" {
  description = "${var.hostname} disk above 80%"
  type        = "v1/insights/droplet/disk_utilization_percent"
  compare     = "GreaterThan"
  value       = 80
  window      = "5m"
  enabled     = true
  entities    = [digitalocean_droplet.app.id]

  alerts {
    email = [var.alert_email]
  }
}
