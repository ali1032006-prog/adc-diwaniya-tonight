#!/usr/bin/env python3
"""Run SQL files against the Supabase project through the Management API.

  scripts/sql_test.py                  run every supabase/tests/*.sql (each rolls back)
  scripts/sql_test.py FILE...          run only those files
  scripts/sql_test.py --migrate FILE   apply FILE as a named migration

Needs SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF in the environment, or
reads them (never prints them) from the env file named by SUPABASE_ENV_FILE.
"""
import glob
import json
import os
import re
import sys
import urllib.error
import urllib.request


def setting(name, alt=None):
    if os.environ.get(name):
        return os.environ[name]
    path = os.environ.get("SUPABASE_ENV_FILE")
    if path and os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            key, _, value = line.strip().partition("=")
            if key in (name, alt) and value:
                return value
    sys.exit(f"set {name}")


TOKEN = setting("SUPABASE_ACCESS_TOKEN")
REF = setting("SUPABASE_PROJECT_REF", "DIWANIYA_TONIGHT_DEV_SUPABASE_REF")
if not re.fullmatch(r"[a-z0-9]{20}", REF):
    sys.exit("SUPABASE_PROJECT_REF must be a 20-character project ref")
API = "https://api.supabase.com/v1/projects/" + REF + "/"


def call(path, payload):
    req = urllib.request.Request(
        API + path,
        data=json.dumps(payload).encode(),
        headers={"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json",
                 "User-Agent": "adc-game-night-hub-tests"},
        method="POST")
    # Fixed https host; REF is checked above and path is one of two literals.
    return urllib.request.urlopen(req, timeout=120).read().decode()  # nosemgrep: python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected


def main(argv):
    if argv[:1] == ["--migrate"]:
        path = argv[1]
        name = os.path.basename(path).split("_", 1)[1].rsplit(".", 1)[0]
        try:
            print("APPLIED", path, call("database/migrations", {"query": open(path).read(), "name": name})[:200])
        except urllib.error.HTTPError as e:
            print("FAILED", path, e.code, e.read().decode()[:2000])
            return 1
        return 0
    files = argv or sorted(glob.glob("supabase/tests/*.sql"))
    failed = 0
    for path in files:
        try:
            print(f"PASS {path}: {call('database/query', {'query': open(path).read()})[:160]}")
        except urllib.error.HTTPError as e:
            failed += 1
            print(f"FAIL {path}: {e.code} {e.read().decode()[:2000]}")
    if failed:
        print(f"SQL TESTS FAILED: {failed} of {len(files)} files")
        return 1
    print(f"SQL TESTS PASSED: {len(files)} files")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
