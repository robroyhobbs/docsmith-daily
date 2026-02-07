# Execution Plan: docsmith-daily

## Overview

Build a fully autonomous daily documentation generation system. GitHub Actions discovers repos at 8am PST, creates TeamSwarm tasks, and a local TeamSwarm worker executes the doc-smith pipeline (create, images, validate, localize, publish).

## Prerequisites

- Bun runtime installed (confirmed: 1.3.8)
- TeamSwarm CLI installed (confirmed: global)
- doc-smith skills installed (confirmed: 6 skills)
- IDD + TeamSwarm skills installed (confirmed)
- GitHub account with repo creation access

---

## Phase 0: Project Scaffolding + GitHub API Client

### Description

Initialize the project structure, set up TypeScript/Bun, create the GitHub API client that fetches trending repos and repo metadata without cloning. This is the foundation everything else depends on.

Deliverables:
- Initialized project with package.json, tsconfig.json, config.yaml
- `src/github-api.ts` -- fetches trending repos, README, file tree from GitHub REST API
- `src/sitemap-checker.ts` -- checks docsmith.aigne.io sitemap for already-published repos
- `data/history.json` and `data/candidates.json` initialized

### Tests

#### Happy Path
- [ ] github-api: fetchTrendingRepos() returns array of repo objects with name, stars, language, topics
- [ ] github-api: fetchReadme(owner, repo) returns raw README string
- [ ] github-api: fetchFileTree(owner, repo) returns flat array of file paths
- [ ] sitemap-checker: checkSitemap(repoName) returns false for unpublished repo
- [ ] sitemap-checker: checkSitemap(repoName) returns true for already-published repo
- [ ] config.yaml loads correctly with min_stars, max_files, languages, exclusions

#### Bad Path
- [ ] github-api: returns empty array when GitHub API returns 403 (rate limited)
- [ ] github-api: returns empty array when GitHub API returns 5xx (server error)
- [ ] github-api: throws on malformed GitHub API response (missing expected fields)
- [ ] github-api: handles repo with no README (returns empty string, not crash)
- [ ] github-api: handles repo with empty file tree (returns empty array)
- [ ] sitemap-checker: returns false when docsmith.aigne.io is unreachable (fail open)
- [ ] config.yaml: throws descriptive error if file missing or malformed YAML

#### Edge Cases
- [ ] github-api: handles repo name with special characters (dots, hyphens, underscores)
- [ ] github-api: handles README > 100KB (GitHub API truncates, graceful handling)
- [ ] github-api: handles file tree > 750 entries (returns count, not all entries)
- [ ] sitemap-checker: handles sitemap with 1000+ entries (performance)
- [ ] config.yaml: empty exclusions list is valid

#### Security
- [ ] github-api: GITHUB_TOKEN not logged or included in error messages
- [ ] github-api: API requests use HTTPS only
- [ ] github-api: response data sanitized (no arbitrary code execution from repo names)

#### Data Leak
- [ ] error messages from API failures don't expose the auth token
- [ ] sitemap-checker errors don't expose internal URL patterns
- [ ] logs don't contain raw API response bodies with potential secrets

#### Data Damage
- [ ] history.json: read operation doesn't corrupt file if interrupted
- [ ] candidates.json: atomic write (write to temp, rename)
- [ ] config.yaml: read-only, never modified by the system

### E2E Gate

```bash
# Verify project builds
cd ~/work/docsmith-daily && bun install && bun run build

# Verify GitHub API works (requires GITHUB_TOKEN in env)
bun run src/github-api.ts --test

# Verify sitemap checker
bun run src/sitemap-checker.ts --test

# Run all phase 0 tests
bun test --grep "Phase 0"
```

### Acceptance Criteria

- [ ] All 6 test categories pass
- [ ] E2E Gate verification passes
- [ ] `bun install` completes without errors
- [ ] TypeScript compiles without errors
- [ ] Code committed: `feat(core): Phase 0 - project scaffolding + GitHub API client`

---

## Phase 1: Discovery Engine + Task Creator

### Description

Build the core discovery logic: apply the 7 selection filters, sort by stars, save candidates, and generate TeamSwarm-compatible task files (INTENT.md, plan.md, TASK.yaml) for the top candidate.

