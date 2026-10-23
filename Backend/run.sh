#!/usr/bin/env zsh
# run.sh — Always launch DevGraph backend with the project virtualenv.
#
# WHY THIS EXISTS:
#   Running `uvicorn main:app --reload` from the system/conda PATH picks up
#   the Anaconda Python, which lacks project-specific packages (tree_sitter etc).
#   The SpawnProcess worker crashes immediately with ModuleNotFoundError and
#   becomes a <defunct> zombie. The reloader holds the socket open, so TCP
#   connections are accepted but never answered — all requests hang forever.
#
# CORRECT WAY:  always use .venv/bin/uvicorn
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV="$SCRIPT_DIR/.venv"

if [ ! -f "$VENV/bin/uvicorn" ]; then
  echo "ERROR: .venv not found at $VENV"
  echo "Run: python -m venv .venv && .venv/bin/pip install -r requirements.txt"
  exit 1
fi

cd "$SCRIPT_DIR"
echo "Starting DevGraph backend with $VENV/bin/python ..."
exec "$VENV/bin/uvicorn" main:app --reload --port 8000 --log-level info "$@"
