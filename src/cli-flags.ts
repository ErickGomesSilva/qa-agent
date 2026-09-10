import { createRl, askYesNo } from "./ask.ts";
import { cleanAllProjects, cleanCurrentProject } from "./clean.ts";
import { config } from "./config.ts";
import { argvFlag, applyResolvedProject, listProjectSlugs, workspacePathFor } from "./projects.ts";
import { applySavedSettings } from "./setup.ts";

export function printCliHelp(): void {
  console.log(`QA Agent

Uso:
  qaagent                  TUI (F1–F9)
  qaagent --plain          Assistente em texto
  qaagent --help           Esta ajuda

Projeto (scripts e massa em data/projects/<slug>/):
  qaagent --project NOME   Usa essa pasta (grava em settings)
  qaagent --projects       Lista projetos
  QA_PROJECT=NOME          Mesmo recorte via env

Limpar artefatos gerados (specs, relatórios, massa, requisitos copiados).
Não apaga .env, settings, nem credenciais.md:
  qaagent --clean
  qaagent --clean --all    Todos os projetos + data/runs
  qaagent --clean --yes    Sem pergunta s/N
  qaagent-clean            Atalho = qaagent --clean

Outros:
  --plain --reconfigure
  --audit-only  --deepen-stubs  --unblock-massa  --tour  --load-only
`);
}

function printList(): void {
  const slugs = listProjectSlugs();
  const current = config.projectSlug;
  console.log(`Projetos em ${config.projectsDir}`);
  console.log(`Atual: ${current} → ${config.workspaceDir}`);
  console.log("");
  if (!slugs.length) {
    console.log("(nenhum ainda — rode uma missão; o slug sai da pasta de requisitos)");
    return;
  }
  for (const s of slugs) {
    const mark = s === current ? "*" : " ";
    console.log(`${mark} ${s}  ${workspacePathFor(s)}`);
  }
}

export async function runCleanCli(argv = process.argv): Promise<void> {
  applySavedSettings();
  applyResolvedProject(argv);
  const all = argvFlag(argv, "all");
  const yes = argvFlag(argv, "yes") || argvFlag(argv, "y");
  const target = all
    ? `TODOS os projetos em ${config.projectsDir} e data/runs`
    : `projeto ${config.projectSlug} (${config.workspaceDir})`;

  if (!yes && process.stdin.isTTY) {
    const rl = createRl();
    try {
      const ok = await askYesNo(
        rl,
        `Apagar specs, relatórios, massa gerada e requisitos copiados de ${target}? Credenciais e .env ficam`,
        false,
      );
      if (!ok) {
        console.log("Cancelado.");
        return;
      }
    } finally {
      rl.close();
    }
  } else if (!yes && !process.stdin.isTTY) {
    console.error("Sem TTY: passe --yes para confirmar a limpeza.");
    process.exitCode = 1;
    return;
  }

  const results = all ? cleanAllProjects() : [cleanCurrentProject()];
  let n = 0;
  for (const r of results) {
    console.log(`${r.slug}: ${r.removed.length} item(ns)`);
    for (const p of r.removed) console.log(`  - ${p}`);
    n += r.removed.length;
  }
  console.log(`Limpeza ok (${n} caminho(s)). Workspace recriado vazio (helpers/templates).`);
}

export async function handleEarlyCli(argv = process.argv): Promise<boolean> {
  if (argvFlag(argv, "help") || argv.includes("-h") || argv.includes("-?")) {
    printCliHelp();
    return true;
  }
  if (argvFlag(argv, "projects")) {
    applySavedSettings();
    applyResolvedProject(argv);
    printList();
    return true;
  }
  if (argvFlag(argv, "clean")) {
    await runCleanCli(argv);
    return true;
  }
  return false;
}
