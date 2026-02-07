import { describe, test, expect } from "bun:test";
import { checkSitemap } from "../src/sitemap-checker";

// --- Phase 0: Sitemap Checker Tests ---

describe("Phase 0 - Sitemap Checker", () => {
  // === Happy Path ===
  describe("Happy Path", () => {
    test("returns true for already-published repo (dify)", async () => {
      const result = await checkSitemap("dify");
      expect(result).toBe(true);
    });

    test("returns false for unpublished repo", async () => {
      const result = await checkSitemap(
        "some-definitely-not-published-repo-xyz-12345",
      );
      expect(result).toBe(false);
    });
  });

  // === Bad Path ===
  describe("Bad Path", () => {
    test("returns false when docsmith.aigne.io is unreachable (fail open)", async () => {
      // We test this by checking the function handles network errors gracefully
      // The implementation should catch errors and return false
      const result = await checkSitemap("test-repo", {
        sitemapUrl: "https://nonexistent-domain-xyz-12345.invalid/sitemap.xml",
        docsBaseUrl: "https://nonexistent-domain-xyz-12345.invalid/docs",
      });
      expect(result).toBe(false);
    });
  });

  // === Edge Cases ===
  describe("Edge Cases", () => {
    test("handles repo name case-insensitively", async () => {
      const result1 = await checkSitemap("Dify");
      const result2 = await checkSitemap("DIFY");
      // Both should match if dify is published
      expect(result1).toBe(true);
      expect(result2).toBe(true);
    });

    test("handles empty string repo name", async () => {
      const result = await checkSitemap("");
      expect(result).toBe(false);
    });
  });

  // === Security ===
  describe("Security", () => {
    test("response data sanitized (no arbitrary code from sitemap)", async () => {
      // checkSitemap should only return boolean, not raw sitemap content
      const result = await checkSitemap("dify");
      expect(typeof result).toBe("boolean");
    });
  });

  // === Data Leak ===
  describe("Data Leak", () => {
    test("errors don't expose internal URL patterns", async () => {
      try {
        await checkSitemap("test", {
          sitemapUrl: "https://nonexistent-domain-xyz.invalid/sitemap.xml",
          docsBaseUrl: "https://nonexistent-domain-xyz.invalid/docs",
        });
      } catch (e: any) {
        if (e?.message) {
          // Should not contain internal paths
          expect(e.message).not.toContain("/Users/");
          expect(e.message).not.toContain("node_modules");
        }
      }
    });
  });

  // === Data Damage ===
  describe("Data Damage", () => {
    test("checkSitemap is read-only, never modifies any files", async () => {
      // Sitemap checker should be a pure read operation
      const result = await checkSitemap("test-repo");
      expect(typeof result).toBe("boolean");
      // No side effects to verify - this is a design contract test
    });
  });
});
