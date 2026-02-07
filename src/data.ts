import { readFileSync, writeFileSync, renameSync, existsSync } from "fs";
import { dirname, join } from "path";

export function readHistory(path: string): any[] {
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function writeHistory(path: string, data: any[]): void {
  const tmp = path + ".tmp";
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, path);
}

export function readCandidates(path: string): any[] {
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function writeCandidates(path: string, data: any[]): void {
  const tmp = path + ".tmp";
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, path);
}
