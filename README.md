# DocSmith Daily Automation

Automated daily documentation generation for trending GitHub repositories using Claude Code CLI and DocSmith skills.

## Overview

This automation:
1. Fetches trending GitHub repositories daily from OSS Insight API
2. Filters out already-processed and excluded repos
3. Clones selected repositories
4. Generates comprehensive documentation in Chinese (source language)
5. Translates to English and Japanese
6. Publishes to DocSmith Cloud (https://docsmith.aigne.io)
7. Commits changes and cleans up

## Features

- **Daily Scheduling**: Runs automatically at 9 AM via macOS launchd
- **Real-time Dashboard**: Terminal-based monitoring with blessed/blessed-contrib
- **Smart Filtering**: Excludes showcase projects and already-processed repos
- **Multi-language**: Generates docs in zh, en, ja
- **Retry Logic**: Automatic retries with exponential backoff
- **Progress Tracking**: Real-time output capture with stream-json

## Installation

### Prerequisites

- Node.js 20+
- Claude Code CLI installed and authenticated (`~/.local/bin/claude`)
- DocSmith skills installed in `~/.claude/skills/`

### Setup

```bash
# Clone the repository
git clone git@github.com:robroyhobbs/docsmith-daily.git
cd docsmith-daily

# Install dependencies
npm install

# Install the daily scheduler (launchd)
npm run install-scheduler

# Or manually load the launchd agent
cp launchd/io.docsmith.automation.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/io.docsmith.automation.plist
```

## Usage

### Manual Run

```bash
# Run the automation manually
npm run start

# View the real-time dashboard
npm run dashboard
```

### Monitoring

```bash
# Check if scheduler is loaded
launchctl list | grep docsmith

# View logs
tail -f logs/automation.log

# Check current state
cat data/state.json
```

### Scheduler Control

```bash
# Unload scheduler
launchctl unload ~/Library/LaunchAgents/io.docsmith.automation.plist

# Reload scheduler
launchctl load ~/Library/LaunchAgents/io.docsmith.automation.plist
```

## Configuration

### settings.yaml

```yaml
processing:
  dailyLimit: 3           # Max repos per day
  minStars: 100           # Minimum stars for selection
  preferredLanguages:     # Priority languages
    - TypeScript
    - JavaScript
    - Python

scheduler:
  enabled: true
  runHour: 9              # 9 AM
  runMinute: 0
```

### exclusions.json

Add patterns to exclude specific projects (e.g., your own showcase projects):

```json
{
  "showcaseProjects": [
    { "name": "DocSmith", "pattern": "doc-?smith", "type": "regex" }
  ],
  "processedRepos": ["owner/repo"]
}
```

## Architecture

```
docsmith-automation/
├── src/
│   ├── index.mjs              # Main orchestrator
│   ├── cli.mjs                # Manual CLI interface
│   ├── components/
│   │   ├── docsmith-runner.mjs    # Claude CLI execution
│   │   ├── trending-fetcher.mjs   # OSS Insight API client
│   │   ├── repo-cloner.mjs        # Git clone/cleanup
│   │   └── exclusion-manager.mjs  # Repo filtering
│   ├── dashboard/
│   │   └── index.mjs          # Terminal dashboard
│   └── utils/
│       ├── logger.mjs         # Winston logging
│       └── state.mjs          # State management
├── config/
│   ├── settings.yaml          # Main configuration
│   └── exclusions.json        # Exclusion patterns
├── data/                      # Runtime data (gitignored)
├── logs/                      # Log files (gitignored)
├── workspace/                 # Cloned repos (gitignored)
└── launchd/
    └── io.docsmith.automation.plist  # macOS scheduler
```

## How It Works

The automation uses Claude Code CLI with `--verbose --output-format stream-json` to:
- Capture real-time progress during documentation generation
- Parse tool calls and assistant messages
- Detect published URLs
- Handle long-running tasks (45-minute timeout)

Key CLI invocation:
```bash
claude --dangerously-skip-permissions -p --verbose --output-format stream-json "<prompt>"
```

## License

MIT
