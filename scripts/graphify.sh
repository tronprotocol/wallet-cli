#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
graphify_python="$repo_root/graphify-out/.venv/bin/python"
graphify_cli="$repo_root/graphify-out/.venv/bin/graphify"
export GRAPHIFY_BACKEND=none

case "${1:-help}" in
  setup)
    if [[ ! -x "$graphify_python" ]]; then
      uv venv --python 3.13 graphify-out/.venv
    fi
    uv pip install --python "$graphify_python" 'graphifyy==0.9.97'
    ;;
  refresh)
    if [[ ! -x "$graphify_cli" ]]; then
      echo 'Run bash scripts/graphify.sh setup first.' >&2
      exit 1
    fi
    "$graphify_cli" extract . --code-only --max-workers 4
    "$graphify_cli" cluster-only .
    "$graphify_cli" tree --root . --label wallet-cli
    ;;
  help|--help|-h)
    echo 'Usage: bash scripts/graphify.sh setup|refresh|<graphify command> [args...]'
    echo 'Examples: query "MessageSigner" --budget 1200; explain "TronGridHistoryReader"'
    ;;
  *)
    if [[ ! -x "$graphify_cli" ]]; then
      echo 'Run bash scripts/graphify.sh setup first.' >&2
      exit 1
    fi
    exec "$graphify_cli" "$@"
    ;;
esac