Deliverables:
- `src/discover.ts` -- single entry point: fetch → filter → sort → create task
- `src/templates/` -- intent and plan templates for daily tasks
- Working `bun run src/discover.ts` that creates a real task in `intent/`

### Tests

#### Happy Path
- [ ] discover: with mock API data, selects highest-star repo passing all 7 filters
- [ ] discover: creates `intent/{date}-{repo}/INTENT.md` with repo name, description, README excerpt
- [ ] discover: creates `intent/{date}-{repo}/plan.md` with 6 execution phases
- [ ] discover: creates `intent/{date}-{repo}/TASK.yaml` with status: ready, phase: 0/6
- [ ] discover: saves all passing candidates to `data/candidates.json`
- [ ] discover: appends selected repo to `data/history.json` with timestamp and status: pending

#### Bad Path
- [ ] discover: returns gracefully (no task created) when 0 repos pass filters
- [ ] discover: skips repo with stars < 500 (filter 1)
- [ ] discover: skips repo with good docs (README > 2000 chars AND has docs/ folder AND English primary) (filter 2)
- [ ] discover: skips repo already on docsmith sitemap (filter 3)
- [ ] discover: skips repo in config.yaml exclusions (filter 4)
- [ ] discover: skips repo in history.json as success (filter 5)
- [ ] discover: skips archived repo (filter 6)
- [ ] discover: skips repo with > 750 files (filter 7)
- [ ] discover: handles GitHub API returning 0 trending repos
- [ ] discover: handles all candidates being filtered out

