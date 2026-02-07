# DocSmith Daily: One Perfect Doc Set, Every Day

## What is it?
An autonomous system that finds underserved open-source projects, generates comprehensive documentation (English + Chinese + Japanese), and publishes to docsmith.aigne.io -- every day at 8am, hands-free.

## Why?
The old docsmith-automation had a 25% success rate and required babysitting. This system is built from scratch with IDD+TeamSwarm, designed for reliability and quality over quantity.

## How it works

```
8:00 AM PST ─── GitHub Actions ───── "What should we document today?"
                      │
                      ▼
              Score 10 candidates ──── Pick best + 2 backups
                      │
                      ▼
              Create TASK.yaml ─────── Push to repo
                      │
                      ▼
              TeamSwarm detects ────── Start doc-smith pipeline
                      │
                      ▼
              Generate → Images → Validate → Translate → Publish
                      │
                      ▼
              Done ─── or ─── Retry next backup (up to 3x)
```

## Architecture

```
┌── GitHub Actions ──┐     ┌── Local Mac ────────────────┐
│  Daily cron 8am    │────▶│  teamswarm work             │
│  Discovery script  │     │  Picks up task              │
│  Creates TASK.yaml │     │  Runs doc-smith pipeline    │
└────────────────────┘     │  Publishes to aigne.io      │
                           └─────────────────────────────┘
```

## Key decisions

| Question | Choice | Why |
|----------|--------|-----|
| Quality vs quantity | 1 perfect doc/day | Old system failed 75% of the time |
| How to find repos | Multi-factor scoring | Stars alone misses niche gems |
| How many docs | Adaptive (3-6) | Simple repos don't need 6 docs |
| Images | Mermaid + AI hero | Technical accuracy + visual flare |
| Scheduling | GitHub Actions | Runs even if Mac was off overnight |
| Execution | TeamSwarm worker | ArcBlock-aligned, dashboard visibility |

## Scope

**In:** Discovery, scoring, doc generation, images, validation, localization (en/zh/ja), publishing, retry logic, failure logging, TeamSwarm integration

**Out:** Email notifications, web dashboard, multiple docs/day, additional languages, SEO, analytics

## Risks

| Risk | Mitigation |
|------|------------|
| API rate limits | Authenticated token + caching |
| Mac offline | Task queues, executes when online |
| Bad repo selection | 3 backup candidates per day |
| Quality issues | doc-smith-check validation gate |

## Next steps
1. `/intent-critique` -- check for over-engineering
2. `/intent-plan` -- generate phased execution plan
3. Build it
