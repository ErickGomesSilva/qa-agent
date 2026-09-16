import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./config.ts";

let cached: string | undefined;

/** Versão do package.json da instalação atual (cacheada). */
export function appVersion(): string {
  if (cached) return cached;
  try {
    const raw = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version?: string };
    cached = raw.version ?? "0.0.0";
  } catch {
    cached = "0.0.0";
  }
  return cached;
}
