import { t } from "../i18n.ts";
import { letterSpace, sgr, theme } from "./theme.ts";

export function printBanner(subtitle?: string): void {
  console.log();
  console.log(sgr(letterSpace("QA AGENT"), theme.bold, theme.accentHi));
  console.log(sgr("━".repeat(56), theme.border));
  console.log(sgr(`  ${subtitle ?? t("header.tagline")}`, theme.muted));
  console.log();
}

export function printSection(title: string): void {
  console.log();
  console.log(sgr(`◆ ${title.toUpperCase()}`, theme.bold, theme.accentHi));
  console.log(sgr("┈".repeat(36), theme.border));
}

export function printKv(label: string, value: string): void {
  const pad = label.padEnd(14);
  console.log(`  ${sgr(pad, theme.muted)}${sgr(value, theme.fg)}`);
}

export function printLogLine(line: string): void {
  console.log(`  ${sgr("·", theme.muted)} ${sgr(line, theme.fg)}`);
}

export function printOk(line: string): void {
  console.log(sgr(`◆ ${line}`, theme.ok));
}

export function printErr(line: string): void {
  console.log(sgr(`× ${line}`, theme.err));
}
