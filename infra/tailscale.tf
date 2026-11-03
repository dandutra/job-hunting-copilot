# Replaces the whole tailnet policy. Every device you want to keep reaching must match a rule here.
resource "tailscale_acl" "policy" {
  overwrite_existing_content = true

  acl = jsonencode({
    tagOwners = {
      "tag:server" = ["autogroup:admin"]
      "tag:ci"     = ["autogroup:admin"]
    }

    acls = [
      # Stands in for the default allow-all this policy replaces.
      { action = "accept", src = ["autogroup:member"], dst = ["autogroup:self:*"] },
      { action = "accept", src = ["autogroup:member"], dst = ["tag:server:*"] },
      # The ssh rule below also needs network access to port 22.
      { action = "accept", src = ["tag:ci"], dst = ["tag:server:22"] },
    ]

    ssh = [
      { action = "accept", src = ["tag:ci"], dst = ["tag:server"], users = ["deploy"] },
      { action = "accept", src = ["autogroup:member"], dst = ["tag:server"], users = ["deploy"] },
    ]
  })
}
