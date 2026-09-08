import { configureCursorSdk } from "@cursor/sdk";

let configured = false;

/** Evita ECONNRESET em ClientHttp2Session (stream do agente local). */
export function initCursorSdk(): void {
  if (configured) return;
  configured = true;

  const raw = (process.env.CURSOR_USE_HTTP1 ?? "true").trim().toLowerCase();
  const useHttp1 = !["0", "false", "no", "nao", "não"].includes(raw);
  if (useHttp1) {
    configureCursorSdk({ local: { useHttp1ForAgent: true } });
  }
}

initCursorSdk();
