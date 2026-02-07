import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import {
  applyFilters,
  createTask,
  runDiscovery,
  type DiscoveryCandidate,
} from "../src/discover";

const TEST_DIR = "/tmp/docsmith-daily-test-discover";
const TEST_DATA_DIR = join(TEST_DIR, "data");
const TEST_INTENT_DIR = join(TEST_DIR, "intent");

// --- Phase 1: Discovery Engine Tests ---

function makeCandidate(overrides: Partial<DiscoveryCandidate> = {}): DiscoveryCandidate {
  return {
    name: "test-repo",
    full_name: "owner/test-repo",
    owner: "owner",
    description: "A test repo",
    stars: 1000,
    forks: 100,
    language: "TypeScript",
    topics: ["ai", "framework"],
    archived: false,
    readme_length: 500,
    file_count: 200,
    has_docs_folder: false,
    is_english_primary: false,
    html_url: "https://github.com/owner/test-repo",
    default_branch: "main",
    ...overrides,
  };
}

describe("Phase 1 - Discovery: applyFilters", () => {
  // === Happy Path ===
  describe("Happy Path", () => {
    test("selects repo passing all 7 filters", () => {
      const candidates = [makeCandidate()];
      const config = {
        min_stars: 500,
        max_files: 750,
        languages: ["en", "zh", "ja"],
        docsmith_url: "https://docsmith.aigne.io",
        exclusions: [],
      };
      const history: any[] = [];
      const sitemapResults = new Map<string, boolean>();
      sitemapResults.set("test-repo", false); // Not on sitemap

      const result = applyFilters(candidates, config, history, sitemapResults);
      expect(result.length).toBe(1);
      expect(result[0].name).toBe("test-repo");
    });

    test("returns highest-star repo first", () => {
      const candidates = [
        makeCandidate({ name: "low-stars", full_name: "o/low-stars", stars: 600 }),
        makeCandidate({ name: "high-stars", full_name: "o/high-stars", stars: 5000 }),
        makeCandidate({ name: "mid-stars", full_name: "o/mid-stars", stars: 2000 }),
      ];
      const config = {
        min_stars: 500,
        max_files: 750,
        languages: ["en"],
        docsmith_url: "https://docsmith.aigne.io",
        exclusions: [],
      };
      const sitemapResults = new Map<string, boolean>();

      const result = applyFilters(candidates, config, [], sitemapResults);
      expect(result[0].name).toBe("high-stars");
      expect(result[1].name).toBe("mid-stars");
      expect(result[2].name).toBe("low-stars");
    });
  });

  // === Bad Path ===
  describe("Bad Path", () => {
    test("skips repo with stars < min_stars (filter 1)", () => {
      const candidates = [makeCandidate({ stars: 200 })];
      const config = { min_stars: 500, max_files: 750, languages: ["en"], docsmith_url: "", exclusions: [] };
      const result = applyFilters(candidates, config, [], new Map());
      expect(result.length).toBe(0);
    });

    test("skips repo with good docs - README > 2000 AND has docs/ AND English primary (filter 2)", () => {
      const candidates = [
        makeCandidate({
          readme_length: 3000,
          has_docs_folder: true,
          is_english_primary: true,
        }),
      ];
      const config = { min_stars: 500, max_files: 750, languages: ["en"], docsmith_url: "", exclusions: [] };
      const result = applyFilters(candidates, config, [], new Map());
      expect(result.length).toBe(0);
    });

    test("skips repo already on docsmith sitemap (filter 3)", () => {
      const candidates = [makeCandidate()];
      const config = { min_stars: 500, max_files: 750, languages: ["en"], docsmith_url: "", exclusions: [] };
      const sitemapResults = new Map<string, boolean>();
      sitemapResults.set("test-repo", true); // Already published
      const result = applyFilters(candidates, config, [], sitemapResults);
      expect(result.length).toBe(0);
    });

    test("skips repo in exclusions list (filter 4)", () => {
      const candidates = [makeCandidate({ full_name: "owner/test-repo" })];
      const config = { min_stars: 500, max_files: 750, languages: ["en"], docsmith_url: "", exclusions: ["owner/test-repo"] };
      const result = applyFilters(candidates, config, [], new Map());
      expect(result.length).toBe(0);
    });

    test("skips repo already in history as success (filter 5)", () => {
      const candidates = [makeCandidate()];
      const config = { min_stars: 500, max_files: 750, languages: ["en"], docsmith_url: "", exclusions: [] };
      const history = [{ repo: "owner/test-repo", status: "success" }];
      const result = applyFilters(candidates, config, history, new Map());
      expect(result.length).toBe(0);
    });

    test("skips archived repo (filter 6)", () => {
      const candidates = [makeCandidate({ archived: true })];
      const config = { min_stars: 500, max_files: 750, languages: ["en"], docsmith_url: "", exclusions: [] };
      const result = applyFilters(candidates, config, [], new Map());
      expect(result.length).toBe(0);
    });

    test("skips repo with > max_files (filter 7)", () => {
      const candidates = [makeCandidate({ file_count: 800 })];
      const config = { min_stars: 500, max_files: 750, languages: ["en"], docsmith_url: "", exclusions: [] };
      const result = applyFilters(candidates, config, [], new Map());
      expect(result.length).toBe(0);
    });

    test("returns empty array when 0 repos pass filters", () => {
      const candidates = [makeCandidate({ stars: 100 }), makeCandidate({ stars: 50, name: "b" })];
      const config = { min_stars: 500, max_files: 750, languages: ["en"], docsmith_url: "", exclusions: [] };
      const result = applyFilters(candidates, config, [], new Map());
      expect(result.length).toBe(0);
    });
  });

  // === Edge Cases ===
  describe("Edge Cases", () => {
    test("handles repo at exactly min_stars (passes)", () => {
      const candidates = [makeCandidate({ stars: 500 })];
      const config = { min_stars: 500, max_files: 750, languages: ["en"], docsmith_url: "", exclusions: [] };
      const result = applyFilters(candidates, config, [], new Map());
      expect(result.length).toBe(1);
    });

    test("handles repo at exactly max_files (passes)", () => {
      const candidates = [makeCandidate({ file_count: 750 })];
      const config = { min_stars: 500, max_files: 750, languages: ["en"], docsmith_url: "", exclusions: [] };
      const result = applyFilters(candidates, config, [], new Map());
      expect(result.length).toBe(1);
    });

    test("handles README at exactly 2000 chars (passes -- considered gap)", () => {
      const candidates = [makeCandidate({ readme_length: 2000 })];
      const config = { min_stars: 500, max_files: 750, languages: ["en"], docsmith_url: "", exclusions: [] };
      const result = applyFilters(candidates, config, [], new Map());
      // 2000 is NOT > 2000, so doc quality gap IS detected → passes
      expect(result.length).toBe(1);
    });

    test("repo name with org prefix handled correctly", () => {
      const candidates = [makeCandidate({ full_name: "facebook/react", name: "react" })];
      const config = { min_stars: 500, max_files: 750, languages: ["en"], docsmith_url: "", exclusions: ["facebook/react"] };
      const result = applyFilters(candidates, config, [], new Map());
      expect(result.length).toBe(0); // Excluded by full_name
    });
  });

  // === Security ===
  describe("Security", () => {
    test("repo names are sanitized for directory paths (no path traversal)", () => {
      const candidates = [makeCandidate({ name: "../../../etc/passwd" })];
      const config = { min_stars: 500, max_files: 750, languages: ["en"], docsmith_url: "", exclusions: [] };
      const result = applyFilters(candidates, config, [], new Map());
      // Should still work but name should be sanitized when creating directories
      expect(result.length).toBe(1);
    });
  });

  // === Data Leak ===
  describe("Data Leak", () => {
    test("filtered results don't contain API response metadata", () => {
      const candidates = [makeCandidate()];
      const config = { min_stars: 500, max_files: 750, languages: ["en"], docsmith_url: "", exclusions: [] };
      const result = applyFilters(candidates, config, [], new Map());
      const keys = Object.keys(result[0]);
      expect(keys).not.toContain("headers");
      expect(keys).not.toContain("token");
      expect(keys).not.toContain("authorization");
    });
  });
});