#### Edge Cases
- [ ] discover: handles repo at exactly 500 stars (passes)
- [ ] discover: handles repo at exactly 750 files (passes)
- [ ] discover: handles README at exactly 2000 chars (passes -- considered gap)
- [ ] discover: when intent/{date}-{repo}/ already exists (skip, don't overwrite)
- [ ] discover: handles repo name with org prefix (e.g., "facebook/react" → "react")
- [ ] discover: handles date format correctly in directory name (YYYY-MM-DD)

#### Security
- [ ] discover: template output doesn't execute any content from repo README (no eval/template injection)
- [ ] discover: repo names are sanitized before use as directory names (no path traversal)
- [ ] discover: GITHUB_TOKEN passed via env, not hardcoded in templates

#### Data Leak
- [ ] generated INTENT.md doesn't contain the GITHUB_TOKEN
- [ ] candidates.json doesn't contain API response metadata (headers, tokens)
- [ ] failure logs don't include full API request/response dumps

#### Data Damage
- [ ] discover: if task creation fails mid-way, partial intent/ directory is cleaned up
- [ ] discover: candidates.json written atomically (temp file + rename)
- [ ] discover: history.json append is crash-safe (read, append, write)

### E2E Gate

```bash
# Run discovery with live GitHub API
cd ~/work/docsmith-daily && GITHUB_TOKEN=$GITHUB_TOKEN bun run src/discover.ts

# Verify task was created
test -f intent/$(date +%Y-%m-%d)-*/TASK.yaml && echo "PASS: Task created" || echo "FAIL: No task"
test -f intent/$(date +%Y-%m-%d)-*/INTENT.md && echo "PASS: Intent created" || echo "FAIL: No intent"
test -f intent/$(date +%Y-%m-%d)-*/plan.md && echo "PASS: Plan created" || echo "FAIL: No plan"

# Verify candidates saved
test -f data/candidates.json && echo "PASS: Candidates saved" || echo "FAIL: No candidates"

# Run all phase 1 tests
bun test --grep "Phase 1"
```

### Acceptance Criteria

- [ ] All 6 test categories pass
- [ ] E2E Gate: real discovery run creates valid task files
- [ ] TASK.yaml has correct format (status: ready, phase: 0/6)
- [ ] Generated plan.md has all 6 execution phases
- [ ] Code committed: `feat(discovery): Phase 1 - discovery engine + task creator`

---

## Phase 2: GitHub Actions Workflow + TeamSwarm Integration

### Description

Create the GitHub Actions workflow (daily-discover.yml) that runs discovery at 8am PST and pushes the task. Configure TeamSwarm workspace. Add retry logic that reads from candidates.json on failure.

Deliverables:
- `.github/workflows/daily-discover.yml` -- cron + manual trigger
- TeamSwarm workspace registered at `~/.teamswarm/workspaces.yaml`
- CLAUDE.md with project instructions for TeamSwarm agents
- Retry logic: on failure, pick next candidate from candidates.json

### Tests

#### Happy Path
- [ ] GH Actions YAML: valid syntax (parseable by yaml parser)
- [ ] GH Actions YAML: cron is `0 16 * * *` (8am PST = 4pm UTC)
- [ ] GH Actions YAML: has workflow_dispatch for manual trigger
- [ ] GH Actions YAML: uses bun for build step
- [ ] GH Actions YAML: commits and pushes intent/ and data/ directories
- [ ] TeamSwarm: workspace.yaml includes ~/work/docsmith-daily with paths: [intent]
- [ ] CLAUDE.md: contains doc-smith pipeline instructions for agents
- [ ] Retry: on failure, reads next candidate from candidates.json and creates new task

#### Bad Path
- [ ] GH Actions YAML: git push fails (no changes to commit) -- exits cleanly with `|| true`
- [ ] Retry: candidates.json is empty -- logs "no more candidates" and exits
- [ ] Retry: candidates.json doesn't exist -- logs error and exits
- [ ] Retry: all candidates already in history.json -- logs "all candidates exhausted"
- [ ] CLAUDE.md: if missing, TeamSwarm worker still functions (falls back to skill defaults)

#### Edge Cases
- [ ] GH Actions: handles DST change (PST vs PDT -- cron stays UTC so no issue)
- [ ] Retry: candidate repo was deleted between discovery and retry -- skip to next
- [ ] TeamSwarm: workspace already registered -- don't duplicate entry
- [ ] GH Actions: concurrent workflow runs (workflow_dispatch during cron) -- second run finds task exists, skips

#### Security
- [ ] GH Actions: GITHUB_TOKEN from secrets, not hardcoded
- [ ] GH Actions: git push uses GITHUB_TOKEN default auth (not a PAT in code)
- [ ] CLAUDE.md: no credentials or tokens in agent instructions

#### Data Leak
- [ ] GH Actions logs don't expose GITHUB_TOKEN (GitHub masks by default)
- [ ] git commits don't include .env or credential files
- [ ] CLAUDE.md doesn't reference any API keys

#### Data Damage
- [ ] GH Actions: git push with `|| true` doesn't silently lose changes
- [ ] Retry: picking next candidate doesn't corrupt candidates.json
- [ ] TeamSwarm workspace config: adding workspace doesn't overwrite existing entries

### E2E Gate

```bash
# Validate GH Actions YAML syntax
cd ~/work/docsmith-daily && bun run -e "
import { parse } from 'yaml';
import { readFileSync } from 'fs';
const y = parse(readFileSync('.github/workflows/daily-discover.yml', 'utf-8'));
console.log('Cron:', y.on.schedule[0].cron);
console.log('PASS: Valid workflow');
"

# Verify TeamSwarm workspace
grep -q "docsmith-daily" ~/.teamswarm/workspaces.yaml && echo "PASS: Workspace registered" || echo "FAIL: Not registered"

# Verify CLAUDE.md exists
test -f ~/work/docsmith-daily/CLAUDE.md && echo "PASS: CLAUDE.md exists" || echo "FAIL: No CLAUDE.md"

# Test retry logic with mock failure
bun test --grep "Phase 2"
```

### Acceptance Criteria

- [ ] All 6 test categories pass
- [ ] E2E Gate: workflow YAML is valid
- [ ] TeamSwarm workspace registered and visible in `teamswarm list`
- [ ] Retry logic works end-to-end with mock candidates
- [ ] Code committed: `feat(ci): Phase 2 - GitHub Actions workflow + TeamSwarm integration`

---

## Phase 3: Failure Logging + History Tracking + Git Init

### Description

Add structured failure logging (writes to `logs/failures/{date}.md`), history tracking (updates data/history.json on success/failure), and initialize the git repo with first commit and GitHub remote.

Deliverables:
- Failure logging inline in discover.ts (writes markdown to logs/failures/)
- History tracking: success/failure records with timestamp, repo, duration, phase
- Git repo initialized with proper .gitignore
- GitHub remote configured (for GH Actions to push to)

### Tests

#### Happy Path
- [ ] failure log: creates `logs/failures/2026-02-06.md` with repo name, phase, error, timestamp
- [ ] failure log: appends to existing day's log if multiple failures
- [ ] history: records success with {repo, status: "success", url, timestamp, duration}
- [ ] history: records failure with {repo, status: "failed", phase, error, timestamp}
- [ ] .gitignore: excludes node_modules, .env, workspace/ (cloned repos)
- [ ] git repo: initialized with remote pointing to GitHub

#### Bad Path
- [ ] failure log: logs/ directory doesn't exist -- creates it
- [ ] failure log: write fails (disk full) -- doesn't crash main process
- [ ] history: history.json doesn't exist -- creates it with first entry
- [ ] history: history.json is corrupted JSON -- recreates from scratch with warning
- [ ] history: write fails -- doesn't crash main process

#### Edge Cases
- [ ] failure log: 3 failures in one day -- all appear in same file, clearly separated
- [ ] history: history.json with 10000+ entries -- doesn't slow down read/filter
- [ ] failure log: error message contains markdown special chars -- escaped properly
- [ ] history: duplicate repo entry (retried after failure) -- both entries kept with different timestamps

#### Security
- [ ] failure log: error messages sanitized (no stack traces with file paths in production)
- [ ] history: no credential data in any record
- [ ] .gitignore: includes .env, *.key, credentials*

#### Data Leak
- [ ] failure logs don't contain API tokens or auth headers
- [ ] history records don't contain full error stack traces
- [ ] git history doesn't contain credentials (check .gitignore before first commit)

#### Data Damage
- [ ] history.json: atomic write prevents corruption on crash
- [ ] failure log: append-only pattern prevents losing previous entries
- [ ] git init: doesn't destroy existing repo if re-run

### E2E Gate

```bash
cd ~/work/docsmith-daily

# Test failure logging
bun run -e "
import { writeFailureLog } from './src/discover.ts';
writeFailureLog('test-repo', 2, 'timeout after 30 min', 1800);
"
test -f logs/failures/$(date +%Y-%m-%d).md && echo "PASS: Failure log created" || echo "FAIL"

# Test history tracking
bun run -e "
import { recordHistory } from './src/discover.ts';
recordHistory({ repo: 'test/repo', status: 'success', url: 'https://example.com', duration: 300 });
"
grep -q "test/repo" data/history.json && echo "PASS: History recorded" || echo "FAIL"

# Verify git setup
git -C ~/work/docsmith-daily remote -v | grep -q "github.com" && echo "PASS: Remote configured" || echo "FAIL"

# Run all phase 3 tests
bun test --grep "Phase 3"
```

### Acceptance Criteria

- [ ] All 6 test categories pass
- [ ] E2E Gate: failure log and history tracking work end-to-end
- [ ] Git repo initialized with remote
- [ ] .gitignore covers all sensitive/generated files
- [ ] Code committed: `feat(ops): Phase 3 - failure logging + history tracking + git init`

---

## Final E2E Verification

```bash
cd ~/work/docsmith-daily

# 1. Full discovery run (creates real task)
GITHUB_TOKEN=$GITHUB_TOKEN bun run src/discover.ts
echo "--- Discovery complete ---"

# 2. Verify task files created
ls -la intent/$(date +%Y-%m-%d)-*/
echo "--- Task files verified ---"

# 3. Verify TeamSwarm sees the task
# (This requires teamswarm CLI)
cd ~/work/docsmith-daily && teamswarm list 2>/dev/null || echo "Manual check: teamswarm dashboard"
echo "--- TeamSwarm check ---"

# 4. Run full test suite
bun test
echo "--- All tests ---"

# 5. Verify GH Actions workflow is valid
cat .github/workflows/daily-discover.yml | head -20
echo "--- Workflow verified ---"

# 6. Verify git status clean
git status --short
echo "--- Git clean ---"
```

## Risk Mitigation

| Risk | Mitigation | Contingency |
|------|------------|-------------|
| GitHub API rate limit during discovery | Cache candidates, use authenticated token | Fall back to cached candidates.json |
| TeamSwarm worker can't execute doc-smith skills | CLAUDE.md provides explicit instructions | Manual execution via `/doc-smith-create` in Claude Code |
| Repo too complex for adaptive doc count | Heuristic based on file count + language count | Default to 3 docs if heuristic fails |
| GH Actions push fails | `|| true` prevents workflow failure | Manual trigger via workflow_dispatch |

## References

- [Intent](./INTENT.md)
- [Overview](./overview.md)
