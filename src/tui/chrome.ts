import { isScriptNotice, t, type Locale } from "../i18n.ts";
import type { StepView } from "../setup.ts";
import {
  fill,
  frame,
  gauge,
  ink,
  letterSpace,
  padVisible,
  spinnerFrame,
  theme,
  visibleWidth,
} from "./theme.ts";

export function wordmark(width: number, locale: Locale, armed: number, total: number, tick: number, live: boolean): string {
  const mark = ink(letterSpace("QA AGENT"), theme.bold, theme.accentHi);
  const bar = gauge(armed, total, 10);
  const ratio = ink(`${armed}/${total}`, theme.muted);
  const liveBit = live
    ? ink(` ${spinnerFrame(tick)} ${t("app.running")}`, theme.info)
    : "";
  const lang =
    locale === "pt-BR"
      ? `${ink(" PT-BR ", theme.invert, theme.accentHi)}${ink(" EN-US ", theme.muted)}`
      : `${ink(" PT-BR ", theme.muted)}${ink(" EN-US ", theme.invert, theme.accentHi)}`;
  const right = `${bar} ${ratio}${liveBit}  ${lang}`;
  const gap = Math.max(1, width - visibleWidth(mark) - visibleWidth(right) - 1);
  return fill(`${mark}${" ".repeat(gap)}${right}`, width);
}

export function tagline(width: number): string {
  return fill(ink(`  ${t("header.tagline")}`, theme.muted), width);
}

export function tabRail(steps: StepView[], active: number, width: number): string {
  const bits = steps.map((st, i) => {
    const lamp =
      st.id === "app" || st.id === "resumos" || st.id === "agente"
        ? "▸"
        : st.done
          ? ink("◆", theme.ok)
          : ink("○", theme.warn);
    const label = ` F${st.f} ${st.title.toUpperCase()} `;
    const body = `${lamp}${label}`;
    if (i === active) return ink(body, theme.invert, theme.accentHi);
    return ink(body, theme.fg);
  });
  const joined = bits.join("");
  return fill(` ${joined}`, width);
}

export function stepHeading(step: StepView, isMission: boolean, width: number): string {
  const status = isMission
    ? step.id === "resumos"
      ? ink(` ${t("status.reports")} `, theme.invert, theme.accent)
      : step.id === "agente"
        ? ink(` ${t("status.agente")} `, theme.invert, theme.info)
        : ink(` ${t("status.app")} `, theme.invert, theme.info)
    : step.done
      ? ink(` ${t("status.done")} `, theme.invert, theme.accent)
      : ink(` ${t("status.pending")} `, theme.invert, theme.warn);
  const title = ink(` F${step.f}  ${step.title.toUpperCase()}`, theme.bold, theme.fg);
  const summary = ink(`  ${step.summary}`, theme.muted);
  return fill(`${title}  ${status}${summary}`, width);
}

export function styleAgentEvent(kind: string, text: string, tick: number): string {
  if (kind === "tool") return `${ink("⬡", theme.info)} ${ink(text, theme.info)}`;
  if (kind === "error") return `${ink("×", theme.err)} ${ink(text, theme.err)}`;
  if (kind === "phase") return `${ink("▸", theme.accentHi)} ${ink(text, theme.accentHi, theme.bold)}`;
  if (kind === "beat") return `${ink(spinnerFrame(tick), theme.info)} ${ink(text, theme.muted)}`;
  if (kind === "meta") return `${ink("◆", theme.accent)} ${ink(text, theme.muted)}`;
  if (kind === "info") return `${ink("·", theme.muted)} ${ink(text, theme.muted)}`;
  return `${ink("›", theme.fg)} ${ink(text, theme.fg)}`;
}

export function inputField(label: string, value: string, focused: boolean, width: number, secret = false): string[] {
  const shown = secret ? (value ? "●".repeat(Math.min(value.length, 36)) : "") : value;
  const caret = focused ? ink("▍", theme.accentHi) : " ";
  const inner = Math.max(12, Math.min(64, width - 6));
  const boxW = inner + 2;
  const content = `${shown}${caret}`;
  const kind = "heavy" as const;
  return [
    `  ${ink(focused ? "▸" : "·", focused ? theme.accentHi : theme.muted)} ${ink(label.toUpperCase(), focused ? theme.accentHi : theme.muted)}`,
    ...frame([` ${content}`], boxW, 3, undefined, kind, focused).map((l) => `  ${l}`),
  ];
}

export function choiceRow(
  label: string,
  chips: string[],
  focused: boolean,
  hint: string,
): string {
  const pointer = focused ? ink("▸", theme.accentHi) : ink("·", theme.muted);
  return `  ${pointer} ${ink(label, focused ? theme.fg : theme.muted)}  ${chips.join("")}  ${ink(hint, theme.muted)}`;
}

export function chip(label: string, on: boolean): string {
  return on ? ink(` ${label} `, theme.invert, theme.accentHi) : ink(` ${label} `, theme.muted);
}

export function evidencePanel(title: string, rows: string[], empty: string, width: number): string[] {
  const inner = Math.max(20, width - 2);
  const body = rows.length ? rows : [ink(`  ${empty}`, theme.muted)];
  const heading = ink(`◆ ${title.toUpperCase()}`, theme.bold, theme.accent);
  const lines = [heading, ink("┈".repeat(Math.min(inner, 36)), theme.border), ...body];
  return lines;
}

export function styleLogLine(raw: string, tick: number): string {
  const notice = isScriptNotice(raw);
  if (/^━━|^──/.test(raw)) return ink(` ${raw.replace(/[━─]/g, "━")} `, theme.bold, theme.accentHi);
  if (notice) return `${ink("◆", theme.ok)} ${ink(raw, theme.fg)}`;
  if (/NÃO FINALIZADO|NAO FINALIZADO|★/.test(raw)) {
    return `${ink("★", theme.warn)} ${ink(raw, theme.warn, theme.bold)}`;
  }
  if (/erro fatal|error:|fatal/i.test(raw) || raw.startsWith("Erro:") || raw.startsWith("Error:")) {
    return `${ink("×", theme.err)} ${ink(raw, theme.err)}`;
  }
  if (/^Fim:|^End:|triagem|triage|Playwright/i.test(raw)) {
    return `${ink("▸", theme.info)} ${ink(raw, theme.fg)}`;
  }
  if (/rodando|running|gerando|explorando|validando/i.test(raw)) {
    return `${ink(spinnerFrame(tick), theme.info)} ${ink(raw, theme.info)}`;
  }
  return `${ink("·", theme.muted)} ${ink(raw, theme.muted)}`;
}

export function footer(help: string, flash: string, flashErr: boolean, width: number): string[] {
  const msg = flash
    ? flashErr
      ? ink(`  × ${flash}`, theme.err)
      : ink(`  ◆ ${flash}`, theme.ok)
    : "";
  return [fill(ink("━".repeat(Math.max(8, width)), theme.border), width), fill(`${ink("  " + help, theme.muted)}${msg}`, width)];
}

export function modelRow(label: string, selected: boolean, width: number): string {
  if (selected) {
    return ink(padVisible(` ▸ ${label} `, width), theme.invert, theme.accentHi);
  }
  return ink(`   ${label}`, theme.fg);
}

export function joinColumns(left: string[], right: string[], leftW: number, rightW: number): string[] {
  const h = Math.max(left.length, right.length);
  const out: string[] = [];
  for (let i = 0; i < h; i++) {
    const l = padVisible(left[i] ?? "", leftW);
    const r = padVisible(right[i] ?? "", rightW);
    out.push(l + r);
  }
  return out;
}
