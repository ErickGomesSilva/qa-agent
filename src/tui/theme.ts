/** Briefing tático: olive + latão. True color sobre fundo quase preto. */

export const theme = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  invert: "\x1b[7m",
  underline: "\x1b[4m",

  /** Fundo da tela */
  bg: "\x1b[48;2;10;14;12m",
  /** Painel interno */
  bgPanel: "\x1b[48;2;16;22;18m",
  /** Campo focado */
  bgField: "\x1b[48;2;24;32;26m",

  /** Texto principal (caqui) */
  fg: "\x1b[38;2;214;204;164m",
  /** Secundário (olive) */
  muted: "\x1b[38;2;106;115;90m",
  /** Latão */
  accent: "\x1b[38;2;201;162;39m",
  /** Latão claro */
  accentHi: "\x1b[38;2;232;197;71m",
  /** Bordas olive */
  border: "\x1b[38;2;58;72;52m",
  /** Borda ativa */
  borderHi: "\x1b[38;2;201;162;39m",

  /** Armado — latão, não verde */
  ok: "\x1b[38;2;201;162;39m",
  /** Aberto — aço */
  warn: "\x1b[38;2;94;139;148m",
  /** Falha — ferrugem */
  err: "\x1b[38;2;196;92;46m",
  /** Ao vivo — aqua empoeirado */
  info: "\x1b[38;2;122;186;176m",
} as const;

export type BoxKind = "heavy" | "double";

const BOX = {
  heavy: { tl: "┏", tr: "┓", bl: "┗", br: "┛", h: "━", v: "┃" },
  double: { tl: "╔", tr: "╗", bl: "╚", br: "╝", h: "═", v: "║" },
} as const;

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

/** Recoloca o fundo da tela depois de um reset. */
export function on(): string {
  return `${theme.reset}${theme.bg}`;
}

/** Texto estilizado que volta ao canvas (TUI). */
export function ink(text: string, ...styles: string[]): string {
  if (!styles.length) return text;
  return `${styles.join("")}${text}${on()}`;
}

/** Texto estilizado que termina em reset limpo (CLI --plain). */
export function sgr(text: string, ...styles: string[]): string {
  if (!styles.length) return text;
  return `${styles.join("")}${text}${theme.reset}`;
}

export function paint(text: string, ...styles: string[]): string {
  return ink(text, ...styles);
}

export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

export function visibleWidth(text: string): number {
  let w = 0;
  for (const ch of stripAnsi(text)) {
    w += ch.codePointAt(0)! > 0xffff ? 2 : 1;
  }
  return w;
}

export function truncateVisible(text: string, width: number): string {
  if (width < 1) return "";
  if (visibleWidth(text) <= width) return text;
  const target = Math.max(1, width - 1);
  let vis = 0;
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] === "\x1b") {
      const m = text.slice(i).match(/^\x1b\[[0-9;]*m/);
      if (m) {
        out += m[0];
        i += m[0].length;
        continue;
      }
    }
    const ch = text[i]!;
    const cw = ch.codePointAt(0)! > 0xffff ? 2 : 1;
    if (vis + cw > target) break;
    out += ch;
    vis += cw;
    i++;
  }
  return `${out}…`;
}

export function padVisible(text: string, width: number, align: "left" | "right" = "left"): string {
  const clipped = truncateVisible(text, width);
  const gap = Math.max(0, width - visibleWidth(clipped));
  return align === "right" ? `${" ".repeat(gap)}${clipped}` : `${clipped}${" ".repeat(gap)}`;
}

export function letterSpace(text: string): string {
  return text.split("").join(" ");
}

export function spinnerFrame(tick: number): string {
  return SPINNER[Math.abs(tick) % SPINNER.length]!;
}

export function gauge(filled: number, total: number, width = 14): string {
  const n = Math.max(1, total);
  const inner = Math.max(4, width);
  const cells = Math.round((Math.max(0, filled) / n) * inner);
  const onBar = "▓".repeat(Math.min(inner, cells));
  const offBar = "░".repeat(Math.max(0, inner - cells));
  return `${ink(onBar, theme.accent)}${ink(offBar, theme.muted)}`;
}

function boxColor(kind: BoxKind, focused = false): string {
  if (focused) return theme.borderHi;
  return kind === "double" ? theme.info : theme.border;
}

export function boxTop(width: number, title?: string, kind: BoxKind = "heavy", focused = false): string {
  const b = BOX[kind];
  const color = boxColor(kind, focused);
  const inner = Math.max(4, width - 2);
  if (!title) return ink(`${b.tl}${b.h.repeat(inner)}${b.tr}`, color);
  const label = ` ${title} `;
  const rest = Math.max(0, inner - 1 - visibleWidth(label));
  return `${ink(b.tl + b.h, color)}${ink(label, theme.bold, theme.accentHi)}${ink(b.h.repeat(rest) + b.tr, color)}`;
}

export function boxBottom(width: number, kind: BoxKind = "heavy", focused = false): string {
  const b = BOX[kind];
  const color = boxColor(kind, focused);
  return ink(`${b.bl}${b.h.repeat(Math.max(4, width - 2))}${b.br}`, color);
}

export function boxMid(width: number, kind: BoxKind = "heavy"): string {
  const b = BOX[kind];
  const color = boxColor(kind);
  const h = kind === "double" ? "═" : "─";
  return ink(`${b.v === "┃" ? "┣" : "╠"}${h.repeat(Math.max(4, width - 2))}${b.v === "┃" ? "┫" : "╣"}`, color);
}

export function boxLine(content: string, width: number, kind: BoxKind = "heavy", focused = false): string {
  const b = BOX[kind];
  const color = boxColor(kind, focused);
  const inner = Math.max(1, width - 2);
  const clipped = padVisible(content, inner);
  return `${ink(b.v, color)}${clipped}${ink(b.v, color)}`;
}

export function frame(
  innerLines: string[],
  width: number,
  height: number,
  title?: string,
  kind: BoxKind = "heavy",
  focused = false,
): string[] {
  const innerH = Math.max(1, height - 2);
  const rows = [...innerLines];
  while (rows.length < innerH) rows.push("");
  return [
    boxTop(width, title, kind, focused),
    ...rows.slice(0, innerH).map((l) => boxLine(l, width, kind, focused)),
    boxBottom(width, kind, focused),
  ];
}

export function rule(width: number, char = "━"): string {
  return ink(char.repeat(Math.max(1, width)), theme.border);
}

export function fill(content: string, width: number): string {
  return `${theme.bg}${padVisible(content, width)}`;
}
