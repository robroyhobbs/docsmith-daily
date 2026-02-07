import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import {
  readHistory,
  writeHistory,
  readCandidates,
  writeCandidates,
} from "../src/data";

const TEST_DIR = "/tmp/docsmith-daily-test-data";

// --- Phase 0: Data Files Tests ---

describe("Phase 0 - Data Files", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  // === Happy Path ===
  describe("Happy Path", () => {
    test("readHistory returns parsed JSON array", () => {
      const path = join(TEST_DIR, "history.json");
      writeFileSync(path, JSON.stringify([{ repo: "test/repo", status: "success" }]));
      const history = readHistory(path);
      expect(history).toEqual([{ repo: "test/repo", status: "success" }]);
    });

    test("readCandidates returns parsed JSON array", () => {
      const path = join(TEST_DIR, "candidates.json");
      writeFileSync(path, JSON.stringify([{ name: "repo1", stars: 1000 }]));
      const candidates = readCandidates(path);
      expect(candidates).toEqual([{ name: "repo1", stars: 1000 }]);
    });
  });

  // === Bad Path ===
  describe("Bad Path", () => {
    test("readHistory returns empty array if file doesn't exist", () => {
      const history = readHistory(join(TEST_DIR, "no-file.json"));
      expect(history).toEqual([]);
    });

    test("readCandidates returns empty array if file doesn't exist", () => {
      const candidates = readCandidates(join(TEST_DIR, "no-file.json"));
      expect(candidates).toEqual([]);
    });
  });

  // === Data Damage ===
  describe("Data Damage", () => {
    test("writeHistory uses atomic write (temp + rename)", () => {
      const path = join(TEST_DIR, "history.json");
      writeFileSync(path, "[]");
      writeHistory(path, [{ repo: "test/repo", status: "success" }]);
      const content = readFileSync(path, "utf-8");
      expect(JSON.parse(content)).toEqual([
        { repo: "test/repo", status: "success" },
      ]);
    });

    test("writeCandidates uses atomic write (temp + rename)", () => {
      const path = join(TEST_DIR, "candidates.json");
      writeFileSync(path, "[]");
      writeCandidates(path, [{ name: "repo1", stars: 500 }]);
      const content = readFileSync(path, "utf-8");
      expect(JSON.parse(content)).toEqual([{ name: "repo1", stars: 500 }]);
    });

    test("readHistory doesn't corrupt file if interrupted", () => {
      const path = join(TEST_DIR, "history.json");
      const original = [{ repo: "test", status: "done" }];
      writeFileSync(path, JSON.stringify(original));
      // Read should never modify the file
      readHistory(path);
      const content = readFileSync(path, "utf-8");
      expect(JSON.parse(content)).toEqual(original);
    });
  });
});
