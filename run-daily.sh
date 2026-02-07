#!/bin/bash
# DocSmith Daily - Automated 4-session pipeline
# Usage: ./run-daily.sh [repo-name]
# If repo-name is provided, resumes that task. Otherwise runs discovery first.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
INTENT_DIR="$PROJECT_ROOT/intent"
WORKSPACE_DIR="$PROJECT_ROOT/workspace"
DATE=$(date +%Y-%m-%d)

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[docsmith-daily]${NC} $1"; }
warn() { echo -e "${YELLOW}[docsmith-daily]${NC} $1"; }
err() { echo -e "${RED}[docsmith-daily]${NC} $1"; }

# Find the task directory
find_task_dir() {
  if [ -n "${1:-}" ]; then
    # Resume specific repo
    local match
    match=$(ls -d "$INTENT_DIR"/*-"$1" 2>/dev/null | head -1)
    if [ -z "$match" ]; then
      match=$(ls -d "$INTENT_DIR/$DATE-$1" 2>/dev/null | head -1)
    fi
    echo "$match"
  else
    # Find today's task or most recent ready task
    local today_task
    today_task=$(ls -d "$INTENT_DIR/$DATE"-* 2>/dev/null | head -1)
    if [ -n "$today_task" ]; then
      echo "$today_task"
    else
      # Find most recent task that isn't done
      for dir in $(ls -rd "$INTENT_DIR"/*/ 2>/dev/null); do
        if [ -f "$dir/TASK.yaml" ]; then
          local status
          status=$(grep '^status:' "$dir/TASK.yaml" | awk '{print $2}')
          if [ "$status" != "done" ]; then
            echo "$dir"
            return
          fi
        fi
      done
    fi
  fi
}

get_phase() {
  grep '^phase:' "$1/TASK.yaml" | awk '{print $2}' | cut -d/ -f1
}

get_status() {
  grep '^status:' "$1/TASK.yaml" | awk '{print $2}'
}

get_repo_name() {
  basename "$1" | sed "s/^$DATE-//" | sed 's/^[0-9]*-[0-9]*-[0-9]*-//'
}

# --- Step 0: Discovery (if no task exists) ---
run_discovery() {
  log "Running discovery to find today's candidate..."
  cd "$PROJECT_ROOT"
  bun run src/discover.ts
}

# --- Session 1: Generate & Validate (Phases 0-3) ---
run_session_1() {
  local task_dir="$1"
  local repo_name
  repo_name=$(get_repo_name "$task_dir")
  local ws="$WORKSPACE_DIR/$repo_name"

  log "Session 1: Generate & Validate [$repo_name]"
  log "  Task dir: $task_dir"
  log "  Workspace: $ws"

  claude -p \
    --allowedTools "Bash,Read,Write,Edit,Glob,Grep,Skill,Task" \
    "You are executing DocSmith daily pipeline Session 1 (Phases 0-3) for repo '$repo_name'.

Task directory: $task_dir
Workspace: $ws
Project root: $PROJECT_ROOT

Read $task_dir/TASK.yaml to check current phase, then read $task_dir/INTENT.md for context.

Execute these phases in order (skip any already completed based on TASK.yaml phase):

Phase 0: Clone & Analyze
- git clone --depth 1 the repo URL from INTENT.md into $ws
- Analyze structure, determine doc count (3 for <200 files, 5-6 for complex)
- Update TASK.yaml: phase: 1/7

Phase 1: Generate Docs
- cd to $ws and run /doc-smith-create
- Verify minimum word counts (800 overview, 1000+ guides)
- Update TASK.yaml: phase: 2/7

Phase 2: Images & Diagrams
- Insert mermaid code blocks for architecture diagrams
- Update TASK.yaml: phase: 3/7

Phase 3: Validate
- Run /doc-smith-check --structure --content
- Verify .meta.yaml files have kind: doc, source: en
- Fix any validation errors
- Update TASK.yaml: phase: 4/7

After completing all phases, confirm TASK.yaml shows phase: 4/7."
}

