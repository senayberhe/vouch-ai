#!/usr/bin/env bash
# Local development: configuration stays in the root .env, never in frontend bundles.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi
exec uv run python scripts/dev.py "$@"
