# DocSmith Daily - Project Instructions

## Overview

This project automatically discovers high-value open-source repos and generates documentation using the doc-smith pipeline. It runs as part of the daily swarm alongside blogs, Google Ads, and other tasks.

## For Swarm Agents

### Step 1: Check for Active Task

Read `intent/` directory for the latest task. Check its `TASK.yaml`:
- If `status: done` → run discovery (Step 2) to create a new task
- If `status: ready` or `status: in_progress` → resume from current phase (Step 3)
- If no task exists for today → run discovery (Step 2)

### Step 2: Discovery (Create Today's Task)

If no active task exists, run discovery to find today's candidate:

```bash
cd /Users/robroyhobbs/work/docsmith-daily && bun run src/discover.ts
```

This creates an intent task at `intent/{date}-{repo}/` with TASK.yaml, INTENT.md, and plan.md. After discovery, proceed to Step 3.

### Step 3: Execute ONE Session Group, Then STOP

**CRITICAL: Only execute the NEXT session group based on current phase, then STOP.**
Each session group runs as a separate agent invocation to avoid context overflow.
After updating TASK.yaml, your job is done — the swarm will pick you up again.

Check TASK.yaml `phase` field and execute the matching session:

#### Phase 0-3 → Session 1: Generate & Validate

**Phase 0: Clone & Analyze**
1. Shallow clone: `git clone --depth 1 {repo_url} workspace/{repo_name}`
2. Analyze structure, determine doc count (3 for <200 files, 5-6 for complex)
3. Update TASK.yaml: `phase: 1/7`

**Phase 1: Generate Docs**
1. Initialize workspace, run `/doc-smith-create`
2. Verify word counts (800 overview, 1000+ guides)
3. Update TASK.yaml: `phase: 2/7`

**Phase 2: Images & Diagrams**
1. Insert mermaid code blocks for architecture diagrams
2. Update TASK.yaml: `phase: 3/7`

**Phase 3: Validate**
1. Run `/doc-smith-check --structure --content`
2. Verify .meta.yaml: `kind: doc`, `source: en`
3. Fix any errors
4. Update TASK.yaml: `phase: 4/7`

**→ STOP after phase 3. Update TASK.yaml and exit.**

#### Phase 4 → Session 2: Publish English

1. Run `/doc-smith-publish` to docsmith.aigne.io
2. Verify published URL is accessible
3. Record URL in `data/history.json`
4. Update TASK.yaml: `phase: 5/7`

**→ STOP. Update TASK.yaml and exit.**

#### Phase 5 → Session 3: Localize

1. Run `/doc-smith-localize -l zh` (Chinese)
2. Run `/doc-smith-localize -l ja` (Japanese)
3. Verify translations complete (line counts match English)
4. Update TASK.yaml: `phase: 6/7`

**→ STOP. Update TASK.yaml and exit.**

#### Phase 6 → Session 4: Republish with Translations

1. Run `/doc-smith-publish` again to include translations
2. Verify all languages accessible
3. Update TASK.yaml: `status: done, phase: 7/7`
4. Update `data/history.json`: set status to `success`

**→ DONE. Task complete.**

### On Failure
- Log details to `logs/failures/{date}.md`
- Mark TASK.yaml as `status: blocked` with error description
- The swarm will move on to other tasks; docsmith can be retried later

## Key Files

- `config.yaml` - Selection criteria (min_stars, max_files, exclusions)
- `data/history.json` - Processing history (success/failure records)
- `data/candidates.json` - Cached candidates from last discovery run
- `intent/{date}-{repo}/` - Daily task directories

## Important Rules

- Never hardcode tokens or credentials
- **Publish English FIRST, then translations** (validator deletes invalid translation files)
- .meta.yaml must have `kind: doc` (not `document`) and `source: en`
- Do NOT read full READMEs into context — use the INTENT.md 2000-char excerpt
- **Execute ONE session group per invocation, then STOP**
