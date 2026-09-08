import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { McpServerConfig } from "@cursor/sdk";
import { ROOT, config } from "./config.ts";
import { webhookConfigured } from "./webhook.ts";

export type McpFile = Record<string, McpServerConfig>;

function notifyStdio(): McpServerConfig {
  return {
    type: "stdio",
    command: process.execPath,
    args: [join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"), join(ROOT, "src", "discord-mcp.ts")],
    cwd: ROOT,
    env: {
      WEBHOOK_URL: config.webhookUrl,
      WEBHOOK_PROVIDER: config.webhookProvider,
      DISCORD_WEBHOOK_URL: config.discordWebhookUrl || config.webhookUrl,
    },
  };
}

export function loadMcpServers(): McpFile {
  let servers: McpFile = {};
  if (existsSync(config.mcpPath)) {
    const raw = readFileSync(config.mcpPath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      if ("mcpServers" in parsed && parsed.mcpServers && typeof parsed.mcpServers === "object") {
        servers = { ...(parsed.mcpServers as McpFile) };
      } else {
        servers = { ...(parsed as McpFile) };
      }
    }
  }
  if (webhookConfigured()) {
    servers.notify = notifyStdio();
  }
  return servers;
}

export function webhookNotifyConfigured(servers: McpFile): boolean {
  return webhookConfigured() || Object.keys(servers).some((name) => /discord|notify|slack|webhook/i.test(name));
}

/** @deprecated */
export function discordConfigured(servers: McpFile): boolean {
  return webhookNotifyConfigured(servers);
}
