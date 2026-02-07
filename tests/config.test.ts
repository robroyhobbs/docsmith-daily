import { describe, test, expect } from "bun:test";
import { loadConfig, type Config } from "../src/config";
import { existsSync, writeFileSync, unlinkSync } from "fs";

// --- Phase 0: Config Tests ---

describe("Phase 0 - Config", () => {
  // === Happy Path ===
  describe("Happy Path", () => {
    test("loads config.yaml with min_stars, max_files, languages, exclusions", () => {
      const config = loadConfig();
      expect(config.min_stars).toBe(500);
      expect(config.max_files).toBe(750);
      expect(config.languages).toEqual(["en", "zh", "ja"]);
      expect(config.docsmith_url).toBe("https://docsmith.aigne.io");
      expect(Array.isArray(config.exclusions)).toBe(true);
    });
  });

  // === Bad Path ===
  describe("Bad Path", () => {
    test("throws descriptive error if config file is missing", () => {
      expect(() => loadConfig("/tmp/nonexistent-config-xyz.yaml")).toThrow(
        /config.*not found|ENOENT/i
      );
    });

    test("throws descriptive error if config is malformed YAML", () => {
      const tmpPath = "/tmp/test-bad-config.yaml";
      writeFileSync(tmpPath, "{{{{invalid yaml: [[[");
      try {
        expect(() => loadConfig(tmpPath)).toThrow();
      } finally {
        unlinkSync(tmpPath);
      }
    });
  });

  // === Edge Cases ===
  describe("Edge Cases", () => {
    test("empty exclusions list is valid", () => {
      const tmpPath = "/tmp/test-empty-exclusions.yaml";
      writeFileSync(
        tmpPath,
        "min_stars: 500\nmax_files: 750\nlanguages: [en]\ndocsmith_url: https://docsmith.aigne.io\nexclusions: []\n"
      );
      try {
        const config = loadConfig(tmpPath);
        expect(config.exclusions).toEqual([]);
      } finally {
        unlinkSync(tmpPath);
      }
    });
  });

  // === Data Damage ===
  describe("Data Damage", () => {
    test("config.yaml is read-only, never modified by the system", () => {
      const config = loadConfig();
      // Mutating the returned object should not affect a subsequent load
      config.min_stars = 9999;
      const config2 = loadConfig();
      expect(config2.min_stars).toBe(500);
    });
  });
});
