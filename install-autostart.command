#!/bin/bash
# Registers Calendar for Real ADHD as a macOS Launch Agent so the backend starts at login
# and is restarted automatically if it ever crashes.
cd "$(dirname "$0")"
DIR="$(pwd)"
NODE="$(command -v node)"
PLIST="$HOME/Library/LaunchAgents/com.hyperfocusam.calendar-for-real-adhd.plist"
mkdir -p "$HOME/Library/LaunchAgents" data
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.hyperfocusam.calendar-for-real-adhd</string>
  <key>ProgramArguments</key>
  <array><string>$NODE</string><string>$DIR/server.js</string></array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>EnvironmentVariables</key><dict><key>PORT</key><string>8790</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$DIR/data/server.log</string>
  <key>StandardErrorPath</key><string>$DIR/data/server.log</string>
</dict>
</plist>
PL
launchctl bootout "gui/$(id -u)/com.hyperfocusam.calendar-for-real-adhd" 2>/dev/null
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Installed. Calendar for Real ADHD will now run at http://localhost:8790 whenever you are logged in."
echo "To remove: launchctl bootout gui/$(id -u)/com.hyperfocusam.calendar-for-real-adhd && rm \"$PLIST\""
