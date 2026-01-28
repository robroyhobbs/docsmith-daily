#!/bin/bash

# DocSmith Automation - Uninstall Script
# Removes the launchd scheduler

set -e

PLIST_NAME="io.docsmith.automation.plist"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME"

echo "DocSmith Automation Uninstaller"
echo "================================"
echo ""

# Check if installed
if [ ! -f "$PLIST_PATH" ]; then
    echo "Scheduler is not installed."
    exit 0
fi

# Unload the job
echo "Unloading launchd job..."
launchctl unload "$PLIST_PATH" 2>/dev/null || true

# Remove plist
echo "Removing plist..."
rm -f "$PLIST_PATH"

# Verify
echo ""
if launchctl list | grep -q "io.docsmith.automation"; then
    echo "Warning: Job may still be loaded."
else
    echo "Uninstallation complete!"
fi

echo ""
echo "Note: Configuration files and logs have been preserved."
echo "To completely remove, delete ~/docsmith-automation/"
