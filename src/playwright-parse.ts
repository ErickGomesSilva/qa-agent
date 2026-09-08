import { readFileSync } from "node:fs";

export type PlaywrightTestRow = {
  title: string;
  us?: string;
  ca?: string;
  file?: string;
  status: "passed" | "failed" | "skipped";
  reason?: string;
  error?: string;
  durationMs?: number;
};

type PwSuite = {
  title?: string;
  file?: string;
  suites?: PwSuite[];
  specs?: PwSpec[];
};

type PwSpec = {
  title?: string;
  file?: string;
  tests?: PwTest[];
};

type PwTest = {
  results?: Array<{
    status?: string;
    duration?: number;
    error?: { message?: string };
    errors?: Array<{ message?: string }>;
    annotations?: Array<{ type?: string; description?: string }>;
  }>;
};

function usCa(title: string): { us?: string; ca?: string } {
  return {
    us: title.match(/\bUS_[A-Z0-9_]+\b/)?.[0],
    ca: title.match(/\bCA\d+\b/)?.[0],
  };
}

function skipReason(result: NonNullable<PwTest["results"]>[number]): string | undefined {
  const ann = result.annotations?.find((a) => a.type === "skip");
  return ann?.description?.trim();
}

function walkSuite(suite: PwSuite, parents: string[], acc: PlaywrightTestRow[]): void {
  const chain = suite.title ? [...parents, suite.title] : parents;
  for (const spec of suite.specs ?? []) {
    const title = [...chain, spec.title ?? ""].filter(Boolean).join(" › ");
    const ids = usCa(title);
    for (const test of spec.tests ?? []) {
      const result = test.results?.[test.results.length - 1];
      if (!result?.status) continue;
      const row: PlaywrightTestRow = {
        title,
        us: ids.us,
        ca: ids.ca,
        file: spec.file ?? suite.file,
        status:
          result.status === "passed" || result.status === "expected"
            ? "passed"
            : result.status === "skipped"
              ? "skipped"
              : "failed",
        durationMs: result.duration,
      };
      if (row.status === "skipped") row.reason = skipReason(result) ?? "test.skip";
      if (row.status === "failed") {
        row.error =
          result.error?.message ??
          result.errors?.map((e) => e.message).filter(Boolean).join("\n") ??
          "(sem mensagem)";
      }
      acc.push(row);
    }
  }
  for (const child of suite.suites ?? []) walkSuite(child, chain, acc);
}

export function parsePlaywrightJsonFile(jsonPath: string): PlaywrightTestRow[] {
  const raw = JSON.parse(readFileSync(jsonPath, "utf8")) as { suites?: PwSuite[] };
  const acc: PlaywrightTestRow[] = [];
  for (const suite of raw.suites ?? []) walkSuite(suite, [], acc);
  return acc;
}

export function groupPlaywrightRows(rows: PlaywrightTestRow[]): {
  passed: PlaywrightTestRow[];
  failed: PlaywrightTestRow[];
  skipped: PlaywrightTestRow[];
} {
  return {
    passed: rows.filter((r) => r.status === "passed"),
    failed: rows.filter((r) => r.status === "failed"),
    skipped: rows.filter((r) => r.status === "skipped"),
  };
}