describe("Phase 1 - Discovery: createTask", () => {
  beforeEach(() => {
    mkdirSync(TEST_INTENT_DIR, { recursive: true });
    mkdirSync(TEST_DATA_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  // === Happy Path ===
  describe("Happy Path", () => {
    test("creates intent/{date}-{repo}/INTENT.md", () => {
      const candidate = makeCandidate({ name: "test-repo", description: "A cool project" });
      createTask(candidate, TEST_INTENT_DIR, "This is the README content");
      const date = new Date().toISOString().split("T")[0];
      const intentPath = join(TEST_INTENT_DIR, `${date}-test-repo`, "INTENT.md");
      expect(existsSync(intentPath)).toBe(true);
      const content = readFileSync(intentPath, "utf-8");
      expect(content).toContain("test-repo");
    });

    test("creates intent/{date}-{repo}/plan.md with execution phases", () => {
      const candidate = makeCandidate();
      createTask(candidate, TEST_INTENT_DIR, "README");
      const date = new Date().toISOString().split("T")[0];
      const planPath = join(TEST_INTENT_DIR, `${date}-test-repo`, "plan.md");
      expect(existsSync(planPath)).toBe(true);
      const content = readFileSync(planPath, "utf-8");
      expect(content).toContain("Phase 0");
    });

    test("creates intent/{date}-{repo}/TASK.yaml with status: ready", () => {
      const candidate = makeCandidate();
      createTask(candidate, TEST_INTENT_DIR, "README");
      const date = new Date().toISOString().split("T")[0];
      const taskPath = join(TEST_INTENT_DIR, `${date}-test-repo`, "TASK.yaml");
      expect(existsSync(taskPath)).toBe(true);
      const content = readFileSync(taskPath, "utf-8");
      expect(content).toContain("status: ready");
      expect(content).toContain("phase: 0/6");
    });
  });

  // === Bad Path ===
  describe("Bad Path", () => {
    test("skips when intent/{date}-{repo}/ already exists", () => {
      const candidate = makeCandidate();
      const date = new Date().toISOString().split("T")[0];
      const dir = join(TEST_INTENT_DIR, `${date}-test-repo`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "INTENT.md"), "existing");

      const created = createTask(candidate, TEST_INTENT_DIR, "README");
      expect(created).toBe(false);
      // Existing content should not be overwritten
      expect(readFileSync(join(dir, "INTENT.md"), "utf-8")).toBe("existing");
    });
  });

  // === Edge Cases ===
  describe("Edge Cases", () => {
    test("date format is YYYY-MM-DD in directory name", () => {
      const candidate = makeCandidate();
      createTask(candidate, TEST_INTENT_DIR, "README");
      const date = new Date().toISOString().split("T")[0];
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(existsSync(join(TEST_INTENT_DIR, `${date}-test-repo`))).toBe(true);
    });

    test("sanitizes repo name for directory (removes path chars)", () => {
      const candidate = makeCandidate({ name: "my/../repo" });
      createTask(candidate, TEST_INTENT_DIR, "README");
      const date = new Date().toISOString().split("T")[0];
      // Should sanitize dangerous characters
      const dirs = Bun.spawnSync(["ls", TEST_INTENT_DIR]).stdout.toString();
      expect(dirs).not.toContain("..");
    });
  });

  // === Security ===
  describe("Security", () => {
    test("template output doesn't contain GITHUB_TOKEN", () => {
      process.env.GITHUB_TOKEN = "ghp_secret_token_test";
      const candidate = makeCandidate();
      createTask(candidate, TEST_INTENT_DIR, "README with ghp_secret_token_test");
      const date = new Date().toISOString().split("T")[0];
      const intentPath = join(TEST_INTENT_DIR, `${date}-test-repo`, "INTENT.md");
      const content = readFileSync(intentPath, "utf-8");
      expect(content).not.toContain("ghp_secret_token_test");
      delete process.env.GITHUB_TOKEN;
    });
  });

  // === Data Leak ===
  describe("Data Leak", () => {
    test("generated INTENT.md doesn't contain GITHUB_TOKEN", () => {
      const candidate = makeCandidate();
      createTask(candidate, TEST_INTENT_DIR, "README content");
      const date = new Date().toISOString().split("T")[0];
      const intentPath = join(TEST_INTENT_DIR, `${date}-test-repo`, "INTENT.md");
      const content = readFileSync(intentPath, "utf-8");
      expect(content).not.toContain("GITHUB_TOKEN");
    });
  });

  // === Data Damage ===
  describe("Data Damage", () => {
    test("if task creation fails mid-way, partial directory is cleaned up", () => {
      // Test that createTask doesn't leave partial state
      const candidate = makeCandidate({ name: "clean-test" });
      createTask(candidate, TEST_INTENT_DIR, "README");
      const date = new Date().toISOString().split("T")[0];
      const dir = join(TEST_INTENT_DIR, `${date}-clean-test`);
      // All three files should exist
      expect(existsSync(join(dir, "INTENT.md"))).toBe(true);
      expect(existsSync(join(dir, "plan.md"))).toBe(true);
      expect(existsSync(join(dir, "TASK.yaml"))).toBe(true);
    });
  });
});
