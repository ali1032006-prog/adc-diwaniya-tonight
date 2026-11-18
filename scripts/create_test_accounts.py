#!/usr/bin/env python3
"""Create the four review test accounts on diwaniyatna-dev (Ali's ruling on Agent Issue 52, ADC-LOG-775).

  python3 scripts/create_test_accounts.py --check     key names present? (prints names and lengths only)
  python3 scripts/create_test_accounts.py --create    create/refresh the 4 accounts, profiles (18+, Terms), admins
  python3 scripts/create_test_accounts.py --email-on  switch the dev project's email provider on (confirm email
                                                      stays ON, ADC-LOG-802) and probe a wrong password
  python3 scripts/create_test_accounts.py --verify    per account: email confirmed? public password sign-in works?
                                                      (the same /token call the app's sign-in form makes, with the
                                                      publishable key; the session is signed out at once). Prints
                                                      labels and booleans only (Ali's change list 5, ADC-LOG-806).

DEV ONLY: refuses any project ref other than DIWANIYA_TONIGHT_DEV_SUPABASE_REF. Passwords are Ali's: they are
read from the env file named by SUPABASE_ENV_FILE under the key names below and never printed, logged or sent.
The admin (secret) key is fetched from the Management API into memory for this run only.
"""
import json
import os
import sys
import urllib.error
import urllib.request

ACCOUNTS = [
    # label, email (also in private.test_accounts), display name, admin, password key
    ("jayce-user", "jayce.user.test@example.com", "Jayce (test user)", False, "DIWANIYA_TEST_JAYCE_USER_PASSWORD"),
    ("jayce-admin", "jayce.admin.test@example.com", "Jayce (test admin)", True, "DIWANIYA_TEST_JAYCE_ADMIN_PASSWORD"),
    ("vi-user", "vi.user.test@example.com", "Vi (test user)", False, "DIWANIYA_TEST_VI_USER_PASSWORD"),
    ("vi-admin", "vi.admin.test@example.com", "Vi (test admin)", True, "DIWANIYA_TEST_VI_ADMIN_PASSWORD"),
]
AREA = "شرق"  # Sharq, Capital governorate (src/lib/areas.ts)
BIRTH = "1990-01-01"  # 18+ (ruling B)
MIN_PASSWORD = 16


def env():
    path = os.environ.get("SUPABASE_ENV_FILE")
    if not path or not os.path.exists(path):
        sys.exit("set SUPABASE_ENV_FILE to the profile .env")
    vals = {}
    for line in open(path, encoding="utf-8"):
        key, sep, value = line.rstrip("\n").partition("=")
        if sep:
            vals[key.strip()] = value
    return vals


E = env()
REF = E.get("DIWANIYA_TONIGHT_DEV_SUPABASE_REF", "")
URL = E.get("DIWANIYA_TONIGHT_DEV_SUPABASE_URL", "").rstrip("/")
TOKEN = E.get("SUPABASE_ACCESS_TOKEN", "")
if REF != "rwddsgrgwqsdsmzyfzea" or URL != "https://" + REF + ".supabase.co":
    sys.exit("refusing: this script runs on diwaniyatna-dev only")


def http(method, url, headers, body=None):
    data = None if body is None else json.dumps(body).encode()
    h = {"Content-Type": "application/json", "User-Agent": "adc-diwaniya-test-accounts", **headers}
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        # Fixed https hosts (api.supabase.com and the dev project URL checked above).
        with urllib.request.urlopen(req, timeout=60) as r:  # nosemgrep: python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except ValueError:
            return e.code, {"raw": raw[:300]}


def mgmt(method, path, body=None):
    return http(method, "https://api.supabase.com/v1/projects/" + REF + path, {"Authorization": "Bearer " + TOKEN}, body)


def sql(query):
    code, out = mgmt("POST", "/database/query", {"query": query})
    if code >= 300:
        sys.exit("SQL failed: " + json.dumps(out)[:500])
    return out


def lit(s):
    return "'" + str(s).replace("'", "''") + "'"


def check():
    ok = True
    for label, _, _, _, key in ACCOUNTS:
        n = len(E.get(key, ""))
        state = "missing" if n == 0 else ("too short" if n < MIN_PASSWORD else "ok")
        ok = ok and state == "ok"
        print(f"{key}: {state} (length {n})")
    return ok


def admin_key():
    code, keys = mgmt("GET", "/api-keys?reveal=true")
    if code != 200:
        sys.exit(f"could not read the project's API keys ({code})")
    for k in keys:
        if k.get("name") == "service_role" and k.get("api_key"):
            return k["api_key"]
    for k in keys:
        if k.get("type") == "secret" and k.get("api_key"):
            return k["api_key"]
    sys.exit("no service_role / secret key found")


