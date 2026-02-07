# DocSmith Daily: Autonomous Documentation Generation

::: reviewed {by=robroyhobbs date=2026-02-05}

## 1. Overview

**Product positioning:** Fully autonomous daily documentation generation system that discovers high-value open-source projects, generates comprehensive multi-language documentation with images/diagrams, and publishes to the DocSmith showcase site.

**Core concept:** GitHub Actions schedules daily discovery at 8am PST. A scoring algorithm identifies the best undocumented repo. TeamSwarm worker executes the full doc-smith pipeline locally. One perfect doc set per day.

**Priority:** High -- replaces paused ~/docsmith-automation system (25% success rate) with IDD+TeamSwarm aligned approach.

**Target user:** Rob (operator) -- system runs autonomously, Rob monitors via TeamSwarm dashboard and reviews published docs.

**Project scope:** End-to-end: discovery → generation → images → localization → publishing → notification.
:::

---

::: locked {reason="Core two-tier architecture: GH Actions discovery + local TeamSwarm execution"}

## 2. Architecture

### System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    GitHub Actions (8am PST)                       │
│                                                                   │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │   Discovery   │───▶│   Scoring    │───▶│  Task Creation   │   │
│  │   (GH API)   │    │  Algorithm   │    │  (TASK.yaml +    │   │
│  └──────────────┘    └──────────────┘    │   INTENT.md)     │   │
│                                           └────────┬─────────┘   │
│                                                    │ git push     │
└────────────────────────────────────────────────────┼─────────────┘
                                                     │
                                                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Local Mac (TeamSwarm)                          │
│                                                                   │
│  ┌──────────────┐    ┌──────────────────────────────────────┐   │
│  │  teamswarm   │───▶│         Doc-Smith Pipeline            │   │
│  │    work      │    │                                       │   │
│  │  (detects    │    │  1. doc-smith-create (adaptive 3-6)   │   │
│  │   new task)  │    │  2. doc-smith-images (mermaid + AI)   │   │
│  └──────────────┘    │  3. doc-smith-check (validate)        │   │
│                      │  4. doc-smith-localize (en→zh,ja)     │   │
│                      │  5. doc-smith-publish (aigne.io)      │   │
│                      └──────────────────────────────────────┘   │
│                                                                   │
│  On failure: retry next repo (max 3) → log failure → skip day   │
└─────────────────────────────────────────────────────────────────┘
```

### Component Breakdown

```
docsmith-daily/
├── .github/
│   └── workflows/
│       └── daily-discover.yml        # 8am PST cron, runs discovery
├── src/
│   ├── discover.ts                    # Discovery + filtering + task creation (single entry point)
│   ├── github-api.ts                  # GitHub API client (no clone)
│   ├── sitemap-checker.ts             # Dedup against published docs
│   └── templates/                    # Intent templates for doc generation
├── intent/                           # TeamSwarm task directory
│   └── {date}-{repo}/              # Daily task folders
│       ├── INTENT.md                # Generated intent for this repo
│       ├── plan.md                  # Execution plan (doc-smith pipeline)
│       └── TASK.yaml                # Status tracking
├── config.yaml                       # All settings: min_stars, max_files, exclusions
├── data/
│   ├── history.json                 # Processing history
│   └── candidates.json             # Discovery cache
├── logs/
│   └── failures/                   # Structured failure logs
├── package.json
├── tsconfig.json
└── CLAUDE.md                        # Project instructions for agents
```

### Data Flow

```
GitHub API                    Local Filesystem            DocSmith Cloud
─────────                    ────────────────            ──────────────

