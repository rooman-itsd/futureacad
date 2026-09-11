# Deploying FutureAcad to AWS Lightsail (ap-south-1)

Target: one Lightsail instance running nginx + gunicorn + SQLite, with CI/CD
from GitHub Actions and secrets in AWS SSM Parameter Store. ~$7.30/month.

## Architecture

```
GitHub push to main
      |
      v
 CI  (ci.yml)   lint -> tests (SQLite + Postgres) -> gunicorn boot smoke
      |         deploy is BLOCKED unless all three pass
      v
 CD  (deploy.yml)  tarball -> scp -> unpack -> refresh secrets
                   -> swap symlink -> restart -> poll /healthz
                   -> roll back automatically if unhealthy
      |
      v
 Lightsail instance (Ubuntu 24.04, ap-south-1)
   nginx :80/:443 --proxy--> gunicorn 127.0.0.1:8000 --> SQLite
                                   ^
                                   | environment
                             /run/futureacad/env   (tmpfs, 0600)
                                   ^
                                   | futureacad-secrets.service
                             AWS SSM Parameter Store
                             /futureacad/prod/*    (SecureString, KMS)
```

### On-disk layout

```
/var/www/futureacad/
├── releases/<sha>/          one directory per deployed commit (5 kept)
├── current -> releases/<sha>   atomically swapped symlink
├── shared/
│   ├── gunicorn.conf.py
│   └── instance/            futureacad.db  <-- the leads live here
└── venv/

/etc/futureacad/aws.env      scoped read-only IAM keys (root, 0600)
/run/futureacad/env          decrypted secrets — tmpfs, RAM only (root, 0600)
```

Two details carry the design:

1. **The database lives in `shared/`, not inside a release.** Put it anywhere
   else and every deploy wipes your leads.
2. **Decrypted secrets live only in `/run`, which is tmpfs.** They exist in RAM,
   never touch the instance's disk, and are gone on reboot — refetched from SSM
   at every start.

---

## Where secrets are stored

| Secret | Stored in | Form |
|---|---|---|
| `SECRET_KEY` | **SSM** `/futureacad/prod/SECRET_KEY` | SecureString (KMS) |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | **SSM** `/futureacad/prod/*` | SecureString (KMS) |
| `SMTP_USER`, `SMTP_PASSWORD` | **SSM** `/futureacad/prod/*` | SecureString (KMS) |
| Non-secret config (`DATABASE`, `PROXY_HOPS`, `SMTP_HOST`, …) | **SSM** `/futureacad/prod/*` | String |
| Instance's IAM access keys | `/etc/futureacad/aws.env` on the box | root, `chmod 600` |
| `SSH_PRIVATE_KEY`, `LIGHTSAIL_HOST`, `DEPLOY_USER`, `SSH_KNOWN_HOSTS` | **GitHub Actions Secrets** | encrypted, masked |

### What this buys you

- **Application secrets never pass through CI.** GitHub holds only enough to
  open an SSH session and restart two services. A compromised pipeline cannot
  read your admin password or session signing key.
- **No secret is stored on the instance's disk.** `futureacad-secrets.service`
  fetches from SSM into `/run` (tmpfs) before the app starts.
- **Rotation without SSH or redeploy.** Change the parameter in SSM, then
  `sudo systemctl restart futureacad-secrets futureacad`. SSM keeps version
  history, and every read is logged in CloudTrail.
- **Fail closed.** `fetch-secrets.sh` aborts if `SECRET_KEY`,
  `ADMIN_USERNAME` or `ADMIN_PASSWORD` are missing, and
  `futureacad.service` has `Requires=futureacad-secrets.service` — so the app
  never boots with a half-populated environment. Independently, `create_app()`
  refuses to start if `SECRET_KEY`/`ADMIN_PASSWORD` are still the dev
  placeholders. CI asserts that guard on every run.
- **Standard SSM parameters cost nothing** — no storage or API charge.

### The one trade-off, stated plainly

