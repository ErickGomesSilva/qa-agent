export type AgentEventKind = "phase" | "tool" | "text" | "beat" | "meta" | "error" | "info";

export type AgentEvent = {
  at: number;
  kind: AgentEventKind;
  text: string;
};

export type AgentTelemetrySnapshot = {
  events: AgentEvent[];
  provider: string;
  model: string;
  phase: string;
  startedAt: number | undefined;
  lastAt: number | undefined;
  toolCount: number;
  round: number;
  active: boolean;
};

const MAX_EVENTS = 500;

let events: AgentEvent[] = [];
let provider = "";
let model = "";
let phase = "";
let startedAt: number | undefined;
let lastAt: number | undefined;
let toolCount = 0;
let round = 0;
let active = false;
let listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

export function subscribeAgentTelemetry(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function clearAgentTelemetry(): void {
  events = [];
  provider = "";
  model = "";
  phase = "";
  startedAt = undefined;
  lastAt = undefined;
  toolCount = 0;
  round = 0;
  active = false;
  notify();
}

export function beginAgentSession(opts?: { provider?: string; model?: string; phase?: string }): void {
  const now = Date.now();
  if (!startedAt) startedAt = now;
  active = true;
  lastAt = now;
  if (opts?.provider) provider = opts.provider;
  if (opts?.model) model = opts.model;
  if (opts?.phase) phase = opts.phase;
  pushRaw("meta", `sessão agente${opts?.phase ? ` — ${opts.phase}` : ""}`);
}

export function endAgentSession(): void {
  active = false;
  lastAt = Date.now();
  pushRaw("info", "sessão agente encerrada");
}

function pushRaw(kind: AgentEventKind, text: string): void {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return;
  const now = Date.now();
  lastAt = now;
  if (!startedAt) startedAt = now;
  events.push({ at: now, kind, text: clean.slice(0, 500) });
  if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS);
  notify();
}

/** Classifica e grava uma linha vinda do onLog dos LLMs. */
export function ingestAgentLogLine(line: string): void {
  const raw = line.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+/, "").trim();
  if (!raw) return;

  const prov = raw.match(/^provedor=(\S+)\s+model=(\S+)/i);
  if (prov) {
    provider = prov[1] ?? provider;
    model = prov[2] ?? model;
    active = true;
    pushRaw("meta", `provedor=${provider} model=${model}`);
    return;
  }

  if (/^▸\s*fase:/i.test(raw) || /^fase:/i.test(raw)) {
    const label = raw.replace(/^▸\s*fase:\s*/i, "").replace(/^fase:\s*/i, "");
    if (/agente|triagem|gerando specs|explorando|l[oó]gica|mapa|roteiro/i.test(label)) {
      phase = label;
      active = true;
      if (!startedAt) startedAt = Date.now();
      lastAt = Date.now();
      pushRaw("phase", phase);
    }
    return;
  }

  if (/^tool\s+/i.test(raw)) {
    toolCount += 1;
    active = true;
    pushRaw("tool", raw);
    return;
  }

  const roundM = raw.match(/LLM\s+\w+\s+round=(\d+)/i);
  if (roundM) {
    round = Number(roundM[1]) || round;
    active = true;
    pushRaw("beat", raw);
    return;
  }

  if (/^agente:\s*processando/i.test(raw) || /^runId=/i.test(raw) || /^agentId=/i.test(raw)) {
    active = true;
    pushRaw("beat", raw);
    return;
  }

  if (/erro|fatal|falhou|HTTP\s+[45]\d\d/i.test(raw) && /agente|LLM|triagem|tool|API/i.test(raw)) {
    pushRaw("error", raw);
    return;
  }

  if (/^agente▸/i.test(raw) || /^Triagem model=/i.test(raw) || /^evidência Playwright/i.test(raw)) {
    active = true;
    pushRaw("text", raw.replace(/^agente▸\s*/i, ""));
    return;
  }

  // Snippets de texto do modelo (linhas livres durante sessão ativa)
  if (active && raw.length > 12 && !/^Playwright|^mapa|^roteiro|^credenciais|^suíte|^Fim:/i.test(raw)) {
    pushRaw("text", raw);
  }
}

/** Dicas de fase do orquestrador (linhas que não passam por wrapAgentOnLog). */
export function ingestOrchestratorHint(line: string): void {
  const raw = line.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+/, "").trim();
  if (!raw) return;
  if (!/^▸\s*fase:/i.test(raw) && !/^fase:/i.test(raw)) return;
  ingestAgentLogLine(line);
}

export function wrapAgentOnLog(onLog: (line: string) => void): (line: string) => void {
  return (line: string) => {
    ingestAgentLogLine(line);
    onLog(line);
  };
}

export function getAgentTelemetry(): AgentTelemetrySnapshot {
  return {
    events: events.slice(),
    provider,
    model,
    phase,
    startedAt,
    lastAt,
    toolCount,
    round,
    active,
  };
}

export function formatAgentElapsed(now = Date.now()): string {
  if (!startedAt) return "—";
  const sec = Math.max(0, Math.round((now - startedAt) / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}
