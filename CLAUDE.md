# DocSmith Daily - Project Instructions

## Overview

This project automatically discovers high-value open-source repos and generates documentation using the doc-smith pipeline.

## For TeamSwarm Agents

When executing a daily task (found in `intent/{date}-{repo}/`), follow this pipeline:

### Phase 0: Clone & Analyze
1. Shallow clone the repo: `git clone --depth 1 {repo_url} workspace/{repo_name}`
2. Analyze structure, identify key files, determine doc count (3-6)
3. Update TASK.yaml: `phase: 1/6`

### Phase 1: Generate Docs
1. Initialize workspace: ensure `.aigne/doc-smith/` exists
2. Run `/doc-smith-create` with adaptive doc count
3. Verify minimum word counts (800 for overview, 1000+ for guides)
4. Update TASK.yaml: `phase: 2/6`

### Phase 2: Images & Diagrams
1. Insert mermaid code blocks for architecture/data flow diagrams
2. Run `/doc-smith-images` for AI hero images (1-2 per doc set)
3. Update TASK.yaml: `phase: 3/6`

### Phase 3: Validate
1. Run `/doc-smith-check --structure --content --check-slots`
2. Verify all .meta.yaml files have `kind: doc`, `source: en`
3. Fix any validation errors
4. Update TASK.yaml: `phase: 4/6`

### Phase 4: Localize
1. Run `/doc-smith-localize -l zh -l ja`
2. Verify translations are complete
3. Update TASK.yaml: `phase: 5/6`

### Phase 5: Publish
1. Run `/doc-smith-publish` to docsmith.aigne.io
2. Verify published URL is accessible
3. Record success URL in `data/history.json`
4. Update TASK.yaml: `status: done, phase: 6/6`

### On Failure
- Log details to `logs/failures/{date}.md`
- Mark current task as `blocked` in TASK.yaml
- If retry available, the next candidate from `data/candidates.json` will be used

## Key Files

- `config.yaml` - Selection criteria (min_stars, max_files, exclusions)
- `data/history.json` - Processing history (success/failure records)
- `data/candidates.json` - Cached candidates from last discovery run
- `intent/{date}-{repo}/` - Daily task directories

## Important Notes

- Never hardcode tokens or credentials
- Always validate before publishing
- Publish English first, then add translations (DocSmith validator quirk)
- .meta.yaml must have `kind: doc` (not `document`) and `source: en`
