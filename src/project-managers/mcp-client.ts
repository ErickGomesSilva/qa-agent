import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { loadMcpServers, type McpFile } from "../mcp.ts";
import { McpError } from "./types.ts";

/**
 * Interface mínima para chamar tools de um servidor MCP.
 * Injetável — os testes usam um fake, nunca rede real nem servidor de verdade.
 */
export type McpToolCaller = {
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
};

export type McpClientOptions = {
  /** ms; padrão 20s por chamada. */
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 20_000;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Sanitiza mensagens de erro para nunca vazar segredos (headers, tokens, URLs com auth). */
export function sanitizeErrorMessage(raw: string): string {
  return raw
    .replace(/\/\/[^/\s:@]+:[^@\s]+@/g, "//***:***@")
    .replace(/\bbearer\s+\S+/gi, "bearer ***")
    .replace(/(authorization|token|api[_-]?key|secret|password|senha)\s*[:=]\s*\S+/gi, "$1=***")
    .replace(/[A-Za-z0-9_-]{16,}/g, (m) => (m.length > 20 ? `${m.slice(0, 6)}...***` : m))
    .slice(0, 2000);
}

function classifyConnectError(err: unknown, provider: string): McpError {
  const msg = err instanceof Error ? err.message : String(err);
  const sanitized = sanitizeErrorMessage(msg);
  if (/401|403|unauthorized|forbidden|auth/i.test(msg)) return new McpError("auth", sanitized, provider);
  if (/timeout|timed out|ETIMEDOUT/i.test(msg)) return new McpError("timeout", sanitized, provider);
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|network/i.test(msg)) return new McpError("network", sanitized, provider);
  if (/tool.*not.*found|unknown tool|no such tool/i.test(msg)) return new McpError("tool_missing", sanitized, provider);
  return new McpError("invalid_response", sanitized, provider);
}

class RealMcpToolCaller implements McpToolCaller {
  private client: Client | undefined;
  private connecting: Promise<Client> | undefined;

  constructor(
    private readonly serverName: string,
    private readonly serverConfig: Record<string, unknown>,
    private readonly opts: McpClientOptions,
  ) {}

  private async connect(): Promise<Client> {
    if (this.client) return this.client;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      const client = new Client({ name: "qa-agent", version: "1.0.0" });
      const transport = this.buildTransport();
      try {
        await client.connect(transport);
      } catch (err) {
        throw classifyConnectError(err, this.serverName);
      }
      this.client = client;
      return client;
    })();
    return this.connecting;
  }

  private buildTransport() {
    const cfg = this.serverConfig;
    const type = typeof cfg.type === "string" ? cfg.type : undefined;
    if (type === "stdio" || (typeof cfg.command === "string" && !cfg.url)) {
      const command = String(cfg.command ?? "");
      if (!command) {
        throw new McpError("invalid_response", `Servidor MCP '${this.serverName}' sem 'command' (stdio)`, this.serverName);
      }
      const args = Array.isArray(cfg.args) ? cfg.args.map(String) : [];
      const env = isRecord(cfg.env)
        ? Object.fromEntries(Object.entries(cfg.env).map(([k, v]) => [k, String(v)]))
        : undefined;
      return new StdioClientTransport({
        command,
        args,
        cwd: typeof cfg.cwd === "string" ? cfg.cwd : undefined,
        env,
      });
    }
    const url = typeof cfg.url === "string" ? cfg.url : undefined;
    if (url) {
      return new StreamableHTTPClientTransport(new URL(url));
    }
    throw new McpError(
      "invalid_response",
      `Servidor MCP '${this.serverName}' não tem configuração reconhecida (stdio/http)`,
      this.serverName,
    );
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const client = await this.connect();
    const timeoutMs = this.opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    try {
      const result = await Promise.race([
        client.callTool({ name, arguments: args }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new McpError("timeout", `Tool '${name}' excedeu ${timeoutMs}ms`, this.serverName)), timeoutMs),
        ),
      ]);
      return result;
    } catch (err) {
      if (err instanceof McpError) throw err;
      throw classifyConnectError(err, this.serverName);
    }
  }
}

/** Constrói um caller real a partir de mcp.json (reaproveita infra existente de src/mcp.ts). */
export function createMcpToolCaller(serverName: string, opts: McpClientOptions = {}): McpToolCaller {
  const servers: McpFile = loadMcpServers();
  const cfg = servers[serverName] as unknown as Record<string, unknown> | undefined;
  if (!cfg) {
    throw new McpError(
      "provider_not_found",
      `Servidor MCP '${serverName}' não está configurado em mcp.json`,
      serverName,
    );
  }
  return new RealMcpToolCaller(serverName, cfg, opts);
}
