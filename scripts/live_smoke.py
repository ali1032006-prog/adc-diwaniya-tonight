#!/usr/bin/env python3
"""Live smoke of src/lib/api.ts against the dev project.

Creates two throwaway email+password accounts (smoke-*@example.invalid) through the
Management API, runs src/live.smoke.ts with vitest, then deletes both accounts (their
rows go with them by ON DELETE CASCADE). Prints no secrets.

  SUPABASE_ENV_FILE=~/.hermes/profiles/heimerdinger/.env python3 scripts/live_smoke.py
"""
import os
import secrets
import subprocess
import sys

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


def cleanup():
    sql_test.call("database/query", {"query": "delete from auth.users where email like 'smoke-%@example.invalid';"})


status = 1
try:
    sql_test.call("database/query", {"query": create(host) + create(guest)})
    env = dict(os.environ, SMOKE_PASSWORD=password, SMOKE_HOST_EMAIL=host, SMOKE_GUEST_EMAIL=guest)
    for line in open(os.path.join(os.path.dirname(__file__), "..", ".env.local"), encoding="utf-8"):
        k, _, v = line.strip().partition("=")
        if k.startswith("VITE_"):
            env[k] = v
    status = subprocess.call(["npx", "vitest", "run", "--config", "vitest.live.config.ts"], env=env)
finally:
    cleanup()
    left = sql_test.call("database/query", {"query": "select count(*) as n from auth.users where email like 'smoke-%@example.invalid';"})
    print("smoke accounts left:", left)
sys.exit(status)