trending repos ──┐
repo metadata  ──┤
README content ──┤           intent/{date}-{repo}/
file tree      ──┘──score──▶ ├── INTENT.md
                             ├── plan.md
                             └── TASK.yaml ──teamswarm──▶

                             .aigne/doc-smith/
                             ├── docs/en.md  ────────────▶ published
                             ├── docs/zh.md  ────────────▶ published
                             ├── docs/ja.md  ────────────▶ published
                             └── assets/*.png ───────────▶ published
```

:::

---

::: locked {reason="Operational contract: filters, phases, retry logic, failure handling"}

### Discovery & Scoring

**Data sources (no full clone):**

- GitHub REST API: repo metadata, stars, forks, language, topics
- GitHub API: README.md content (raw)
- GitHub API: file tree (top-level structure only)
- DocSmith sitemap: already-published check

**Selection filters (all must pass):**

1. Stars >= 500
2. Doc quality gap detected: README < 2000 chars OR no docs/ folder OR non-English primary language
3. Not already on docsmith.aigne.io sitemap
4. Not in config.yaml exclusions list
5. Not in data/history.json as successfully processed
6. Not archived
7. File count <= 750 (via GitHub API tree endpoint)

Repos passing all filters are sorted by stars (descending). First passing repo becomes today's task. Remaining candidates saved to `data/candidates.json` for retry fallback.

### Task Creation

GitHub Actions workflow:

1. Run discovery script (fetch trending repos via GitHub API)
2. Apply selection filters, sort passing repos by stars descending
3. Save full candidates list to `data/candidates.json` (for local retry fallback)
4. Generate `intent/{date}-{repo-name}/INTENT.md` from template (top candidate only)
5. Generate `intent/{date}-{repo-name}/plan.md` (standard doc-smith pipeline)
6. Generate `intent/{date}-{repo-name}/TASK.yaml` with `status: ready`
7. Commit and push

### Execution (TeamSwarm Worker)

When TeamSwarm detects a `status: ready` task:

**Phase 1: Clone & Analyze** (timeout: 5 min)

- Shallow clone repo (depth 1)
- Analyze structure, README, key source files
- Determine doc count: 3 (simple repo) or 5-6 (complex repo)
  - Simple: < 200 files, single language, clear README
  - Complex: > 200 files, multiple languages, or framework/library

**Phase 2: Generate Docs** (timeout: 30 min)

- Initialize .aigne/doc-smith/ workspace
- Run doc-smith-create with adaptive doc count
- Each doc: minimum 800 words for overview, 1000+ for guides

**Phase 3: Images & Diagrams** (timeout: 15 min)

- Insert mermaid code blocks for: architecture, data flow, component diagrams
- Generate 1-2 AI hero images via doc-smith-images (overview page, getting started)
- Aspect ratio: 16:9 for hero images, 4:3 for diagrams

**Phase 4: Validate** (timeout: 5 min)

- Run doc-smith-check --structure --content --check-slots
- All .meta.yaml files must have `kind: doc`, `source: en`
- All internal links must resolve
- Minimum word counts met

**Phase 5: Localize** (timeout: 20 min)

- Run doc-smith-localize -l zh -l ja
- Translate all documents
- Translate image text if applicable

**Phase 6: Publish** (timeout: 10 min)

- Run doc-smith-publish to docsmith.aigne.io
- Verify published URL is accessible
- Record URL in history.json

**Total timeout per repo: 90 minutes**

### Failure Handling

```
Phase fails
    ↓
Log failure details (repo, phase, error, duration)
    ↓
Is this attempt 1 or 2?
    ├── YES → Activate backup candidate (hold → ready)
    │         Clean up failed workspace
    │         Retry with next repo
    └── NO (attempt 3) →
         Mark all tasks as blocked
         Write failure summary to logs/failures/{date}.md
         Skip today, wait for tomorrow
```

### Notification Strategy

- **Success:** TASK.yaml → status: done. Visible in TeamSwarm dashboard.
- **Failure (with retry):** TASK.yaml → status: blocked with reason. Next candidate activates.
- **All retries exhausted:** Structured failure log at `logs/failures/{date}.md` containing:
  - All 3 attempted repos
  - Phase where each failed
  - Error messages
  - Suggested investigation steps

:::

---

::: reviewed {by=robroyhobbs date=2026-02-05}

## 4. User Experience

### Operator Flow (Rob)

**Daily (passive):**

- System runs at 8am autonomously
- Check TeamSwarm dashboard anytime to see today's task status
- Review published doc at docsmith.aigne.io when done notification appears

**Weekly (active):**

- Review `logs/failures/` for patterns
- Update exclusions in `config.yaml` if needed
- Check `data/history.json` for trends

**Manual override:**

- Add specific repos to top of `data/candidates.json` to force next day's target
- Set a task to `hold` to pause the system
- Create manual `intent/` task for a specific repo

### TeamSwarm Dashboard View

```
docsmith-daily
  ✓ 2026-02-06-llamaindex     done     6/6    Published: docsmith.aigne.io/...
  ► 2026-02-07-openai-agents   in_progress  3/6    Phase 3: Images
  ✗ 2026-02-07-some-repo      blocked  2/6    Phase 2 timeout (retried)
```

:::

---

::: reviewed {by=robroyhobbs date=2026-02-05}

## 5. Technical Implementation Guide

### Tech Stack

- **Language:** TypeScript (compiled with tsx)
- **Runtime:** Bun (for TeamSwarm compatibility)
- **CI/CD:** GitHub Actions
- **Execution:** TeamSwarm worker (Claude Agent SDK)
- **Doc generation:** doc-smith skills (create, images, check, localize, publish)
- **APIs:** GitHub REST API (no auth required for public repos, rate limit: 60/hr unauthenticated, 5000/hr with token)

### GitHub Actions Workflow

```yaml
name: Daily Doc Discovery
on:
  schedule:
    - cron: "0 16 * * *" # 8am PST = 4pm UTC
  workflow_dispatch: {} # Manual trigger

jobs:
  discover:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run src/discovery/discover-and-create-task.ts
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - run: |
          git config user.name "docsmith-bot"
          git config user.email "docsmith@arcblock.io"
          git add intent/ data/
          git commit -m "feat(discover): daily task for $(date +%Y-%m-%d)" || true
          git push
```

### Project Config (config.yaml)

```yaml
min_stars: 500
max_files: 750
languages: [en, zh, ja]
docsmith_url: https://docsmith.aigne.io
exclusions:
  - example/repo-to-skip
```

### Plan Template (for generated plan.md)

Each daily task gets a plan.md with 6 phases:

- Phase 0: Clone & Analyze
- Phase 1: Generate Docs
- Phase 2: Images & Diagrams
- Phase 3: Validate
- Phase 4: Localize
- Phase 5: Publish

:::

---

::: locked {reason="Approved decisions and scope boundaries"}

| Decision             | Choice                                        | Rationale                                                   |
| -------------------- | --------------------------------------------- | ----------------------------------------------------------- |
| Replace vs evolve    | Replace (new project)                         | Old system had 25% success rate, architectural issues       |
| Discovery method     | Filter-based selection via GitHub API         | Simple filters (stars + doc gap), no weighted scoring       |
| Quality target       | 1 perfect doc/day                             | Quality over quantity, with retry fallback                  |
| Scheduling           | GitHub Actions → local TeamSwarm              | GH Actions handles reliability, TeamSwarm handles execution |
| Execution engine     | TeamSwarm worker (Claude Agent SDK)           | ArcBlock-aligned, dashboard visibility, session resume      |
| Doc count            | Adaptive (3-6)                                | Simple repos get 3 core, complex get 5-6                    |
| Images               | Mermaid + AI hero images                      | Technical accuracy (mermaid) + visual appeal (AI)           |
| Languages            | en (primary) + zh + ja                        | Matches DocSmith showcase audience                          |
| Failure handling     | Retry 3 repos, then skip + log                | Autonomous operation with failure visibility                |
| Notification         | TeamSwarm dashboard + failure logs            | Aligned with monitoring workflow                            |
| Data from old system | Fresh start                                   | Sitemap checker handles dedup naturally                     |
| Repo analysis        | GitHub API only (no full clone for discovery) | Faster, avoids size issues                                  |
| Project location     | ~/work/docsmith-daily                         | Clean start, old system as reference                        |

---

## 7. MVP Scope

### Included

- GitHub Actions daily cron at 8am PST
- Filter-based repo discovery (stars, doc gap, exclusions)
- Candidates list for retry fallback
- TeamSwarm task creation (TASK.yaml + INTENT.md + plan.md)
- Full doc-smith pipeline execution (create → images → check → localize → publish)
- Adaptive doc count (3-6)
- Mermaid diagrams in all doc sets
- AI hero images (1-2 per set)
- English + Chinese + Japanese
- Retry up to 3 repos on failure
- Structured failure logging
- TeamSwarm dashboard visibility
- History tracking
- Exclusion management

### Excluded (future)

- Email/Slack notifications
- Web dashboard (beyond TeamSwarm TUI)
- Custom doc templates per repo type
- User-facing queue management UI
- Multiple docs per day
- Additional languages beyond en/zh/ja
- SEO optimization of generated content
- Analytics on published doc engagement

:::

---

::: draft

## 8. Risks

| Risk                                | Impact              | Mitigation                                                    |
| ----------------------------------- | ------------------- | ------------------------------------------------------------- |
| GitHub API rate limiting            | Discovery fails     | Use authenticated token (5000/hr). Cache candidates.          |
| Claude Agent SDK instability        | Execution fails     | Retry with backup repos. Log for debugging.                   |
| Doc quality regression              | Poor published docs | doc-smith-check validation gate before publish                |
| Mac offline at execution time       | Task queues up      | TeamSwarm picks up when online. GH Action only creates tasks. |
| Repo too complex for doc generation | Timeout/failure     | Adaptive doc count. 750-file limit. 90-min timeout.           |
| DocSmith publish API changes        | Publish fails       | doc-smith-publish skill handles this. Fail + log.             |
| Discovery finds no good candidates  | No task created     | Lower minimum_score threshold. Expand search criteria.        |

:::

---

::: draft

## 9. Open Items

- [ ] GitHub token setup for Actions (GITHUB_TOKEN secret)
- [ ] TeamSwarm workspace registration for ~/work/docsmith-daily
- [ ] Verify Claude Agent SDK authentication on local machine
- [ ] Initial scoring calibration (may need tuning after first week)
      :::
