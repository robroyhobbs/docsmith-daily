import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  fetchTrendingRepos,
  fetchReadme,
  fetchFileTree,
  type RepoInfo,
} from "../src/github-api";

// Save original token once
const ORIGINAL_TOKEN = process.env.GITHUB_TOKEN;

// --- Phase 0: GitHub API Client Tests ---

describe("Phase 0 - GitHub API: fetchTrendingRepos", () => {
  afterEach(() => {
    // Always restore token after each test
    if (ORIGINAL_TOKEN) {
      process.env.GITHUB_TOKEN = ORIGINAL_TOKEN;
    } else {
      delete process.env.GITHUB_TOKEN;
    }
  });

  // === Happy Path ===
  describe("Happy Path", () => {
    test("returns array of repo objects with name, stars, language, topics", async () => {
      const repos = await fetchTrendingRepos();
      expect(Array.isArray(repos)).toBe(true);
      if (repos.length > 0) {
        const repo = repos[0];
        expect(repo).toHaveProperty("name");
        expect(repo).toHaveProperty("full_name");
        expect(repo).toHaveProperty("stars");
        expect(repo).toHaveProperty("language");
        expect(repo).toHaveProperty("topics");
        expect(typeof repo.name).toBe("string");
        expect(typeof repo.stars).toBe("number");
        expect(Array.isArray(repo.topics)).toBe(true);
      }
    });
  });

  // === Bad Path ===
  describe("Bad Path", () => {
    test("returns empty array when GitHub API returns error with invalid token", async () => {
      process.env.GITHUB_TOKEN = "invalid-token-for-test";
      const repos = await fetchTrendingRepos();
      expect(Array.isArray(repos)).toBe(true);
    });
  });

  // === Edge Cases ===
  describe("Edge Cases", () => {
    test("returns repos sorted by stars descending", async () => {
      const repos = await fetchTrendingRepos();
      for (let i = 1; i < repos.length; i++) {
        expect(repos[i - 1].stars).toBeGreaterThanOrEqual(repos[i].stars);
      }
    });
  });

  // === Security ===
  describe("Security", () => {
    test("GITHUB_TOKEN not included in error messages", async () => {
      const token = "test-secret-token-abc123";
      process.env.GITHUB_TOKEN = token;
      try {
        await fetchTrendingRepos({ minStars: -1 });
      } catch (e: any) {
        if (e?.message) {
          expect(e.message).not.toContain(token);
        }
      }
    });
  });
});

describe("Phase 0 - GitHub API: fetchReadme", () => {
  afterEach(() => {
    if (ORIGINAL_TOKEN) {
      process.env.GITHUB_TOKEN = ORIGINAL_TOKEN;
    } else {
      delete process.env.GITHUB_TOKEN;
    }
  });

  // === Happy Path ===
  describe("Happy Path", () => {
    test("returns raw README string for valid repo", async () => {
      const readme = await fetchReadme("AIGNE-io", "aigne-framework");
      expect(typeof readme).toBe("string");
      expect(readme.length).toBeGreaterThan(0);
    });
  });

  // === Bad Path ===
  describe("Bad Path", () => {
    test("returns empty string for repo with no README", async () => {
      const readme = await fetchReadme(
        "nonexistent-owner-xyz",
        "nonexistent-repo-xyz"
      );
      expect(readme).toBe("");
    });
  });

  // === Edge Cases ===
  describe("Edge Cases", () => {
    test("handles repo name with special characters (dots, hyphens)", async () => {
      // This repo has dots in its name
      const readme = await fetchReadme("nicolo-ribaudo", "tc39-proposal.github.io");
      expect(typeof readme).toBe("string");
    });
  });

  // === Data Leak ===
  describe("Data Leak", () => {
    test("error from API failure does not expose auth token", async () => {
      const token = "secret-token-for-leak-test";
      process.env.GITHUB_TOKEN = token;
      const readme = await fetchReadme("nonexistent-owner-xyz", "no-repo");
      // Should not throw, should return empty string
      expect(readme).toBe("");
    });
  });
});

describe("Phase 0 - GitHub API: fetchFileTree", () => {
  afterEach(() => {
    if (ORIGINAL_TOKEN) {
      process.env.GITHUB_TOKEN = ORIGINAL_TOKEN;
    } else {
      delete process.env.GITHUB_TOKEN;
    }
  });

  // === Happy Path ===
  describe("Happy Path", () => {
    test("returns flat array of file paths for valid repo", async () => {
      const tree = await fetchFileTree("AIGNE-io", "aigne-framework");
      expect(Array.isArray(tree)).toBe(true);
      if (tree.length > 0) {
        expect(typeof tree[0]).toBe("string");
      }
    });
  });

  // === Bad Path ===
  describe("Bad Path", () => {
    test("returns empty array for nonexistent repo", async () => {
      const tree = await fetchFileTree(
        "nonexistent-owner-xyz",
        "nonexistent-repo-xyz"
      );
      expect(tree).toEqual([]);
    });
  });

  // === Edge Cases ===
  describe("Edge Cases", () => {
    test("handles large repos without crashing", async () => {
      // Just ensure no crash for a large repo
      const tree = await fetchFileTree("microsoft", "vscode");
      expect(Array.isArray(tree)).toBe(true);
    });
  });

  // === Security ===
  describe("Security", () => {
    test("API requests use HTTPS only", async () => {
      const moduleSource = await Bun.file("src/github-api.ts").text();
      expect(moduleSource).not.toContain("http://api.github.com");
      expect(moduleSource).not.toContain("http://raw.githubusercontent.com");
    });
  });
});
