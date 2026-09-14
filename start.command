#!/bin/bash
# Double-click to start TodoCanva and open it in the browser.
cd "$(dirname "$0")"
PORT=${PORT:-8790}
if lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "TodoCanva already running on port $PORT"
else
  nohup node server.js > data/server.log 2>&1 &
  sleep 1
fi
# Open the file, not http://localhost:$PORT — that origin is not this app.
open "file://$(pwd)/index.html"
