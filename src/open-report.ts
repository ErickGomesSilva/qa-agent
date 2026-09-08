import { existsSync, readFileSync } from "node:fs";

export function readReportLines(filePath: string): string[] {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, "utf8").split(/\r?\n/);
}

/** Imprime o conteúdo do MD no terminal (stdout ou callback de log). */
export function displayReportInTerminal(
  filePath: string,
  emit: (line: string) => void = console.log,
): void {
  const lines = readReportLines(filePath);
  const norm = filePath.replace(/\\/g, "/");
  if (!lines.length) {
    emit(`(relatório vazio ou não encontrado: ${norm})`);
    return;
  }
  emit("");
  emit("══════════════════════════════════════════════════════════");
  emit(`  RELATÓRIO  ${norm}`);
  emit("══════════════════════════════════════════════════════════");
  for (const line of lines) emit(line);
  emit("══════════════════════════════════════════════════════════");
  emit("");
}
