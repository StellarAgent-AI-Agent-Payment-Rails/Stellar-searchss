#!/usr/bin/env bash
# Copyright (c) 2026 StellarSearch contributors
#
# Production boot smoke test (#140).
#
# `npm run build` passing does not mean the built app works. A missing runtime
# dependency — such as the `sonner` breakage this repo actually had — passes
# typecheck and build, then throws at runtime. This script closes that gap by
# actually booting what we just built and asserting it responds.
#
# Two independent surfaces are checked:
#
#   1. The built frontend, served with `vite preview` — the page must render
#      and reference the emitted asset bundle.
#   2. The API server, started with `tsx` — /health must answer 200.
#
# It is intended to run against a clean install (`npm ci`) so a stale
# node_modules cannot mask a genuinely missing dependency.
#
# Usage:
#   scripts/smoke-test.sh                 # build then check both surfaces
#   SMOKE_SKIP_BUILD=1 scripts/smoke-test.sh
#
# Exits non-zero if the build fails, if either surface does not come up, or if
# any request logs an uncaught server error.

set -Eeuo pipefail

cd "$(dirname "$0")/.."

# Keep every child on ports outside the range a developer's dev server may hold,
# so a locally running instance cannot make CI pass or fail spuriously.
SMOKE_PREVIEW_PORT="${SMOKE_PREVIEW_PORT:-4173}"
SMOKE_API_PORT="${SMOKE_API_PORT="${PORT:-3987}"}"
SMOKE_TIMEOUT="${SMOKE_TIMEOUT:-90}"

log()  { printf '\033[36m[smoke]\033[0m %s\n' "$*"; }
fail() { printf '\033[31m[smoke] FAIL:\033[0m %s\n' "$*" >&2; exit 1; }

# `vite preview` binds to whichever loopback the host resolves first, which is
# often IPv6 ::1 only. Probe both so the check works on either.
HOST_CANDIDATES=("127.0.0.1" "[::1]" "localhost")

# GET a URL, trying each loopback address until one answers.
# Sets SMOKE_URL to the address that worked.
probe() {
  local path="$1" host
  for host in "${HOST_CANDIDATES[@]}"; do
    if curl -fsS --max-time 5 "http://${host}:${2}${path}" -o "$3" 2>/dev/null; then
      SMOKE_URL="http://${host}:${2}"
      return 0
    fi
  done
  return 1
}

pids=()
cleanup() {
  for pid in "${pids[@]:-}"; do
    [[ -n "${pid}" ]] && kill "${pid}" 2>/dev/null || true
  done
  # Give children a moment to release their ports before we return.
  wait 2>/dev/null || true
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# 1. Build
# ---------------------------------------------------------------------------
if [[ "${SMOKE_SKIP_BUILD:-0}" != "1" ]]; then
  log "building production bundle"
  npm run build || fail "production build failed"
else
  log "skipping build (SMOKE_SKIP_BUILD=1)"
fi

[[ -f dist/index.html ]] || fail "dist/index.html missing — the build produced no page to serve"

# ---------------------------------------------------------------------------
# 2. Boot the built frontend and assert the page renders
# ---------------------------------------------------------------------------
log "serving dist/ with vite preview on :${SMOKE_PREVIEW_PORT}"
npm run preview -- --port "${SMOKE_PREVIEW_PORT}" --strictPort >/tmp/smoke-preview.log 2>&1 &
pids+=($!)

preview_ready=0
for _ in $(seq 1 "${SMOKE_TIMEOUT}"); do
  if probe "/" "${SMOKE_PREVIEW_PORT}" /tmp/smoke-index.html; then
    preview_ready=1
    break
  fi
  sleep 1
done
[[ "${preview_ready}" -eq 1 ]] || { cat /tmp/smoke-preview.log >&2; fail "preview server never answered on :${SMOKE_PREVIEW_PORT}"; }

# The served HTML must actually reference the emitted bundle. A 200 that serves
# an empty shell is precisely the "builds but cannot boot" failure we are
# guarding against, so assert on content and not just the status code.
grep -q '<div id="root">' /tmp/smoke-index.html \
  || fail "served index.html has no #root mount node"
grep -qE '<script[^>]+src="/assets/[^"]+\.js"' /tmp/smoke-index.html \
  || fail "served index.html references no built JS bundle"

asset=$(grep -oE '/assets/[^"]+\.js' /tmp/smoke-index.html | head -1)
log "page rendered; fetching bundle ${asset}"
probe "${asset}" "${SMOKE_PREVIEW_PORT}" /tmp/smoke-bundle.js \
  || fail "built bundle ${asset} could not be fetched"
[[ -s /tmp/smoke-bundle.js ]] || fail "built bundle ${asset} is empty"
log "frontend OK"

# ---------------------------------------------------------------------------
# 3. Boot the API server and assert /health responds
# ---------------------------------------------------------------------------
# The server constructs a Groq client at import time and throws when the key is
# absent, so a boot check needs *a* key present. /health never calls Groq, so a
# placeholder is enough and keeps real credentials out of CI logs.
log "starting API server on :${SMOKE_API_PORT}"
PORT="${SMOKE_API_PORT}" \
  GROQ_API_KEY="${GROQ_API_KEY:-smoke-test-placeholder}" \
  SERPER_API_KEY="${SERPER_API_KEY:-smoke-test-placeholder}" \
  npm run server >/tmp/smoke-server.log 2>&1 &
pids+=($!)

health_ok=0
for _ in $(seq 1 "${SMOKE_TIMEOUT}"); do
  if probe "/health" "${SMOKE_API_PORT}" /tmp/smoke-health.json; then
    health_ok=1
    break
  fi
  sleep 1
done
if [[ "${health_ok}" -ne 1 ]]; then
  cat /tmp/smoke-server.log >&2
  fail "API server /health never answered on :${SMOKE_API_PORT}"
fi

# /health must report a healthy status, not merely return 200.
node -e '
  const body = require("/tmp/smoke-health.json");
  if (body.status !== "ok") {
    console.error("unexpected /health payload:", JSON.stringify(body));
    process.exit(1);
  }
' || fail "/health did not report status=ok"
log "API /health OK"

# A server that logged an uncaught exception after answering is not healthy.
if grep -qE '^\s*(Uncaught|Error:|FATAL)' /tmp/smoke-server.log; then
  cat /tmp/smoke-server.log >&2
  fail "API server logged an uncaught error"
fi

log "all smoke checks passed"
