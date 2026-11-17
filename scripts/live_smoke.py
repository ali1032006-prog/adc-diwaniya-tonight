#!/usr/bin/env python3
"""Live smoke of src/lib/api.ts against the dev project.

Opens the email provider for the run (the app itself is Google-only), creates two throwaway email+password accounts (smoke-*@example.invalid) through the
Management API, runs src/live.smoke.ts with vitest, then deletes both accounts (their
rows go with them by ON DELETE CASCADE). Prints no secrets.

  SUPABASE_ENV_FILE=~/.hermes/profiles/heimerdinger/.env python3 scripts/live_smoke.py
"""
import json
import os
import secrets
import subprocess
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))
import sql_test  # noqa: E402  (reuses its token handling and query call)

run_id = secrets.token_hex(4)
password = secrets.token_urlsafe(24)
host = f"smoke-host-{run_id}@example.invalid"
guest = f"smoke-guest-{run_id}@example.invalid"


def create(email):
    return f"""
with u as (
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    '{email}', extensions.crypt('{password}', extensions.gen_salt('bf')), now(),
    '{{"provider":"email","providers":["email"]}}', '{{}}', now(), now(), '', '', '', '')
  returning id)
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, json_build_object('sub', u.id::text, 'email', '{email}'), 'email', now(), now(), now()
from u;
"""


def email_provider(on):
    """The app is Google-only (ruling A), so the email provider is closed on dev. The smoke run
    opens it for its own password logins and closes it again in `finally`. Sign-ups made in that
    window stay unconfirmed (confirm email is on and the mailer reaches only the team), so they
    cannot sign in."""
    req = urllib.request.Request(
        sql_test.API + "config/auth", data=json.dumps({"external_email_enabled": on}).encode(),
        headers={"Authorization": "Bearer " + sql_test.TOKEN, "Content-Type": "application/json",
                 "User-Agent": "adc-diwaniya-tonight-tests"},
        method="PATCH")
    # Fixed https host; the ref is checked in sql_test and the path is a literal.
    cfg = json.loads(urllib.request.urlopen(req, timeout=60).read().decode())  # nosemgrep: python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected
    print("email provider enabled:", cfg.get("external_email_enabled"))
    # Auth picks the change up a little later: wait until its public settings agree.
    url, key = vite("VITE_SUPABASE_URL"), vite("VITE_SUPABASE_PUBLISHABLE_KEY")
    if not url.startswith("https://") or not url.endswith(".supabase.co"):
        sys.exit("VITE_SUPABASE_URL must be the project's https://<ref>.supabase.co address")
    live = None
    for _ in range(40):
        s = urllib.request.Request(url + "/auth/v1/settings", headers={"apikey": key})
        live = json.loads(urllib.request.urlopen(s, timeout=30).read().decode())["external"]["email"]  # nosemgrep: python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected
        if live is on:
            print("auth settings agree after the change")
            return
        time.sleep(3)
    print("WARNING: auth settings still show email =", live)


def vite(name):
    for line in open(os.path.join(os.path.dirname(__file__), "..", ".env.local"), encoding="utf-8"):
        k, _, v = line.strip().partition("=")
        if k == name:
            return v
    sys.exit(f"{name} missing from .env.local")


def cleanup():
    sql_test.call("database/query", {"query": "delete from auth.users where email like 'smoke-%@example.invalid';"})


status = 1
try:
    email_provider(True)
    sql_test.call("database/query", {"query": create(host) + create(guest)})
    env = dict(os.environ, SMOKE_PASSWORD=password, SMOKE_HOST_EMAIL=host, SMOKE_GUEST_EMAIL=guest)
    for line in open(os.path.join(os.path.dirname(__file__), "..", ".env.local"), encoding="utf-8"):
        k, _, v = line.strip().partition("=")
        if k.startswith("VITE_"):
            env[k] = v
    status = subprocess.call(["npx", "vitest", "run", "--config", "vitest.live.config.ts"], env=env)
finally:
    try:
        email_provider(False)
    finally:
        cleanup()
        left = sql_test.call("database/query", {"query": "select count(*) as n from auth.users where email like 'smoke-%@example.invalid';"})
        print("smoke accounts left:", left)
sys.exit(status)
