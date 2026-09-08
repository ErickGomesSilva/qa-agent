/** Rótulos e parsing de linhas de log para telemetria da rodada (TUI F8). */

export type RunTelemetry = {
  phase: string;
  detail: string;
};

const PHASE_MARK = /^▸\s*fase:\s*(.+?)(?:\s*—\s*(.+))?$/i;

export function formatElapsed(startedAt: number | undefined, now = Date.now()): string {
  if (!startedAt) return "0s";
  const sec = Math.max(0, Math.floor((now - startedAt) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem ? `${min}m ${rem}s` : `${min}m`;
}

export function applyRunTelemetry(prev: RunTelemetry, line: string): RunTelemetry {
  const trimmed = line.trim();
  if (!trimmed) return prev;

  const marked = trimmed.match(PHASE_MARK);
  if (marked) {
    return {
      phase: marked[1]?.trim() || prev.phase,
      detail: marked[2]?.trim() || prev.detail,
    };
  }

  if (/^sincronizando requisitos/i.test(trimmed)) {
    return { phase: "Preparacao", detail: "Sincronizando requisitos no workspace" };
  }
  if (/^sem scripts|^regenerate=true|^Gerando scripts/i.test(trimmed)) {
    return { phase: "Gerando specs", detail: trimmed };
  }
  if (/^Exploracao de logica/i.test(trimmed)) {
    return { phase: "Crawler UI", detail: "Mapeando rotas, console e erros HTTP" };
  }
  if (/^crawler:/i.test(trimmed)) {
    return { phase: "Crawler UI", detail: trimmed.replace(/^crawler:\s*/i, "") };
  }
  if (/^login:/i.test(trimmed)) {
    return { phase: "Crawler UI", detail: trimmed };
  }
  if (/^Agente de logica/i.test(trimmed)) {
    return { phase: "Agente IA", detail: "Analisando RNs e achados do crawler" };
  }
  if (/^agentId=/i.test(trimmed)) {
    return { phase: "Agente IA", detail: `${trimmed} — iniciando…` };
  }
  if (/^runId=/i.test(trimmed)) {
    return { phase: "Agente IA", detail: `${trimmed} — processando (pode levar minutos)` };
  }
  if (/^agente:/i.test(trimmed)) {
    return { phase: "Agente IA", detail: trimmed.replace(/^agente:\s*/i, "") };
  }
  if (/^auditoria|^AUDITORIA|classificando specs/i.test(trimmed)) {
    return { phase: "Auditoria", detail: trimmed };
  }
  if (/^credenciais:/i.test(trimmed)) {
    return { phase: "Credenciais", detail: trimmed.replace(/^credenciais:\s*/i, "") };
  }
  if (/^sessao Playwright|^credenciais ou URL mudaram/i.test(trimmed)) {
    return { phase: "Sessao E2E", detail: trimmed };
  }
  if (/^Playwright rodada/i.test(trimmed)) {
    return { phase: "Playwright", detail: trimmed.replace(/^Playwright rodada\s*/i, "Rodada ") };
  }
  if (/^Running \d+ test/i.test(trimmed)) {
    return { phase: "Playwright", detail: trimmed };
  }
  if (/^[✓✘±]\s*\d+/u.test(trimmed) || /\]\s*›\s*.+\.spec\.ts/i.test(trimmed)) {
    const testId = trimmed.match(/(US_[A-Z0-9_]+\s+CA\d+)/);
    return {
      phase: "Playwright",
      detail: testId ? testId[1]! : trimmed.slice(0, 100),
    };
  }
  if (/^Playwright concluido/i.test(trimmed)) {
    return { phase: "Playwright", detail: trimmed.replace(/^Playwright concluido:\s*/i, "") };
  }
  if (/^su[ií]te parada|^su[ií]te permanece/i.test(trimmed)) {
    return { phase: "Playwright", detail: trimmed };
  }
  if (/^disparando agente \(triagem/i.test(trimmed)) {
    return { phase: "Triagem IA", detail: "Classificando falha (TESTE/PRODUTO/MASSA…)" };
  }
  if (/^triagem classe=/i.test(trimmed)) {
    return { phase: "Triagem IA", detail: trimmed.replace(/^triagem\s*/i, "") };
  }
  if (/^k6:/i.test(trimmed)) {
    return { phase: "Carga k6", detail: trimmed.replace(/^k6:\s*/i, "") };
  }
  if (/^Instalando Chromium/i.test(trimmed)) {
    return { phase: "Preparacao", detail: trimmed };
  }
  if (/^unblock-massa:/i.test(trimmed)) {
    return { phase: "Massa E2E", detail: trimmed.replace(/^unblock-massa:\s*/i, "") };
  }
  if (/^tour:/i.test(trimmed) || /^jornada gravada/i.test(trimmed)) {
    return { phase: "Jornada", detail: trimmed.replace(/^tour:\s*/i, "") };
  }

  return prev;
}

export function isPlaywrightStreamLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.startsWith("{")) return false;
  if (/^Running \d+ test/i.test(t)) return true;
  if (/^[✓✘±-]/u.test(t)) return true;
  if (/\]\s*›\s*.+\.spec\.ts/i.test(t)) return true;
  if (/^\d+ (passed|failed|skipped|flaky)/i.test(t)) return true;
  if (/^Error:/i.test(t)) return true;
  return false;
}

export function formatPlaywrightStreamLine(line: string): string | undefined {
  const t = line.trim();
  if (!isPlaywrightStreamLine(t)) return undefined;
  const testId = t.match(/(US_[A-Z0-9_]+\s+CA\d+)/);
  if (testId) return `▸ ${testId[1]}`;
  if (/^[✓✘±]/u.test(t)) return t.slice(0, 120);
  return t.slice(0, 120);
}
