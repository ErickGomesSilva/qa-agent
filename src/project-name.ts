/** Nome do projeto para arquivos de resumo (ex.: Portal-Rural). */
export function projectSlugFromPath(requisitosPath: string): string {
  const normalized = requisitosPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = normalized.split("/").filter(Boolean);
  const reqIdx = parts.findIndex((p) => /^requisitos$/i.test(p));
  const name = reqIdx > 0 ? parts[reqIdx - 1]! : parts[parts.length - 1] ?? "projeto";
  return slugify(name);
}

function slugify(raw: string): string {
  const s = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "projeto";
}

export function coverageReportBasename(projectSlug: string): string {
  return `COBERTURA-RESUMO-${projectSlug}`;
}
