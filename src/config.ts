import { readFileSync } from "fs";
import { parse } from "yaml";
import { resolve } from "path";

export interface Config {
  min_stars: number;
  max_files: number;
  languages: string[];
  docsmith_url: string;
  exclusions: string[];
}

const DEFAULT_CONFIG_PATH = resolve(
  import.meta.dir,
  "..",
  "config.yaml"
);

export function loadConfig(configPath?: string): Config {
  const path = configPath || DEFAULT_CONFIG_PATH;

  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (e: any) {
    throw new Error(`Config not found: ${path}`);
  }

  const parsed = parse(raw);

  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Config is invalid YAML at: ${path}`);
  }

  const config: Config = {
    min_stars: parsed.min_stars ?? 500,
    max_files: parsed.max_files ?? 750,
    languages: parsed.languages ?? ["en"],
    docsmith_url: parsed.docsmith_url ?? "https://docsmith.aigne.io",
    exclusions: parsed.exclusions ?? [],
  };

  return config;
}
