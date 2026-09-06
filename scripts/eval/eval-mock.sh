#!/usr/bin/env bash
set -euo pipefail
export GENERATION_MODE="${GENERATION_MODE:-mock}"
export EVAL_BASE_URL="${EVAL_BASE_URL:-http://127.0.0.1:3000}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
node "$ROOT/scripts/eval/run-eval.mjs"
