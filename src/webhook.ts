import { config } from "./config.ts";

export type WebhookProvider = "discord" | "slack" | "teams" | "generic";

export type WebhookNotifyPayload = {
  content: string;
  us?: string;
  ca?: string;
};

export function detectWebhookProvider(url: string): WebhookProvider {
  const u = url.trim().toLowerCase();
  if (u.includes("discord.com/api/webhooks")) return "discord";
  if (u.includes("hooks.slack.com/services")) return "slack";
  if (u.includes("office.com/webhook") || u.includes("office365.com/webhook")) return "teams";
  return "generic";
}

export function isValidWebhookUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const u = new URL(trimmed);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

export function webhookProviderLabel(provider: WebhookProvider): string {
  switch (provider) {
    case "discord":
      return "Discord";
    case "slack":
      return "Slack";
    case "teams":
      return "Microsoft Teams";
    default:
      return "Webhook";
  }
}

function titleFromPayload(payload: WebhookNotifyPayload): string {
  const ids = [payload.us, payload.ca].filter(Boolean).join(" ");
  return ids ? `PRODUTO — ${ids}` : "PRODUTO — falha comprovada no codigo";
}

function buildBody(provider: WebhookProvider, payload: WebhookNotifyPayload): Record<string, unknown> {
  const title = titleFromPayload(payload);
  const text = payload.content.slice(0, 4000);

  switch (provider) {
    case "slack":
      return {
        text: `*${title}*`,
        blocks: [
          { type: "header", text: { type: "plain_text", text: title, emoji: false } },
          { type: "section", text: { type: "mrkdwn", text } },
        ],
      };
    case "teams":
      return {
        "@type": "MessageCard",
        "@context": "https://schema.org/extensions",
        summary: title,
        themeColor: "C0392B",
        title,
        text,
      };
    case "discord":
      return {
        username: "QA-Agent",
        allowed_mentions: { parse: [] },
        embeds: [{ title, description: text, color: 0xc0392b }],
      };
    default:
      return { title, text, content: text, message: text };
  }
}

export async function sendWebhookNotify(payload: WebhookNotifyPayload): Promise<string> {
  const url = config.webhookUrl.trim();
  if (!isValidWebhookUrl(url)) {
    throw new Error("WEBHOOK_URL ausente ou invalida no .env da QA-Agent");
  }
  const provider = config.webhookProvider || detectWebhookProvider(url);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildBody(provider, payload)),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${webhookProviderLabel(provider)} webhook HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return `enviado (${res.status})`;
}

export function webhookConfigured(): boolean {
  return isValidWebhookUrl(config.webhookUrl);
}
