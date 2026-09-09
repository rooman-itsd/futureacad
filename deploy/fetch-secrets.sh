#!/usr/bin/env bash
#
# Pull the app's secrets from SSM Parameter Store into a tmpfs environment file.
#
# Run by futureacad-secrets.service before the app starts. The output lives in
# /run (tmpfs), so decrypted secrets exist only in RAM and vanish on reboot —
# they are never written to the instance's disk.
#
# Manual run / rotation:  sudo systemctl restart futureacad-secrets futureacad
set -euo pipefail

SSM_PATH="${SSM_PATH:-/futureacad/prod/}"
OUT="${OUT:-/run/futureacad/env}"
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-ap-south-1}}"
REQUIRED=(SECRET_KEY ADMIN_USERNAME ADMIN_PASSWORD)

for tool in aws jq; do
  command -v "$tool" >/dev/null || { echo "fetch-secrets: '$tool' not installed" >&2; exit 1; }
done

mkdir -p "$(dirname "$OUT")"
umask 077
tmp="$(mktemp "${OUT}.XXXXXX")"
trap 'rm -f "$tmp"' EXIT

# --with-decryption asks KMS to decrypt the SecureString values.
# The CLI paginates get-parameters-by-path automatically.
aws ssm get-parameters-by-path \
      --path "$SSM_PATH" \
      --recursive \
      --with-decryption \
      --region "$REGION" \
      --query 'Parameters[].{n:Name,v:Value}' \
      --output json \
  | jq -r --arg prefix "$SSM_PATH" '
      .[]
      | (.n | ltrimstr($prefix)) as $key
      # Only accept plain env-var names; anything else is ignored, not injected.
      | select($key | test("^[A-Za-z_][A-Za-z0-9_]*$"))
      # @json double-quotes and escapes the value, which matches systemd
      # EnvironmentFile quoting. systemd does not expand $ in these values.
      | "\($key)=\(.v | @json)"
    ' > "$tmp"

# Fail closed: never hand the app a half-populated environment.
missing=()
for key in "${REQUIRED[@]}"; do
  grep -q "^${key}=" "$tmp" || missing+=("$key")
done
if [ "${#missing[@]}" -gt 0 ]; then
  echo "fetch-secrets: missing ${missing[*]} under ${SSM_PATH}" >&2
  exit 1
fi

mv "$tmp" "$OUT"
chmod 600 "$OUT"
trap - EXIT
echo "fetch-secrets: wrote $(wc -l < "$OUT") parameters from ${SSM_PATH} to ${OUT}"
