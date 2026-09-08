import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { config } from "./config.ts";
import { listLlmModels, llmApiKey } from "./llm/run.ts";
import { loadMcpServers } from "./mcp.ts";
import { startRun, requestCancel } from "./orchestrator.ts";
import { activeRun, getRun, listRuns } from "./store.ts";
import type { CreateRunBody } from "./types.ts";

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(json);
}

function unauthorized(req: IncomingMessage): boolean {
  if (!config.qaAgentToken) return false;
  const header = req.headers.authorization ?? "";
  return header !== `Bearer ${config.qaAgentToken}`;
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function startServer(): void {
  if (config.host !== "127.0.0.1" && config.host !== "localhost") {
    console.warn(
      `[qa-agent] HOST=${config.host} — esta API carrega a API key do agente. Prefira 127.0.0.1.`,
    );
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${config.host}:${config.port}`);
      const method = req.method ?? "GET";

      if (url.pathname === "/healthz" && method === "GET") {
        send(res, 200, {
          ok: true,
          bind: `${config.host}:${config.port}`,
          llmProvider: config.llmProvider,
          llmKey: Boolean(llmApiKey()),
          workspace: config.workspaceDir,
          scripts: join(config.workspaceDir, "scripts"),
          mcp: Object.keys(loadMcpServers()),
          webhook: Boolean(config.webhookUrl),
          webhookProvider: config.webhookProvider,
          discordWebhook: Boolean(config.discordWebhookUrl || config.webhookUrl),
          activeRunId: activeRun()?.id ?? null,
        });
        return;
      }

      if (unauthorized(req)) {
        send(res, 401, { error: "Bearer QA_AGENT_TOKEN obrigatório" });
        return;
      }

      if (url.pathname === "/v1/models" && method === "GET") {
        if (!llmApiKey()) {
          send(res, 400, { error: "API key ausente (F1)" });
          return;
        }
        const models = await listLlmModels();
        send(res, 200, models);
        return;
      }

      if (url.pathname === "/v1/runs" && method === "GET") {
        send(res, 200, { runs: listRuns() });
        return;
      }

      if (url.pathname === "/v1/runs" && method === "POST") {
        const body = (await readJson(req)) as CreateRunBody;
        try {
          const run = await startRun(body);
          send(res, 202, run);
        } catch (err) {
          const status = (err as { status?: number }).status ?? 400;
          send(res, status, { error: err instanceof Error ? err.message : String(err) });
        }
        return;
      }

      const one = url.pathname.match(/^\/v1\/runs\/([^/]+)$/);
      if (one && method === "GET") {
        const run = getRun(one[1] ?? "");
        if (!run) {
          send(res, 404, { error: "run não encontrada" });
          return;
        }
        send(res, 200, run);
        return;
      }

      const cancel = url.pathname.match(/^\/v1\/runs\/([^/]+)\/cancel$/);
      if (cancel && method === "POST") {
        const ok = requestCancel(cancel[1] ?? "");
        send(res, ok ? 202 : 404, ok ? { ok: true } : { error: "run não encontrada" });
        return;
      }

      send(res, 404, { error: "rota não encontrada" });
    } catch (err) {
      send(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  });

  server.listen(config.port, config.host, () => {
    console.log(`[qa-agent] http://${config.host}:${config.port}`);
    console.log("[qa-agent] GET  /healthz");
    console.log("[qa-agent] GET  /v1/models     (modelos da chave configurada)");
    console.log("[qa-agent] POST /v1/runs       { requisitosPath, baseUrl, authKind?, login?, senha?, credentialsMd? }");
    console.log("[qa-agent] GET  /v1/runs/:id");
  });
}