Lightsail **cannot use IAM instance roles** (AWS: "Lightsail does not support
service roles"). So the instance authenticates to SSM with a long-lived IAM
access key in `/etc/futureacad/aws.env`. That key is the residual secret on
disk — but it is scoped by `deploy/iam-ssm-read-policy.json` to *read* one
parameter path and decrypt via one KMS key, with a `kms:ViaService` condition.
It cannot write parameters, read anything else, or touch any other service.

The alternative — CI reading SSM and injecting over SSH — removes that key but
puts your application secrets through the pipeline instead. Keeping the fetch on
the instance is the stronger trade. If you later move to EC2, delete the key
file and attach an instance profile; nothing else changes.

---

## Step 1 — Create the instance

Lightsail console, region **Asia Pacific (Mumbai) / ap-south-1**:

- Platform **Linux/Unix** → Blueprint **OS Only → Ubuntu 24.04 LTS**
- Plan **$7/mo** (1 GB RAM, 2 vCPU, 40 GB SSD, 1 TB transfer in Mumbai)
  - Take the **IPv4** plan, not IPv6-only — IPv4-only visitors could not reach it.
  - Not the $5 plan: 512 MB is where `pip install` and gunicorn workers hit OOM.
- Name `futureacad-prod` → **Create instance**

## Step 2 — Static IP and DNS

1. **Networking → Create static IP** → attach to `futureacad-prod`.
   Free while attached; $0.005/hr if left unattached.
2. **Networking → Create DNS zone** → `futureacad.ae` (free, up to 6 zones).
3. Records: `A @ <static-ip>` and `A www <static-ip>`.
4. Point the domain's nameservers at the four Lightsail nameservers shown.

Do this early — DNS propagation gates the TLS step.

## Step 3 — Firewall

Instance → **Networking → IPv4 Firewall**: allow SSH (22), HTTP (80),
HTTPS (443). `provision.sh` also configures `ufw` on the host.

## Step 4 — Seed the secrets into SSM

From **your** machine, with admin AWS credentials:

```bash
bash deploy/seed-ssm.sh
```

It generates a random `SECRET_KEY` (never typed, never printed), prompts for the
admin login and SES values with hidden input, and writes everything under
`/futureacad/prod/` — secrets as SecureString, plain config as String. Re-run it
any time to update values; SSM keeps version history.

To use a customer-managed KMS key instead of `alias/aws/ssm`:

```bash
KMS_KEY=arn:aws:kms:ap-south-1:<acct>:key/<id> bash deploy/seed-ssm.sh
```

## Step 5 — Create the instance's IAM user

1. IAM → **Users → Create user** (e.g. `futureacad-instance`), no console access.
2. Attach an inline policy from `deploy/iam-ssm-read-policy.json`, replacing
   `<ACCOUNT_ID>` and `<KMS_KEY_ID>`. For the AWS-managed key:
   `aws kms describe-key --key-id alias/aws/ssm --query 'KeyMetadata.Arn'`
3. Create an access key for it. You'll paste it in step 7.

This user is read-only and scoped to one path — see the trade-off note above.

## Step 6 — Provision the instance

```bash
ssh -i ~/LightsailDefaultKey.pem ubuntu@<static-ip> 'mkdir -p /tmp/futureacad-deploy'
scp -i ~/LightsailDefaultKey.pem deploy/* ubuntu@<static-ip>:/tmp/futureacad-deploy/
ssh -i ~/LightsailDefaultKey.pem ubuntu@<static-ip> \
    'cd /tmp/futureacad-deploy && sudo bash provision.sh'
```

Installs python/nginx/certbot/ufw/fail2ban/jq and **AWS CLI v2**, creates the
`futureacad` and `deploy` users, builds the directory layout and virtualenv,
installs the fetcher plus both systemd units, restricts the deploy user's sudo,
configures nginx, and enables the firewall. Idempotent — safe to re-run.

## Step 7 — Give the instance its IAM keys, then verify the fetch

```bash
sudo nano /etc/futureacad/aws.env          # replace both CHANGE_ME values
sudo systemctl start futureacad-secrets
sudo systemctl status futureacad-secrets   # expect: wrote N parameters
sudo wc -l /run/futureacad/env             # expect: the parameter count
sudo ls -l /run/futureacad/env             # expect: -rw------- root root
```

If this fails, fix it before deploying — the app will not start without it.
Common causes: wrong region, policy ARN typo, or missing `kms:Decrypt`.

## Step 8 — Deploy key and GitHub Secrets

```bash
ssh-keygen -t ed25519 -f ~/.ssh/futureacad_deploy -C "github-actions" -N ""
ssh-keyscan -H <static-ip>            # save the output for SSH_KNOWN_HOSTS
```

Authorise the **public** key on the instance:

```bash
sudo -u deploy mkdir -p /home/deploy/.ssh
sudo -u deploy tee /home/deploy/.ssh/authorized_keys < /dev/stdin   # paste the .pub
sudo chmod 700 /home/deploy/.ssh && sudo chmod 600 /home/deploy/.ssh/authorized_keys
```

GitHub → **Settings → Secrets and variables → Actions**:

| Name | Value |
|---|---|
| `SSH_PRIVATE_KEY` | contents of `~/.ssh/futureacad_deploy` (private half) |
| `LIGHTSAIL_HOST` | the static IP |
| `DEPLOY_USER` | `deploy` |
| `SSH_KNOWN_HOSTS` | the `ssh-keyscan` output (pins the host key) |

No AWS credentials go into GitHub.

## Step 9 — Email via Amazon SES

1. SES console (ap-south-1) → **Verified identities** → verify the domain
   `futureacad.ae` (add the DKIM records to your Lightsail DNS zone), or just
   verify the single `LEAD_NOTIFY` inbox.
2. **SMTP settings → Create SMTP credentials** — creates an IAM user and gives
   you an SMTP username/password. These are *not* AWS access keys.
3. Put them into SSM by re-running `bash deploy/seed-ssm.sh`, then
   `sudo systemctl restart futureacad-secrets futureacad`.
4. SES starts in **sandbox mode** — only verified recipients, 200/day. Since the
   app only ever emails the single `LEAD_NOTIFY` inbox, verifying that address is
   enough; request production access only to lift the cap.

Email is optional. With `SMTP_HOST` unset, leads are still stored and readable
at `/admin`; delivery is skipped silently.

## Step 10 — First deploy

Push to `main`, or run **Deploy to Lightsail** from the Actions tab. CI runs
lint, tests and the boot smoke test; only then does the deploy job run.

```bash
sudo systemctl status futureacad
curl -s localhost:8000/healthz
```

## Step 11 — TLS

Once DNS resolves to the static IP:

```bash
sudo certbot --nginx -d futureacad.ae -d www.futureacad.ae
```

certbot rewrites the nginx site to add the 443 listener and HTTP redirect, and
installs a renewal timer. `SESSION_COOKIE_SECURE` is already `1` in SSM.

Two things to know afterwards:

- **`provision.sh` will not overwrite a certbot-managed nginx config.** It
  detects the "managed by Certbot" marker and skips the template, because
  reinstalling the HTTP-only version would silently remove HTTPS. If you do need
  to re-apply the template, re-run certbot immediately after.
- **Until HTTPS is live, the contact form and admin login will not work.** The
  session cookie is `Secure`, so browsers accept it but never send it back over
  plain HTTP, and the CSRF check then fails. This is correct behaviour, not a
  bug — finish TLS before testing forms.

## Step 12 — Backups

Lightsail → instance → **Snapshots → Enable automatic snapshots** (~$1/month,
7-day retention). This is the only copy of your leads: a single instance has no
redundancy, so without snapshots an instance failure loses every submission.

---

## Operating it

```bash
sudo systemctl status futureacad                    # is it up
sudo journalctl -u futureacad -f                    # live app logs
sudo journalctl -u futureacad-secrets -n 20         # last secret fetch
sudo tail -f /var/log/nginx/futureacad.error.log
ls -1t /var/www/futureacad/releases                 # releases, newest first
```

### Rotating a secret

No SSH into the app, no redeploy:

```bash
# 1. update the parameter (or re-run seed-ssm.sh)
aws ssm put-parameter --region ap-south-1 --overwrite \
  --name /futureacad/prod/ADMIN_PASSWORD --type SecureString \
  --key-id alias/aws/ssm --value 'new-password'

# 2. apply it on the instance
sudo systemctl restart futureacad-secrets futureacad
```

Rotating `SECRET_KEY` invalidates every existing session, logging admins out.

Rotating the instance's own IAM key: create a second access key, update
`/etc/futureacad/aws.env`, restart `futureacad-secrets`, then delete the old key.

### Manual rollback

Deploys roll back automatically on a failed health check. To go back deliberately:

```bash
cd /var/www/futureacad
ls -1t releases                                  # pick a previous sha
sudo ln -sfn "$PWD/releases/<sha>" current
sudo systemctl restart futureacad
curl -s localhost:8000/healthz
```

### Back up the leads by hand

```bash
sudo sqlite3 /var/www/futureacad/shared/instance/futureacad.db \
  ".backup '/tmp/leads-$(date +%F).db'"
```

Or export CSV from `/admin`.

## Scaling past one instance

SQLite is a local file, so a second instance would have its own separate table.
The data layer switches to Postgres automatically when `POSTGRES_URL` is set —
add it to SSM and restart; the schema is created on boot, and the Postgres path
is covered by CI. That's the prerequisite for a load balancer or a second
instance.
