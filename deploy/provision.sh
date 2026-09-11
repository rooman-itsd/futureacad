#!/usr/bin/env bash
#
# One-time provisioning for a fresh Ubuntu 24.04 Lightsail instance.
#
#   scp deploy/* ubuntu@<static-ip>:/tmp/futureacad-deploy/
#   ssh ubuntu@<static-ip> 'cd /tmp/futureacad-deploy && sudo bash provision.sh'
#
# Idempotent: safe to re-run. It never writes application secrets — those live
# in AWS SSM Parameter Store (see seed-ssm.sh) and are fetched into tmpfs at
# service start by futureacad-secrets.service.
set -euo pipefail

APP_USER=futureacad
APP_ROOT=/var/www/futureacad
DEPLOY_USER=deploy
DOMAIN=futureacad.ae
AWS_REGION_DEFAULT=ap-south-1
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }

[ "$(id -u)" -eq 0 ] || { echo "Run with sudo."; exit 1; }

log "1/10 Installing packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  python3 python3-venv python3-pip \
  nginx certbot python3-certbot-nginx \
  ufw fail2ban curl rsync unzip jq sqlite3 unattended-upgrades

log "2/10 Installing AWS CLI v2 (needed to read SSM)"
if ! command -v aws >/dev/null 2>&1; then
  case "$(dpkg --print-architecture)" in
    amd64) CLI_URL=https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip ;;
    arm64) CLI_URL=https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip ;;
    *) echo "Unsupported architecture"; exit 1 ;;
  esac
  curl -fsSL "$CLI_URL" -o /tmp/awscliv2.zip
  unzip -q -o /tmp/awscliv2.zip -d /tmp
  /tmp/aws/install --update >/dev/null
  rm -rf /tmp/aws /tmp/awscliv2.zip
fi
aws --version

log "3/10 Creating service + deploy users"
id -u "$APP_USER"    >/dev/null 2>&1 || useradd --system --shell /usr/sbin/nologin --home "$APP_ROOT" "$APP_USER"
id -u "$DEPLOY_USER" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$DEPLOY_USER"
usermod -aG "$APP_USER" "$DEPLOY_USER"

log "4/10 Creating directory layout"
# releases/  — one directory per deployed commit (last 5 kept)
# current    — symlink to the live release, swapped atomically
# shared/    — state that must OUTLIVE releases (the SQLite database)
# venv/      — shared virtualenv
# NOTE: no secrets on disk. They land in /run/futureacad/env (tmpfs) at boot.
mkdir -p "$APP_ROOT"/{releases,shared/instance}
chown -R "$DEPLOY_USER:$APP_USER" "$APP_ROOT"
chmod 755 "$APP_ROOT"
chown -R "$APP_USER:$APP_USER" "$APP_ROOT/shared/instance"
chmod 770 "$APP_ROOT/shared/instance"

log "5/10 Creating the virtualenv"
if [ ! -x "$APP_ROOT/venv/bin/python" ]; then
  python3 -m venv "$APP_ROOT/venv"
fi
"$APP_ROOT/venv/bin/pip" install --quiet --upgrade pip
chown -R "$DEPLOY_USER:$APP_USER" "$APP_ROOT/venv"

log "6/10 Installing the SSM secret fetcher"
install -o root -g root -m 755 "$SRC/fetch-secrets.sh" /usr/local/bin/futureacad-fetch-secrets
mkdir -p /etc/futureacad
chmod 700 /etc/futureacad
# Read-only IAM credentials for the instance. Scoped by
# iam-ssm-read-policy.json to one SSM path + one KMS key.
if [ ! -f /etc/futureacad/aws.env ]; then
  cat > /etc/futureacad/aws.env <<AWSENV
