import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { config } from "./config.ts";
import {
  coberturaPath,
  loadCoverageFile,
  mergeAuditIntoCoverage,
  saveCoverageFile,
} from "./coverage-migrate.ts";
import type { CoverageAuditResult, CoverageNivel, SpecAuditFinding } from "./coverage-types.ts";
import { syncMassaManifest, manifestSummary } from "./massa/manifest.ts";
import { scriptsDir } from "./workspace.ts";

const WEAK_EXPECT =
  /expect\s*\([^)]*(?:body|heading\)\.first\(\)|locator\s*\(\s*['"]body['"]\s*\))[^)]*\)\s*\.\s*toBeVisible/i;

const MEANINGFUL_EXPECT =
  /expect\s*\([^)]*\)\s*\.\s*(?:toHaveText|toContainText|toBeEnabled|toBeDisabled|toHaveValue|toHaveCount|toHaveAttribute|toMatch)/i;

const INTERACTION =
  /\.(?:click|dblclick|fill|selectOption|press|check|uncheck|setInputFiles)\s*\(/i;

const API_CALL = /\b(?:request|api)\.(?:get|post|put|patch|delete|fetch)\s*\(/i;

const LOGIN_HELPER = /\b(?:login|selectContext|loginAs)\s*\(/i;

export type ParsedTest = {
  title: string;
  body: string;
  file: string;
  us?: string;
  ca?: string;
};

function listSpecFiles(dir = join(scriptsDir(), "tests")): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (current: string) => {
    for (const name of readdirSync(current)) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(spec|test)\.(ts|js)$/.test(name)) out.push(full);
    }
  };
  walk(dir);
  return out.sort();
}

export function parseTests(source: string, file: string): ParsedTest[] {
  const tests: ParsedTest[] = [];
  const re =
    /test(?:\.(?:only|skip))?\s*\(\s*(['"`])([\s\S]*?)\1\s*,\s*(?:async\s*)?\(\s*\{[^}]*\}\s*\)\s*=>\s*\{([\s\S]*?)\n\}\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const title = m[2] ?? "";
    const body = m[3] ?? "";
    const us = title.match(/US_[A-Z0-9_]+/)?.[0];
    const ca = title.match(/CA\d+/)?.[0];
    tests.push({ title, body, file, us, ca });
  }
  return tests;
}

export function listParsedSpecTests(): ParsedTest[] {
  const out: ParsedTest[] = [];
  for (const file of listSpecFiles()) {
    out.push(...parseTests(readFileSync(file, "utf8"), file));
  }
  return out;
}

function skipMessage(body: string): string | null {
  const m = body.match(/test\.skip\s*\(\s*true\s*,\s*(['"`])([\s\S]*?)\1/);
  return m?.[2]?.trim() ?? null;
}

function hasTag(title: string, tag: string): boolean {
  return new RegExp(`@${tag}\\b`).test(title);
}

function classifySkipMessage(msg: string): { nivel: CoverageNivel; massaNecessaria?: string } {
  if (/sem-ui|sem superf[ií]cie/i.test(msg)) {
    return { nivel: "sem-ui", massaNecessaria: msg };
  }
  if (/massa|perfil|usu[aá]rio|piloto|revogad/i.test(msg)) {
    return { nivel: "skip-massa", massaNecessaria: msg };
  }
  return { nivel: "skip-massa", massaNecessaria: msg };
}

function isWeakExecutavel(body: string): boolean {
  const skip = skipMessage(body);
  if (skip) return false;

  const stripped = body
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  const lines = stripped.split("\n").filter((l) => l.trim());
  const nonLogin = lines.filter((l) => !LOGIN_HELPER.test(l) && !/await page\.goto/.test(l));

  const interactions = nonLogin.filter((l) => INTERACTION.test(l)).length;
  const meaningful = MEANINGFUL_EXPECT.test(stripped);
  const onlyWeak = WEAK_EXPECT.test(stripped) && !meaningful;

  if (interactions === 0 && onlyWeak) return true;
  if (interactions === 0 && !meaningful) {
    const expectCount = (stripped.match(/expect\s*\(/g) ?? []).length;
    if (expectCount <= 2) return true;
  }
  return false;
}

function classifyTest(test: ParsedTest): SpecAuditFinding | null {
  if (!test.us || !test.ca) return null;

  const rel = relative(scriptsDir(), test.file).replace(/\\/g, "/");
  const skip = skipMessage(test.body);

  if (skip) {
    const { nivel, massaNecessaria } = classifySkipMessage(skip);
    return {
      us: test.us,
      ca: test.ca,
      specPath: rel,
      nivel,
      motivo: skip,
      massaNecessaria,
      assertEntao: false,
    };
  }

  if (hasTag(test.title, "sem-ui")) {
    return {
      us: test.us,
      ca: test.ca,
      specPath: rel,
      nivel: "sem-ui",
      motivo: "sem-ui",
      assertEntao: false,
    };
  }

  if (hasTag(test.title, "api")) {
    const weakApi = !API_CALL.test(test.body) && !MEANINGFUL_EXPECT.test(test.body);
    return {
      us: test.us,
      ca: test.ca,
      specPath: rel,
      nivel: "api",
      motivo: weakApi ? "api sem request/assert — tratar como rascunho de contrato" : "",
      assertEntao: !weakApi,
    };
  }

  if (hasTag(test.title, "rascunho")) {
    return {
      us: test.us,
      ca: test.ca,
      specPath: rel,
      nivel: "rascunho",
      motivo: "marcado @rascunho",
      assertEntao: false,
    };
  }

  if (hasTag(test.title, "massa")) {
    return {
      us: test.us,
      ca: test.ca,
      specPath: rel,
      nivel: "skip-massa",
      motivo: "marcado @massa",
      massaNecessaria: "marcado @massa",
      assertEntao: false,
    };
  }

  if (hasTag(test.title, "executavel") && isWeakExecutavel(test.body)) {
    return {
      us: test.us,
      ca: test.ca,
      specPath: rel,
      nivel: "rascunho",
      motivo: "stub: @executavel sem assert do Entao (só navegação/visibilidade genérica)",
      assertEntao: false,
      downgraded: true,
    };
  }

  if (hasTag(test.title, "executavel")) {
    return {
      us: test.us,
      ca: test.ca,
      specPath: rel,
      nivel: "real",
      motivo: "",
      assertEntao: true,
    };
  }

  return {
    us: test.us,
    ca: test.ca,
    specPath: rel,
    nivel: "rascunho",
    motivo: "sem tag @executavel",
    assertEntao: false,
  };
}

function downgradeExecutavelInSource(source: string, us: string, ca: string): string {
  const pattern = new RegExp(
    `(test(?:\\.(?:only|skip))?\\s*\\(\\s*['"\`])([^'"\`]*${us}[^'"\`]*${ca}[^'"\`]*?)@executavel`,
    "g",
  );
  return source.replace(pattern, "$1$2@rascunho");
}

export type RunCoverageAuditOpts = {
  onLog?: (line: string) => void;
  /** Rebaixa @executavel stub para @rascunho nos arquivos spec. */
  autoDowngrade?: boolean;
  /** Falha se encontrar stub @executavel (não rebaixa). */
  strict?: boolean;
};

export function runCoverageAudit(opts: RunCoverageAuditOpts = {}): CoverageAuditResult {
  const log = opts.onLog ?? (() => undefined);
  const autoDowngrade = opts.autoDowngrade ?? !config.strictCoverage;
  const strict = opts.strict ?? config.strictCoverage;

  const findings: SpecAuditFinding[] = [];
  const warnings: string[] = [];
  const filesTouched = new Set<string>();

  for (const file of listSpecFiles()) {
    let source = readFileSync(file, "utf8");
    const tests = parseTests(source, file);
    let modified = false;

    for (const test of tests) {
      const finding = classifyTest(test);
      if (!finding) continue;
      findings.push(finding);

      if (finding.downgraded && autoDowngrade && finding.us && finding.ca) {
        const next = downgradeExecutavelInSource(source, finding.us, finding.ca);
        if (next !== source) {
          source = next;
          modified = true;
          filesTouched.add(file);
        }
      }

      if (finding.downgraded && strict) {
        warnings.push(`${finding.us} ${finding.ca}: stub @executavel em ${finding.specPath}`);
      }
    }

    if (modified) writeFileSync(file, source, "utf8");
  }

  const downgraded = findings.filter((f) => f.downgraded).length;
  if (downgraded > 0) {
    log(
      autoDowngrade
        ? `auditoria: ${downgraded} stub(s) @executavel rebaixado(s) para @rascunho`
        : `auditoria: ${downgraded} stub(s) @executavel detectado(s)`,
    );
  }

  const updates = new Map<string, Partial<import("./coverage-types.ts").CoverageCase>>();
  for (const f of findings) {
    updates.set(`${f.us}:${f.ca}`, {
      nivel: f.nivel,
      motivo: f.motivo,
      massaNecessaria: f.massaNecessaria ?? "",
      assertEntao: f.assertEntao,
      specPath: f.specPath,
      coberto: (f.nivel === "real" || f.nivel === "api") && f.assertEntao,
    });
  }

  const cobPath = coberturaPath();
  const existing = loadCoverageFile(cobPath);
  if (existing) {
    const merged = mergeAuditIntoCoverage(existing, updates);
    saveCoverageFile(merged, cobPath);
    log(`auditoria: cobertura.json atualizado (${merged.casos.length} CAs)`);
  } else if (findings.length > 0) {
    log("auditoria: cobertura.json ausente — achados só em AUDITORIA.json");
  }

  const auditPath = join(scriptsDir(), "falhas", "AUDITORIA.json");
  const result: CoverageAuditResult = {
    findings,
    downgraded: autoDowngrade ? downgraded : 0,
    warnings,
    coberturaPath: cobPath,
    auditPath,
  };

  writeFileSync(
    auditPath,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        downgraded: result.downgraded,
        warnings: result.warnings,
        findings,
      },
      null,
      2,
    ),
    "utf8",
  );

  const manifest = syncMassaManifest(findings);
  const mSum = manifestSummary(manifest);
  if (mSum.total > 0) {
    log(`massa: manifest.json com ${mSum.total} entrada(s) (${mSum.pendente} pendente(s))`);
  }

  if (strict && warnings.length > 0) {
    throw new Error(
      `STRICT_COVERAGE: ${warnings.length} stub(s) @executavel. Veja ${auditPath.replace(/\\/g, "/")}`,
    );
  }

  return result;
}

export function auditSummaryFromFindings(
  findings: SpecAuditFinding[],
  coberturaCasos?: import("./coverage-types.ts").CoverageCase[],
): import("./coverage-types.ts").CoverageSummary {
  const byKey = new Map<string, SpecAuditFinding>();
  for (const f of findings) byKey.set(`${f.us}:${f.ca}`, f);

  let real = 0;
  let rascunho = 0;
  let skipMassa = 0;
  let semUi = 0;
  let api = 0;
  let falsosPositivos = 0;

  const count = (nivel: CoverageNivel) => {
    switch (nivel) {
      case "real":
        real += 1;
        break;
      case "rascunho":
        rascunho += 1;
        break;
      case "skip-massa":
        skipMassa += 1;
        break;
      case "sem-ui":
        semUi += 1;
        break;
      case "api":
        api += 1;
        break;
    }
  };

  if (coberturaCasos?.length) {
    for (const c of coberturaCasos) {
      const f = byKey.get(`${c.us}:${c.ca}`);
      const nivel = f?.nivel ?? c.nivel ?? (c.coberto ? "real" : "sem-ui");
      count(nivel);
      if (c.coberto && (nivel === "rascunho" || nivel === "skip-massa")) falsosPositivos += 1;
    }
  } else {
    for (const f of findings) count(f.nivel);
  }

  return {
    total: coberturaCasos?.length ?? findings.length,
    real,
    rascunho,
    skipMassa,
    semUi,
    api,
    downgradedThisRun: findings.filter((x) => x.downgraded).length,
    falsosPositivos,
  };
}