def create():
    if not check():
        sys.exit("passwords not all in place: nothing created")
    key = admin_key()
    auth = {"apikey": key, "Authorization": "Bearer " + key}
    existing = {}
    code, page = http("GET", URL + "/auth/v1/admin/users?per_page=200", auth)
    if code != 200:
        sys.exit(f"admin list failed ({code})")
    for u in page.get("users", []):
        existing[(u.get("email") or "").lower()] = u["id"]
    for label, email, name, admin, pkey in ACCOUNTS:
        meta = {"test_account": True, "label": label, "note": "ADC review test account, dev only (ADC-LOG-775)"}
        if email in existing:
            uid = existing[email]
            code, out = http("PUT", URL + "/auth/v1/admin/users/" + uid, auth,
                             {"password": E[pkey], "email_confirm": True, "user_metadata": meta})
            verb = "refreshed"
        else:
            code, out = http("POST", URL + "/auth/v1/admin/users", auth,
                             {"email": email, "password": E[pkey], "email_confirm": True, "user_metadata": meta})
            uid = (out or {}).get("id")
            verb = "created"
        if code >= 300 or not uid:
            sys.exit(f"{label}: admin API {code} {(out or {}).get('msg') or (out or {}).get('message') or ''}"[:300])
        sql("begin; select set_config('request.jwt.claims', json_build_object('sub', " + lit(uid)
            + "::uuid, 'role', 'authenticated')::text, true); set local role authenticated; select public.complete_profile("
            + lit(name) + ", " + lit(AREA) + ", " + lit(BIRTH) + "::date, true); commit;")
        if admin:
            sql("insert into private.admins (user_id) values (" + lit(uid) + "::uuid) on conflict do nothing;")
        else:
            sql("delete from private.admins where user_id = " + lit(uid) + "::uuid;")
        print(f"{label}: {verb} {email} id={uid} profile=done admin={'yes' if admin else 'no'}")
    rows = sql("select t.label, p.display_name, pp.terms_accepted_at is not null as terms, "
               "date_part('year', age(pp.birth_date)) >= 18 as adult, exists (select 1 from private.admins a "
               "where a.user_id = u.id) as admin from private.test_accounts t join auth.users u on lower(u.email) = t.email "
               "left join public.profiles p on p.id = u.id left join public.profile_private pp on pp.user_id = u.id order by t.label;")
    print(json.dumps(rows, ensure_ascii=False))


def email_on():
    code, out = mgmt("PATCH", "/config/auth", {"external_email_enabled": True, "mailer_autoconfirm": False})
    if code >= 300:
        sys.exit(f"auth config update failed ({code})")
    code, cfg = mgmt("GET", "/config/auth")
    print("email provider on:", cfg.get("external_email_enabled"), "| google on:", cfg.get("external_google_enabled"),
          "| disable_signup:", cfg.get("disable_signup"))
    pub = E.get("DIWANIYA_TONIGHT_DEV_SUPABASE_PUBLISHABLE_KEY", "")
    h = {"apikey": pub}
    # No public sign-up probe any more: since Ali's ruling ADC-LOG-802 email sign-up is public and every
    # probe would spend one of the free mailer's ~2 emails an hour on a dead address.
    code, out = http("POST", URL + "/auth/v1/token?grant_type=password", h,
                     {"email": "vi.user.test@example.com", "password": "wrong-" + "y" * 20})
    print("wrong-password probe:", code, (out or {}).get("error_code") or (out or {}).get("msg"))


def verify():
    rows = sql("select t.label, u.email_confirmed_at is not null as confirmed, u.banned_until is null as not_banned "
               "from private.test_accounts t join auth.users u on lower(u.email) = t.email order by t.label;")
    by = {r["label"]: r for r in rows}
    pub = E.get("DIWANIYA_TONIGHT_DEV_SUPABASE_PUBLISHABLE_KEY", "")
    ok = True
    for label, email, _, admin, pkey in ACCOUNTS:
        r = by.get(label, {})
        code, out = http("POST", URL + "/auth/v1/token?grant_type=password", {"apikey": pub},
                         {"email": email, "password": E.get(pkey, "")})
        token = (out or {}).get("access_token") if code == 200 else None
        signed_in = bool(token)
        if token:
            http("POST", URL + "/auth/v1/logout?scope=local", {"apikey": pub, "Authorization": "Bearer " + token})
        line_ok = bool(r.get("confirmed")) and bool(r.get("not_banned")) and signed_in
        ok = ok and line_ok
        print(f"{label}: on_allow_list={bool(r)} email_confirmed={bool(r.get('confirmed'))} "
              f"public_password_sign_in={signed_in} (HTTP {code}) admin={'yes' if admin else 'no'}")
    return ok


if __name__ == "__main__":
    cmd = sys.argv[1:2]
    if cmd == ["--check"]:
        sys.exit(0 if check() else 1)
    if cmd == ["--create"]:
        create()
    elif cmd == ["--email-on"]:
        email_on()
    elif cmd == ["--verify"]:
        sys.exit(0 if verify() else 1)
    else:
        sys.exit(__doc__)
