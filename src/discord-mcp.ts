import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config as loadDotenv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { sendWebhookNotify, webhookConfigured, webhookProviderLabel } from "./webhook.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
loadDotenv({ path: join(root, ".env") });

const notifySchema = {
  content: z
    .string()
    .min(1)
    .max(2000)
    .describe("Texto do parecer (US/CA, Entao que falhou, evidencia de que nao e seletor)"),
  us: z.string().optional().describe("ID da US, ex. US_UXP_002"),
  ca: z.string().optional().describe("ID do CA, ex. CA01"),
};

const notifyDescription =
  "Envia o parecer de QA ao canal configurado (Discord, Slack, Teams ou webhook generico). Use SOMENTE quando a triagem for PRODUTO e scripts/falhas/PENDENTE.md ja estiver gravado. Nao use para TESTE, MASSA, AMBIENTE ou INCONCLUSIVO.";

async function handleNotify(args: { content: string; us?: string; ca?: string }) {
  if (!webhookConfigured()) {
    throw new Error("WEBHOOK_URL ausente ou invalida no .env da QA-Agent");
  }
  const status = await sendWebhookNotify(args);
  const label = webhookProviderLabel(
    (process.env.WEBHOOK_PROVIDER as "discord" | "slack" | "teams" | "generic") || "generic",
  );
  return { content: [{ type: "text" as const, text: `${label}: ${status}` }] };
}

const server = new McpServer({
  name: "notify",
  version: "2.0.0",
});

server.registerTool(
  "notify_channel",
  {
    title: "Notificar canal",
    description: notifyDescription,
    inputSchema: notifySchema,
  },
  async (args) => handleNotify(args),
);

server.registerTool(
  "discord_notify",
  {
    title: "Notificar Discord (legado)",
    description: notifyDescription,
    inputSchema: notifySchema,
  },
  async (args) => handleNotify(args),
);

const transport = new StdioServerTransport();
await server.connect(transport);
