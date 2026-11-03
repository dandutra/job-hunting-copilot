#!/usr/bin/env bash
set -euo pipefail

# A copy stays in cloud-init's user-data; the key is single-use, so this only tidies up.
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

# apt-daily often holds the apt locks in a new Droplet's first minutes, and update doesn't wait for its lock.
tries=0
until apt-get update; do
  ((++tries < 20)) || exit 1
  sleep 15
done
apt-get -o DPkg::Lock::Timeout=600 install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin tailscale

# Members of the docker group are root-equivalent. Only Tailscale SSH can log in as this user.
usermod -aG docker deploy

# --operator lets deploy rerun `tailscale serve` over Tailscale SSH without sudo.
tailscale up --auth-key="${TS_AUTHKEY}" --hostname="${TS_HOSTNAME}" --ssh --advertise-tags=tag:server --operator=deploy
# With HTTPS off for the tailnet, serve waits forever on a consent link instead of failing.
timeout 60 tailscale serve --bg --https=443 http://127.0.0.1:8080
