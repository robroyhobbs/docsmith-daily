#!/bin/bash

# DocSmith Automation - Install Script
# Installs the launchd scheduler for daily automation

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
PLIST_NAME="io.docsmith.automation.plist"
PLIST_SRC="$ROOT_DIR/launchd/$PLIST_NAME"
PLIST_DST="$HOME/Library/LaunchAgents/$PLIST_NAME"

echo "DocSmith Automation Installer"
echo "=============================="
echo ""

# Check if plist source exists
if [ ! -f "$PLIST_SRC" ]; then
    echo "Error: Plist file not found at $PLIST_SRC"
    exit 1
fi

# Create LaunchAgents directory if needed
mkdir -p "$HOME/Library/LaunchAgents"

# Unload existing job if present
if launchctl list | grep -q "io.docsmith.automation"; then
    echo "Unloading existing job..."
    launchctl unload "$PLIST_DST" 2>/dev/null || true
fi

# Copy plist to LaunchAgents
echo "Installing plist to $PLIST_DST..."
cp "$PLIST_SRC" "$PLIST_DST"

# Ensure log directory exists
mkdir -p "$ROOT_DIR/logs"

# Load the job
echo "Loading launchd job..."
launchctl load "$PLIST_DST"

# Verify
echo ""
if launchctl list | grep -q "io.docsmith.automation"; then
    echo "Installation successful!"
    echo ""
    echo "The automation will run daily at 9:00 AM."
    echo ""
    echo "Useful commands:"
    echo "  - View status:    launchctl list | grep docsmith"
    echo "  - Run manually:   launchctl start io.docsmith.automation"
    echo "  - View logs:      tail -f $ROOT_DIR/logs/launchd-stdout.log"
    echo "  - Uninstall:      $ROOT_DIR/scripts/uninstall.sh"
    echo ""
else
    echo "Warning: Job may not have loaded correctly."
    echo "Check: launchctl list | grep docsmith"
fi
