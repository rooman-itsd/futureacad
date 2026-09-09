# FutureAcad.ae

Full-stack site for **FutureAcad** — a Deep Tech Initiative by Rooman (Dubai).
A cinematic, WebGL-driven frontend with a Flask backend that captures leads and
serves a password-protected admin dashboard.

## Stack
- **Frontend** — vanilla HTML/CSS/JS, Three.js (neural world), GSAP + ScrollTrigger, Lenis. No build step.
- **Backend** — Python / Flask, SQLite (zero-config), server-rendered Jinja templates.

## Project layout
```
.
├── run.py                # dev entrypoint
├── config.py             # env-driven config
├── requirements.txt      # pinned — CI installs exactly what prod runs
├── requirements-dev.txt  # + pytest, ruff
├── pyproject.toml        # pytest + ruff config
├── .env.example          # copy to .env
├── DEPLOY.md             # Lightsail deployment runbook
├── instance/             # SQLite db (auto-created, gitignored)
├── deploy/               # nginx, systemd, gunicorn, provision.sh
├── tests/                # pytest suite
└── app/
    ├── __init__.py       # app factory, error pages, security headers
    ├── routes.py         # public pages + /api/contact
    ├── admin.py          # /admin login, dashboard, CSV export
    ├── db.py             # SQLite (leads table)
    ├── utils.py          # CSRF + email helpers
    ├── data.py           # ecosystem project list
    ├── templates/        # base, index, about, services, work, contact, admin/*
    └── static/
        ├── css/          # styles.css (site) · admin.css
        ├── js/           # world.js · site.js · home.js · contact.js
        └── img/          # logos, favicons
```

## Run locally (Windows / macOS / Linux)
```bash
# 1. create + activate a virtualenv
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux

# 2. install
pip install -r requirements.txt

# 3. configure
copy .env.example .env         # then edit SECRET_KEY + ADMIN_PASSWORD

# 4. run
python run.py
```
Open **http://127.0.0.1:5000**. Admin: **http://127.0.0.1:5000/admin**
(default `admin` / `futureacad` — change in `.env`).

## Pages
| Route | Page |
|-------|------|
| `/` | Cinematic home (6-scene journey) |
| `/about` | About |
| `/services` | Services |
| `/work` | Live platforms |
| `/contact` | Contact form |
| `/admin` | Leads dashboard (login required) |
| `/api/contact` | `POST` JSON — stores a lead |
| `/healthz` | Health check |

## Leads
Contact submissions are validated (server + client), protected by a CSRF token
and a honeypot, **stored in the database, and emailed** to `LEAD_NOTIFY`.
View/export them at `/admin`.

The data layer auto-selects its backend:
- **SQLite** (`instance/futureacad.db`) — the default, zero setup. Used in
  production on Lightsail too.
- **Postgres** — used automatically whenever `POSTGRES_URL` is present.

## Tests
```bash
pip install -r requirements-dev.txt
pytest                      # 79 tests, coverage gate at 85%
ruff check .
```
Postgres-backed tests are skipped unless `TEST_POSTGRES_URL` is set:
```bash
docker run --rm -d -p 55432:5432 -e POSTGRES_PASSWORD=pg postgres:16
TEST_POSTGRES_URL=postgres://postgres:pg@127.0.0.1:55432/postgres pytest
```

## Deployment
Production runs on **AWS Lightsail** (ap-south-1) behind nginx, with
GitHub Actions for CI/CD. See **[DEPLOY.md](DEPLOY.md)** for the full runbook:
instance setup, DNS, TLS, secrets, and the release/rollback flow.

- **CI** (`.github/workflows/ci.yml`) — ruff, pytest against SQLite *and*
  Postgres, plus a real gunicorn boot smoke test.
- **CD** (`.github/workflows/deploy.yml`) — runs only after CI passes. Ships an
  atomic release, restarts via systemd, polls `/healthz`, and rolls back
  automatically if the new release is unhealthy.

Application secrets live in **AWS SSM Parameter Store** (`/futureacad/prod/*`,
SecureString/KMS). A systemd oneshot fetches them into `/run/futureacad/env` —
**tmpfs, so decrypted secrets stay in RAM and never touch disk** — before the app
starts. GitHub Actions holds only the SSH deploy credentials; application secrets
never pass through CI. Rotate by updating the parameter and restarting
`futureacad-secrets`, with no redeploy.

`create_app()` refuses to boot in production while `SECRET_KEY` or
`ADMIN_PASSWORD` are still the dev placeholders.

## Run elsewhere
Any WSGI host works:
```bash
gunicorn "app:create_app()" -b 0.0.0.0:8000                 # Linux
waitress-serve --listen=0.0.0.0:8000 "app:create_app"       # Windows
```
