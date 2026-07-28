#!/usr/bin/env bash
# One-command backend startup with real preflight diagnostics.
# The web app works WITHOUT this — it only makes scans faster.

set -euo pipefail
cd "$(dirname "$0")"

RED=$'\033[0;31m'; GRN=$'\033[0;32m'; YLW=$'\033[0;33m'; NC=$'\033[0m'
say()  { printf '%s\n' "$*"; }
ok()   { printf '%s✓%s %s\n' "$GRN" "$NC" "$*"; }
warn() { printf '%s!%s %s\n' "$YLW" "$NC" "$*"; }
die()  { printf '%s✗%s %s\n' "$RED" "$NC" "$*" >&2; exit 1; }

say "── డిజిటల్ సమతుల్యత · OCR backend ──"

# 1 · Python
command -v python3 >/dev/null 2>&1 || die "python3 not found. Install Python 3.9+."
PYV=$(python3 -c 'import sys; print("%d.%d" % sys.version_info[:2])')
python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3,9) else 1)' \
  || die "Python $PYV is too old. Need 3.9+."
ok "Python $PYV"

# 2 · Tesseract
if command -v tesseract >/dev/null 2>&1; then
  ok "Tesseract $(tesseract --version 2>&1 | head -n1 | awk '{print $2}')"
else
  warn "Tesseract not found on PATH."
  case "$(uname -s)" in
    Darwin) say "    brew install tesseract" ;;
    Linux)  say "    sudo apt install tesseract-ocr" ;;
    *)      say "    https://github.com/UB-Mannheim/tesseract/wiki" ;;
  esac
  say "    (The browser engine will keep working meanwhile.)"
fi

# 3 · venv + deps
if [ ! -d .venv ]; then
  say "Creating virtualenv…"
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
python -m pip install --quiet --upgrade pip
python -m pip install --quiet -r requirements.txt
ok "Dependencies installed"

# 4 · Port availability
PORT="${PORT:-8000}"
if command -v lsof >/dev/null 2>&1 && lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  die "Port $PORT is already in use. Try: PORT=8001 ./start.sh"
fi
ok "Port $PORT free"

say ""
say "Serving on http://127.0.0.1:$PORT"
say "Health check: curl http://127.0.0.1:$PORT/api/health"
say ""

exec python app.py
