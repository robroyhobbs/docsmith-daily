import { mkdirSync, writeFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { fetchTrendingRepos, fetchReadme, fetchFileTree, type RepoInfo } from "./github-api";
import { checkSitemap } from "./sitemap-checker";
import { loadConfig, type Config } from "./config";
import { readHistory, writeHistory, readCandidates, writeCandidates } from "./data";

export interface DiscoveryCandidate {
  name: string;
  full_name: string;
  owner: string;
  description: string;
  stars: number;
  forks: number;
  language: string | null;
  topics: string[];
  archived: boolean;
  readme_length: number;
  file_count: number;
  has_docs_folder: boolean;
  is_english_primary: boolean;
  html_url: string;
  default_branch: string;
}

/**
 * Sanitize a name for use as a directory name.
 * Removes path traversal characters and other dangerous chars.
 */
function sanitizeDirName(name: string): string {
  return name
    .replace(/\.\./g, "")
    .replace(/[/\\:*?"<>|]/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

/**
 * Strip potential sensitive tokens from text content.
 */
function sanitizeContent(text: string): string {
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    text = text.replaceAll(token, "[REDACTED]");
  }
  // Also strip common token patterns
  text = text.replace(/ghp_[A-Za-z0-9_]{36,}/g, "[REDACTED]");
  text = text.replace(/gho_[A-Za-z0-9_]{36,}/g, "[REDACTED]");
  return text;
}

/**
 * Apply all 7 selection filters and sort by stars descending.
 *
 * Filters:
 * 1. Stars >= min_stars
 * 2. Doc quality gap detected (README < 2000 OR no docs/ OR non-English primary)
 * 3. Not on docsmith sitemap
 * 4. Not in exclusions list
 * 5. Not in history as success
 * 6. Not archived
 * 7. File count <= max_files
 */
export function applyFilters(
  candidates: DiscoveryCandidate[],
  config: Config,
  history: any[],
  sitemapResults: Map<string, boolean>
): DiscoveryCandidate[] {
  const successRepos = new Set(
    history
      .filter((h) => h.status === "success")
      .map((h) => h.repo)
  );

  const exclusionSet = new Set(config.exclusions.map((e) => e.toLowerCase()));

  const filtered = candidates.filter((c) => {
    // Filter 1: Stars >= min_stars
    if (c.stars < config.min_stars) return false;

    // Filter 2: Doc quality gap detected
    // Must have at least ONE of: short README, no docs folder, non-English primary
    const hasGoodDocs =
      c.readme_length > 2000 && c.has_docs_folder && c.is_english_primary;
    if (hasGoodDocs) return false;

    // Filter 3: Not on docsmith sitemap
    if (sitemapResults.get(c.name) === true) return false;

    // Filter 4: Not in exclusions
    if (exclusionSet.has(c.full_name.toLowerCase())) return false;

    // Filter 5: Not in history as success
    if (successRepos.has(c.full_name)) return false;

    // Filter 6: Not archived
    if (c.archived) return false;

    // Filter 7: File count <= max_files
    if (c.file_count > config.max_files) return false;

    return true;
  });

  // Sort by stars descending
  filtered.sort((a, b) => b.stars - a.stars);

  return filtered;
}

/**
 * Create a TeamSwarm task for a candidate repo.
 * Returns true if created, false if already exists.
 */
export function createTask(
  candidate: DiscoveryCandidate,
  intentDir: string,
  readmeContent: string
): boolean {
  const date = new Date().toISOString().split("T")[0];
  const safeName = sanitizeDirName(candidate.name);
  const taskDir = join(intentDir, `${date}-${safeName}`);

  // Don't overwrite existing task
  if (existsSync(taskDir)) {
    return false;
  }

  // Sanitize readme content
  const safeReadme = sanitizeContent(readmeContent);

  // Truncate readme for INTENT.md
  const readmeExcerpt =
    safeReadme.length > 2000 ? safeReadme.substring(0, 2000) + "\n\n..." : safeReadme;

  try {
    mkdirSync(taskDir, { recursive: true });

    // INTENT.md
    const intentContent = `# Documentation Generation: ${candidate.name}

## Overview

Generate comprehensive documentation for **${candidate.name}** (${candidate.full_name}).

- **Stars:** ${candidate.stars.toLocaleString()}
- **Language:** ${candidate.language || "Unknown"}
- **Description:** ${candidate.description}
- **URL:** ${candidate.html_url}

## Source Analysis

- **File count:** ${candidate.file_count}
- **Has docs folder:** ${candidate.has_docs_folder ? "Yes" : "No"}
- **README length:** ${candidate.readme_length} chars

## README Excerpt

\`\`\`
${readmeExcerpt}
\`\`\`

## Documentation Plan

Generate documentation in English (primary), Chinese, and Japanese.

### Adaptive Doc Count

- Simple repo (< 200 files, single language): 3 docs
- Complex repo (> 200 files, multiple languages, framework/library): 5-6 docs

### Required Documents (minimum)

1. **Overview** - What the project does, why it matters
2. **Getting Started** - Installation and basic usage
3. **Architecture** - System design and key concepts

### For Complex Repos (additional)

4. **API Reference** - Key APIs and interfaces
5. **Advanced Usage** - Configuration, customization, plugins
6. **Contributing** - Development setup, guidelines

## Images & Diagrams

- Mermaid code blocks for: architecture, data flow, component diagrams
- AI hero images for overview and getting started pages

## Languages

- English (primary)
- Chinese (zh)
- Japanese (ja)
`;

    writeFileSync(join(taskDir, "INTENT.md"), intentContent);

    // plan.md
    const planContent = `# Execution Plan: ${candidate.name} Documentation

## Overview

Generate and publish documentation for ${candidate.name} to docsmith.aigne.io.

## Phase 0: Clone & Analyze

### Description
Shallow clone the repository, analyze structure, README, and key source files.
Determine appropriate doc count (3 for simple, 5-6 for complex).

### Acceptance Criteria
- [ ] Repository cloned successfully
- [ ] Structure analysis complete
- [ ] Doc count determined

## Phase 1: Generate Docs

### Description
Initialize .aigne/doc-smith/ workspace and run doc-smith-create.

### Acceptance Criteria
- [ ] doc-smith-create completed
- [ ] All documents meet minimum word counts

## Phase 2: Images & Diagrams

### Description
Insert mermaid diagrams and generate AI hero images.

### Acceptance Criteria
- [ ] Mermaid diagrams in architecture docs
- [ ] AI hero images generated

## Phase 3: Validate

### Description
Run doc-smith-check to validate structure and content.

### Acceptance Criteria
- [ ] doc-smith-check passes
- [ ] All .meta.yaml files correct
- [ ] All internal links resolve

## Phase 4: Localize

### Description
Translate to Chinese and Japanese using doc-smith-localize.

### Acceptance Criteria
- [ ] Chinese translations complete
- [ ] Japanese translations complete

## Phase 5: Publish

### Description
Publish to docsmith.aigne.io and verify.

### Acceptance Criteria
- [ ] Published successfully
- [ ] URL accessible
- [ ] Recorded in history
`;

    writeFileSync(join(taskDir, "plan.md"), planContent);

    // TASK.yaml
    const taskContent = `status: ready
owner: null
assignee: null
phase: 0/6
updated: ${new Date().toISOString()}
heartbeat: null
`;

    writeFileSync(join(taskDir, "TASK.yaml"), taskContent);

    return true;
  } catch (e) {
    // Clean up partial directory on failure
    try {
      rmSync(taskDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    return false;
  }
}

/**
 * Run the full discovery pipeline:
 * 1. Fetch trending repos
 * 2. Enrich with README and file tree data
 * 3. Check sitemap for each
 * 4. Apply filters
 * 5. Save candidates
 * 6. Create task for top candidate
 */
export async function runDiscovery(projectRoot: string): Promise<{
  created: boolean;
  taskDir: string | null;
  candidateCount: number;
}> {
  const config = loadConfig(join(projectRoot, "config.yaml"));
  const historyPath = join(projectRoot, "data", "history.json");
  const candidatesPath = join(projectRoot, "data", "candidates.json");
  const intentDir = join(projectRoot, "intent");

  const history = readHistory(historyPath);

  console.log("Fetching trending repos from GitHub...");
  const repos = await fetchTrendingRepos({ minStars: config.min_stars });
  console.log(`Found ${repos.length} trending repos`);

  if (repos.length === 0) {
    console.log("No trending repos found. Exiting.");
    return { created: false, taskDir: null, candidateCount: 0 };
  }

  // Enrich repos with README and file tree data
  console.log("Enriching repo data...");
  const enriched: DiscoveryCandidate[] = [];

  for (const repo of repos) {
    const readme = await fetchReadme(repo.owner, repo.name);
    const fileTree = await fetchFileTree(repo.owner, repo.name, repo.default_branch);
    const hasDocsFolder = fileTree.some(
      (f) => f.startsWith("docs/") || f.startsWith("doc/") || f.startsWith("documentation/")
    );

    // Simple English detection: check if README is primarily ASCII
    const asciiChars = readme.replace(/[^\x00-\x7F]/g, "").length;
    const isEnglishPrimary = readme.length > 0 ? asciiChars / readme.length > 0.8 : false;

    enriched.push({
      name: repo.name,
      full_name: repo.full_name,
      owner: repo.owner,
      description: repo.description,
      stars: repo.stars,
      forks: repo.forks,
      language: repo.language,
      topics: repo.topics,
      archived: repo.archived,
      readme_length: readme.length,
      file_count: fileTree.length,
      has_docs_folder: hasDocsFolder,
      is_english_primary: isEnglishPrimary,
      html_url: repo.html_url,
      default_branch: repo.default_branch,
    });
  }

  // Check sitemap for each repo
  console.log("Checking sitemap for published repos...");
  const sitemapResults = new Map<string, boolean>();
  for (const c of enriched) {
    const isPublished = await checkSitemap(c.name);
    sitemapResults.set(c.name, isPublished);
  }

  // Apply filters
  const filtered = applyFilters(enriched, config, history, sitemapResults);
  console.log(`${filtered.length} repos pass all filters`);

  // Save all candidates
  writeCandidates(
    candidatesPath,
    filtered.map((c) => ({
      name: c.name,
      full_name: c.full_name,
      stars: c.stars,
      language: c.language,
      readme_length: c.readme_length,
      file_count: c.file_count,
    }))
  );

  if (filtered.length === 0) {
    console.log("No candidates passed all filters. No task created.");
    return { created: false, taskDir: null, candidateCount: 0 };
  }

  // Create task for top candidate
  const top = filtered[0];
  console.log(`Top candidate: ${top.full_name} (${top.stars} stars)`);

  const readme = await fetchReadme(top.owner, top.name);
  const created = createTask(top, intentDir, readme);

  if (created) {
    const date = new Date().toISOString().split("T")[0];
    const safeName = sanitizeDirName(top.name);
    const taskDir = join(intentDir, `${date}-${safeName}`);

    // Record in history
    history.push({
      repo: top.full_name,
      status: "pending",
      timestamp: new Date().toISOString(),
    });
    writeHistory(historyPath, history);

    console.log(`Task created at: ${taskDir}`);
    return { created: true, taskDir, candidateCount: filtered.length };
  }

  console.log(`Task already exists for ${top.name}, skipping.`);
  return { created: false, taskDir: null, candidateCount: filtered.length };
}

// Re-exports for convenience
export { fetchTrendingRepos, fetchReadme, fetchFileTree } from "./github-api";
export { checkSitemap } from "./sitemap-checker";
export { loadConfig } from "./config";
export { readHistory, writeHistory, readCandidates, writeCandidates } from "./data";

// CLI entry point
if (import.meta.main) {
  const projectRoot = join(import.meta.dir, "..");
  const result = await runDiscovery(projectRoot);
  if (result.created) {
    console.log(`\nDiscovery complete! Task created at: ${result.taskDir}`);
    console.log(`Total candidates: ${result.candidateCount}`);
  } else {
    console.log("\nDiscovery complete. No task created.");
  }
}
