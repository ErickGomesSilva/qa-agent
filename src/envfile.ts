import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { ROOT } from "./config.ts";
import { join } from "node:path";

const envPath = join(ROOT, ".env");

function escapeEnvValue(value: string): string {
  if (/[\s#"']/.test(value) || value.includes("=") && value.includes(" ")) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}

/** Atualiza chaves no .env sem apagar o resto. Também aplica em process.env. */
export function upsertEnv(updates: Record<string, string>): void {
  let text = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  if (text && !text.endsWith("\n")) text += "\n";

  for (const [key, raw] of Object.entries(updates)) {
    process.env[key] = raw;
    const line = `${key}=${escapeEnvValue(raw)}`;
    const re = new RegExp(`^${key}=.*$`, "m");
    if (re.test(text)) text = text.replace(re, line);
    else text += `${line}\n`;
  }

  writeFileSync(envPath, text, "utf8");
}
