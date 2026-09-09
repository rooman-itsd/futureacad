#!/usr/bin/env bash
#
# One-time: write FutureAcad's secrets into AWS SSM Parameter Store.
#
# Run from YOUR machine with admin AWS credentials — never on the instance.
# The instance's own IAM user is read-only and cannot create parameters.
#
#   bash deploy/seed-ssm.sh
#
# Re-running updates values in place (new parameter versions; SSM keeps history).
set -euo pipefail

REGION="${AWS_REGION:-ap-south-1}"
SSM_PATH="${SSM_PATH:-/futureacad/prod}"
KMS_KEY="${KMS_KEY:-alias/aws/ssm}"

command -v aws >/dev/null || { echo "aws CLI required"; exit 1; }

echo "Region:   $REGION"
echo "Path:     $SSM_PATH"
echo "KMS key:  $KMS_KEY"
aws sts get-caller-identity --query 'Arn' --output text --region "$REGION" \
  | sed 's/^/Identity: /'
echo

put() {  # put <name> <value> <SecureString|String>
  local name="$1" value="$2" type="$3"
  local -a args=(
    ssm put-parameter
    --region "$REGION"
    --name "$SSM_PATH/$name"
    --value "$value"
    --type "$type"
    --overwrite
    --query Version --output text
  )
  # Only SecureString parameters take a KMS key.
  [ "$type" = "SecureString" ] && args+=(--key-id "$KMS_KEY")
  aws "${args[@]}" >/dev/null
  printf '  %-24s %s\n' "$name" "$type"
}

prompt_secret() {  # prompt_secret <var> <label>
  local __var="$1" __label="$2" __val=""
  while [ -z "$__val" ]; do
    read -r -s -p "$__label: " __val; echo
    [ -z "$__val" ] && echo "  (required)"
  done
  printf -v "$__var" '%s' "$__val"
}

prompt_plain() {  # prompt_plain <var> <label> <default>
  local __var="$1" __label="$2" __default="${3:-}" __val=""
  read -r -p "$__label${__default:+ [$__default]}: " __val
  printf -v "$__var" '%s' "${__val:-$__default}"
}

# --- SECRET_KEY: generated, never typed, never shown ---
if aws ssm get-parameter --region "$REGION" --name "$SSM_PATH/SECRET_KEY" >/dev/null 2>&1; then
  read -r -p "SECRET_KEY already exists. Rotate it? (invalidates all sessions) [y/N]: " rot
  if [ "${rot,,}" = "y" ]; then
    SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_hex(32))')
    ROTATE_KEY=1
  fi
else
  SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_hex(32))')
  ROTATE_KEY=1
fi

echo "--- Admin dashboard login (/admin) ---"
prompt_plain  ADMIN_USERNAME "ADMIN_USERNAME" "ceo@rooman.net"
prompt_secret ADMIN_PASSWORD "ADMIN_PASSWORD (hidden)"

echo
echo "--- SES SMTP credentials (blank to skip; email stays disabled) ---"
echo "    SMTP_HOST / SMTP_FROM / LEAD_NOTIFY are set by CloudFormation."
SMTP_USER=""; SMTP_PASSWORD=""
prompt_plain SMTP_USER "SMTP_USER (SES SMTP username)" ""
[ -n "$SMTP_USER" ] && prompt_secret SMTP_PASSWORD "SMTP_PASSWORD (hidden)"

echo
echo "Writing parameters..."
[ "${ROTATE_KEY:-0}" = "1" ] && put SECRET_KEY "$SECRET_KEY" SecureString
put ADMIN_USERNAME "$ADMIN_USERNAME" SecureString
put ADMIN_PASSWORD "$ADMIN_PASSWORD" SecureString

# NOTE: the non-secret String parameters (DATABASE, PROXY_HOPS,
# SESSION_COOKIE_SECURE, SMTP_HOST, SMTP_PORT, SMTP_FROM, LEAD_NOTIFY) are owned
# by CloudFormation — see infra/lightsail.yaml. Writing them here too would show
# up as stack drift, so this script only handles the SecureString secrets that
# CloudFormation cannot create.
if [ -n "$SMTP_USER" ]; then
  put SMTP_USER "$SMTP_USER" SecureString
  put SMTP_PASSWORD "$SMTP_PASSWORD" SecureString
fi

echo
echo "Stored under $SSM_PATH:"
aws ssm get-parameters-by-path --region "$REGION" --path "$SSM_PATH/" \
  --query 'Parameters[].[Name,Type]' --output text | sed 's/^/  /'

cat <<DONE

Done. Values are NOT printed back — read them with:
  aws ssm get-parameter --region $REGION --name $SSM_PATH/ADMIN_PASSWORD --with-decryption

Apply on the instance:
  sudo systemctl restart futureacad-secrets futureacad
DONE
