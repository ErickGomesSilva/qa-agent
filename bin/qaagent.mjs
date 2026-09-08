#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tsx = join(root, "node_modules", "tsx", "dist", "cli.mjs");
const entry = join(root, "src", "index.ts");

const child = spawn(process.execPath, [tsx, entry, ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
  windowsHide: false,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
