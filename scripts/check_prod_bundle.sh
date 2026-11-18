#!/bin/sh
# Production-bundle gate for the preview-only test-account sign-in (ADC-LOG-775, Agent Issue 52).
# Runs at the end of `npm run build`. Fails if anything from src/preview/TestSignIn.tsx reached dist/.
# (supabase-js itself contains the word signInWithPassword, so the check looks for our own markers.)
set -u
DIST="${1:-dist}"
if [ ! -d "$DIST/assets" ]; then
  echo "check_prod_bundle: $DIST/assets missing, build first" >&2
  exit 2
fi
found=0
for marker in 'dt-preview-test-signin' 'Test accounts (preview builds only)' 'Sign in with test account' 'current-password'; do
  if grep -r -l -F -- "$marker" "$DIST" >/dev/null 2>&1; then
    echo "check_prod_bundle: FAIL, production bundle contains: $marker" >&2
    grep -r -l -F -- "$marker" "$DIST" >&2
    found=1
  fi
done
if ls "$DIST"/assets/ | grep -i -q 'testsignin'; then
  echo "check_prod_bundle: FAIL, a TestSignIn chunk was emitted" >&2
  found=1
fi
if [ "$found" -ne 0 ]; then
  exit 1
fi
echo "check_prod_bundle: OK, no preview test sign-in in $DIST ($(ls "$DIST"/assets | wc -l) asset files checked)"
