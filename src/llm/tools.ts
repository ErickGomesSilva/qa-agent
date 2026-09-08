import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { sendWebhookNotify, webhookConfigured } from "../webhook.ts";

export type ToolCall = { id: string; name: string; args: Record<string, unknown> };

function inside(cwd: string, requested: string): string {
  const root = resolve(cwd);
  const full = resolve(root, requested);
  const rel = relative(root, full);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`caminho fora do workspace: ${requested}`);
  }
  return full;
}

export const fileTools = [
  {
    type: "function" as const,
    function: {
      name: "list_dir",
      description: "Lista arquivos e pastas de um diretorio relativo ao workspace",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Caminho relativo, ex. requisitos" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "read_file",
      description: "Le um arquivo de texto do workspace",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "write_file",
      description: "Cria ou sobrescreve um arquivo de texto no workspace",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "content"],
      },
    },
  },
];

export function notifyTool() {
  return {
    type: "function" as const,
    function: {
      name: "notify_channel",
      description:
        "Envia parecer PRODUTO ao canal (Discord, Slack, Teams ou webhook). So use depois de gravar PENDENTE.md e se a classe for PRODUTO.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string" },
          us: { type: "string" },
          ca: { type: "string" },
        },
        required: ["content"],
      },
    },
  };
}

/** @deprecated */
export function discordTool() {
  return notifyTool();
}

export async function runTool(
  cwd: string,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  if (name === "list_dir") {
    const dir = inside(cwd, String(args.path ?? "."));
    if (!existsSync(dir)) return "(nao existe)";
    return readdirSync(dir)
      .map((n) => {
        const st = statSync(join(dir, n));
        return `${st.isDirectory() ? "d" : "f"} ${n}`;
      })
      .join("\n");
  }
  if (name === "read_file") {
    const file = inside(cwd, String(args.path ?? ""));
    if (!existsSync(file)) return "(arquivo nao encontrado)";
    return readFileSync(file, "utf8").slice(0, 80_000);
  }
  if (name === "write_file") {
    const file = inside(cwd, String(args.path ?? ""));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, String(args.content ?? ""), "utf8");
    return `gravado ${relative(cwd, file)}`;
  }
  if (name === "notify_channel" || name === "discord_notify") {
    if (!webhookConfigured()) return "Webhook nao configurado";
    try {
      await sendWebhookNotify({
        content: String(args.content ?? ""),
        us: args.us ? String(args.us) : undefined,
        ca: args.ca ? String(args.ca) : undefined,
      });
      return "enviado";
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }
  return `ferramenta desconhecida: ${name}`;
}
