# deploy/

Server-side infrastructure for the Lightsail instance. See [../DEPLOY.md](../DEPLOY.md)
for the runbook that uses these.

| File | Purpose |
|---|---|
| `provision.sh` | One-time setup of a fresh Ubuntu 24.04 instance. Idempotent. |
| `seed-ssm.sh` | One-time: writes the app's secrets into SSM Parameter Store as SecureStrings. Run from your machine with admin AWS credentials. |
| `fetch-secrets.sh` | Installed as `/usr/local/bin/futureacad-fetch-secrets`. Pulls SSM parameters into `/run/futureacad/env` (tmpfs). |
| `futureacad-secrets.service` | Oneshot unit that runs the fetch before the app starts. |
| `futureacad.service` | The gunicorn service. Reads its environment from tmpfs. |
| `gunicorn.conf.py` | Worker/timeout/logging config, tuned for 1 GB RAM. |
| `nginx.conf` | Reverse proxy + static asset serving. `certbot --nginx` adds TLS to it. |
| `iam-ssm-read-policy.json` | Least-privilege policy for the instance's IAM user. |

## About `iam-ssm-read-policy.json`

Attach it to the IAM user whose access keys live in `/etc/futureacad/aws.env`.
Replace `<ACCOUNT_ID>` and `<KMS_KEY_ID>` before use. If you encrypt the
parameters with the AWS-managed `alias/aws/ssm` key, point the second statement
at that key's ARN (find it with `aws kms describe-key --key-id alias/aws/ssm`).

The policy grants exactly two things: read access to parameters under
`/futureacad/prod/`, and `kms:Decrypt` on one key — and the `kms:ViaService`
condition means that key cannot be used for anything except SSM decryption.
The credential can read nothing else in the account, and cannot write.
