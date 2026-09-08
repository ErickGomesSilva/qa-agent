import { stripAnsi, visibleWidth } from "./theme.ts";

/** Quebra texto respeitando largura visivel (ignora sequencias ANSI). */
export function wrapVisible(text: string, width: number): string[] {
  if (width < 8) width = 8;
  const plain = stripAnsi(text);
  if (!plain) return [""];

  const lines: string[] = [];
  const words = plain.split(/(\s+)/);
  let current = "";

  const flush = () => {
    if (current || lines.length === 0) lines.push(current);
    current = "";
  };

  for (const word of words) {
    if (!word) continue;
    if (word.includes("\n")) {
      const parts = word.split("\n");
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]!;
        if (part) {
          const candidate = current ? current + part : part;
          if (visibleWidth(candidate) <= width) current = candidate;
          else {
            if (current) flush();
            if (visibleWidth(part) <= width) current = part;
            else {
              for (let j = 0; j < part.length; ) {
                let chunk = "";
                while (j < part.length && visibleWidth(chunk + part[j]) <= width) {
                  chunk += part[j];
                  j++;
                }
                if (!chunk) {
                  chunk = part[j] ?? "";
                  j++;
                }
                lines.push(chunk);
              }
            }
          }
        }
        if (i < parts.length - 1) flush();
      }
      continue;
    }

    const candidate = current ? current + word : word;
    if (visibleWidth(candidate) <= width) {
      current = candidate;
    } else {
      if (current.trim()) flush();
      if (visibleWidth(word.trim()) <= width) {
        current = word.trimStart();
      } else {
        const raw = word.trim();
        for (let i = 0; i < raw.length; ) {
          let chunk = "";
          while (i < raw.length && visibleWidth(chunk + raw[i]) <= width) {
            chunk += raw[i];
            i++;
          }
          if (!chunk) {
            chunk = raw[i] ?? "";
            i++;
          }
          lines.push(chunk);
        }
        current = "";
      }
    }
  }
  flush();
  return lines.length ? lines : [""];
}

/** Junta fragmentos de streaming do agente em linhas legiveis. */
export function coalesceLogLines(raw: string[]): string[] {
  const out: string[] = [];
  let buf = "";

  const pushBuf = () => {
    const t = buf.trim();
    if (t) out.push(t);
    buf = "";
  };

  for (const line of raw) {
    const body = line.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*/, "").trim();
    if (!body) continue;

    const isEvent =
      /^(agentId=|runId=|Playwright rodada|suíte|suite|triagem|erro fatal|sincronizando|sem scripts|regenerate|disparando|TESTE corrigido|Gerando scripts|Exploracao|Agente de|provedor=|Instalando Chromium|Fim:|End:|──|━━)/i.test(
        body,
      ) || body.startsWith("Script de testes") || body.startsWith("Test scripts");

    if (isEvent) {
      pushBuf();
      out.push(body);
      continue;
    }

    if (!buf) {
      buf = body;
    } else if (body.length < 48 && !/[.!?]$/.test(buf)) {
      buf += body;
    } else {
      pushBuf();
      buf = body;
    }
  }
  pushBuf();
  return out;
}

export function applyStyleToPlainLines(plainLines: string[], style: string, reset: string): string[] {
  return plainLines.map((l) => `${style}${l}${reset}`);
}