# Credentials for the read-only IAM user that may fetch /futureacad/prod/*.
# Lightsail cannot use IAM instance roles, so scoped keys are required here.
# Rotate with: aws iam create-access-key / delete-access-key
AWS_DEFAULT_REGION=$AWS_REGION_DEFAULT
AWS_REGION=$AWS_REGION_DEFAULT
AWS_ACCESS_KEY_ID=CHANGE_ME
AWS_SECRET_ACCESS_KEY=CHANGE_ME
AWSENV
  echo "Created /etc/futureacad/aws.env — fill in the IAM keys."
else
  echo "Existing /etc/futureacad/aws.env left untouched."
fi
chown root:root /etc/futureacad/aws.env
chmod 600 /etc/futureacad/aws.env

log "7/10 Installing gunicorn config + systemd units"
install -o root -g root -m 644 "$SRC/gunicorn.conf.py" "$APP_ROOT/shared/gunicorn.conf.py"
install -o root -g root -m 644 "$SRC/futureacad-secrets.service" /etc/systemd/system/
install -o root -g root -m 644 "$SRC/futureacad.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable futureacad-secrets futureacad >/dev/null

log "8/10 Restricting the deploy user's sudo rights"
cat > /etc/sudoers.d/futureacad-deploy <<SUDO
# $DEPLOY_USER may manage only the futureacad units — nothing else.
$DEPLOY_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart futureacad
$DEPLOY_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart futureacad-secrets
$DEPLOY_USER ALL=(root) NOPASSWD: /usr/bin/systemctl status futureacad
$DEPLOY_USER ALL=(root) NOPASSWD: /usr/bin/systemctl status futureacad-secrets
$DEPLOY_USER ALL=(root) NOPASSWD: /usr/bin/journalctl -u futureacad *
$DEPLOY_USER ALL=(root) NOPASSWD: /usr/bin/journalctl -u futureacad-secrets *
SUDO
chmod 440 /etc/sudoers.d/futureacad-deploy
visudo -cf /etc/sudoers.d/futureacad-deploy

log "9/10 Configuring nginx"
# certbot --nginx rewrites this file in place to add the TLS listeners. Blindly
# reinstalling the HTTP-only template would silently remove HTTPS, so once a
# certificate has been deployed we leave the live config alone.
NGINX_SITE=/etc/nginx/sites-available/futureacad
if [ -f "$NGINX_SITE" ] && grep -q "managed by Certbot" "$NGINX_SITE"; then
  echo "Certbot-managed config detected — leaving it in place."
  echo "To re-apply the template you must re-run certbot afterwards:"
  echo "  sudo install -m 644 $SRC/nginx.conf $NGINX_SITE"
  echo "  sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN"
else
  install -o root -g root -m 644 "$SRC/nginx.conf" "$NGINX_SITE"
fi
ln -sfn "$NGINX_SITE" /etc/nginx/sites-enabled/futureacad
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

log "10/10 Firewall + automatic security updates"
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null
systemctl enable --now fail2ban >/dev/null
dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null 2>&1 || true
ufw status verbose | head -10

cat <<DONE

------------------------------------------------------------------
Provisioning complete. Remaining manual steps:

  1. Seed the secrets into SSM (from YOUR machine, admin AWS creds):
         bash deploy/seed-ssm.sh

  2. Create the read-only IAM user, attach iam-ssm-read-policy.json,
     and put its access keys here:
         sudo nano /etc/futureacad/aws.env

  3. Verify the fetch works — this must print a parameter count:
         sudo systemctl start futureacad-secrets
         sudo systemctl status futureacad-secrets
         sudo wc -l /run/futureacad/env

  4. Authorise the CI deploy key:
         sudo -u $DEPLOY_USER mkdir -p /home/$DEPLOY_USER/.ssh
         sudo -u $DEPLOY_USER nano /home/$DEPLOY_USER/.ssh/authorized_keys
         sudo chmod 700 /home/$DEPLOY_USER/.ssh
         sudo chmod 600 /home/$DEPLOY_USER/.ssh/authorized_keys

  5. Point $DOMAIN at this instance, then issue the certificate:
         sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN

The app will not start until a release exists — push to main and the
Deploy workflow creates one.
------------------------------------------------------------------
DONE