# --- Session 2: Publish English (Phase 4) ---
run_session_2() {
  local task_dir="$1"
  local repo_name
  repo_name=$(get_repo_name "$task_dir")
  local ws="$WORKSPACE_DIR/$repo_name"

  log "Session 2: Publish English [$repo_name]"

  claude -p \
    --allowedTools "Bash,Read,Write,Edit,Glob,Grep,Skill,Task" \
    "You are executing DocSmith daily pipeline Session 2 (Phase 4: Publish English) for repo '$repo_name'.

Task directory: $task_dir
Workspace: $ws

Read $task_dir/TASK.yaml to confirm phase is 4/7.

Phase 4: Publish English
- cd to $ws and run /doc-smith-publish
- Verify the published URL is accessible
- Record the success URL in $PROJECT_ROOT/data/history.json
- Update TASK.yaml: phase: 5/7

Publish English FIRST before any translations are added."
}

# --- Session 3: Localize (Phase 5) ---
run_session_3() {
  local task_dir="$1"
  local repo_name
  repo_name=$(get_repo_name "$task_dir")
  local ws="$WORKSPACE_DIR/$repo_name"

  log "Session 3: Localize [$repo_name]"

  claude -p \
    --allowedTools "Bash,Read,Write,Edit,Glob,Grep,Skill,Task" \
    "You are executing DocSmith daily pipeline Session 3 (Phase 5: Localize) for repo '$repo_name'.

Task directory: $task_dir
Workspace: $ws

Read $task_dir/TASK.yaml to confirm phase is 5/7.

Phase 5: Localize
- cd to $ws and run /doc-smith-localize -l zh (Chinese)
- Then run /doc-smith-localize -l ja (Japanese)
- Verify translations are complete (check line counts match English docs)
- Update TASK.yaml: phase: 6/7

Use subagents (Task tool) if needed to keep context manageable."
}

# --- Session 4: Republish (Phase 6) ---
run_session_4() {
  local task_dir="$1"
  local repo_name
  repo_name=$(get_repo_name "$task_dir")
  local ws="$WORKSPACE_DIR/$repo_name"

  log "Session 4: Republish with translations [$repo_name]"

  claude -p \
    --allowedTools "Bash,Read,Write,Edit,Glob,Grep,Skill,Task" \
    "You are executing DocSmith daily pipeline Session 4 (Phase 6: Republish) for repo '$repo_name'.

Task directory: $task_dir
Workspace: $ws
Project root: $PROJECT_ROOT

Read $task_dir/TASK.yaml to confirm phase is 6/7.

Phase 6: Republish with Translations
- cd to $ws and run /doc-smith-publish again to include zh/ja translations
- Verify all languages are accessible on the published URL
- Update $task_dir/TASK.yaml: status: done, phase: 7/7
- Update $PROJECT_ROOT/data/history.json: set status to 'success' for this repo

All done! The documentation is live."
}

# --- Main ---
main() {
  local repo_arg="${1:-}"
  local task_dir

  # Find or create task
  task_dir=$(find_task_dir "$repo_arg")

  if [ -z "$task_dir" ]; then
    log "No existing task found. Running discovery..."
    run_discovery
    task_dir=$(find_task_dir "$repo_arg")
    if [ -z "$task_dir" ]; then
      err "Discovery did not create a task. Check candidates.json and history.json."
      exit 1
    fi
  fi

  local status phase repo_name
  status=$(get_status "$task_dir")
  phase=$(get_phase "$task_dir")
  repo_name=$(get_repo_name "$task_dir")

  log "Task: $repo_name | Status: $status | Phase: $phase"

  if [ "$status" = "done" ]; then
    log "Task already complete!"
    exit 0
  fi

  # Run from current phase
  if [ "$phase" -lt 4 ]; then
    run_session_1 "$task_dir"
    phase=$(get_phase "$task_dir")
  fi

  if [ "$phase" -eq 4 ]; then
    run_session_2 "$task_dir"
    phase=$(get_phase "$task_dir")
  fi

  if [ "$phase" -eq 5 ]; then
    run_session_3 "$task_dir"
    phase=$(get_phase "$task_dir")
  fi

  if [ "$phase" -eq 6 ]; then
    run_session_4 "$task_dir"
  fi

  log "Pipeline complete for $repo_name!"
}

main "$@"
