"""Gunicorn config for FutureAcad on a 1 GB Lightsail instance.

Referenced by deploy/futureacad.service.
"""
import multiprocessing

bind = "127.0.0.1:8000"

# 1 GB RAM: (2 x cores) + 1 is the usual formula, but cap it so the box keeps
# headroom for nginx and the OS. Each worker is ~40-60 MB for this app.
workers = min(multiprocessing.cpu_count() * 2 + 1, 4)
worker_class = "sync"
threads = 2

timeout = 30
graceful_timeout = 30
keepalive = 5

# Recycle workers periodically to bound any slow leak.
max_requests = 1000
max_requests_jitter = 100

# Log to stdout/stderr so journalctl owns the logs.
accesslog = "-"
errorlog = "-"
loglevel = "info"
# nginx sets X-Forwarded-For; log the real client rather than 127.0.0.1.
access_log_format = '%({x-forwarded-for}i)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)sus'

proc_name = "futureacad"
