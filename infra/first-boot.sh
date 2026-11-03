#!/usr/bin/env bash
# Installs Docker and Tailscale, then publishes the web port on the tailnet. Run once by cloud-init.
set -euo pipefail

# The auth key is single-use and expires in an hour, but it has no reason to stay on disk.
trap 'shred -u /root/first-boot.env' EXIT
# shellcheck disable=SC1091
. /root/first-boot.env

install -m 0755 -d /etc/apt/keyrings

curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
# shellcheck disable=SC1091
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
  >/etc/apt/sources.list.d/docker.list

curl -fsSL "https://pkgs.tailscale.com/stable/ubuntu/${VERSION_CODENAME}.noarmor.gpg" \
  -o /usr/share/keyrings/tailscale-archive-keyring.gpg
curl -fsSL "https://pkgs.tailscale.com/stable/ubuntu/${VERSION_CODENAME}.tailscale-keyring.list" \
  -o /etc/apt/sources.list.d/tailscale.list

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin tailscale

# Members of the docker group are root-equivalent. Only Tailscale SSH can log in as this user.
usermod -aG docker deploy

tailscale up --auth-key="${TS_AUTHKEY}" --hostname="${TS_HOSTNAME}" --ssh --advertise-tags=tag:server
# Compose publishes the web service on 127.0.0.1:8080. Serve (not Funnel) keeps it inside the tailnet.
tailscale serve --bg --https=443 http://127.0.0.1:8080
