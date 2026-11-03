# Replaces the whole tailnet policy. Every device you want to keep reaching must match a rule here.
resource "tailscale_acl" "policy" {
  overwrite_existing_content = true

  acl = jsonencode({
    tagOwners = {
      "tag:server" = ["autogroup:admin"]
      "tag:ci"     = ["autogroup:admin"]
    }

    acls = [
      # The user's own devices keep reaching each other.
      { action = "accept", src = ["autogroup:member"], dst = ["autogroup:self:*"] },
      { action = "accept", src = ["autogroup:member"], dst = ["tag:server:*"] },
      # Tailscale SSH rides on port 22 of the server.
      { action = "accept", src = ["tag:ci"], dst = ["tag:server:22"] },
    ]

    ssh = [
      { action = "accept", src = ["tag:ci"], dst = ["tag:server"], users = ["deploy"] },
      { action = "accept", src = ["autogroup:member"], dst = ["tag:server"], users = ["deploy"] },
    ]
  })
}
