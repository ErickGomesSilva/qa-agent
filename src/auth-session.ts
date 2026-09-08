import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AccessCredential, AuthKind } from "./types.ts";
import { scriptsDir } from "./workspace.ts";

export function authDir(): string {
  return join(scriptsDir(), ".auth");
}

export function authSessionPath(): string {
  return join(authDir(), "session.json");
}

export function authFingerprintPath(): string {
  return join(authDir(), "fingerprint");
}

export function computeAuthFingerprint(opts: {
  baseUrl: string;
  authKind: AuthKind;
  login: string;
  senha: string;
}): string {
  return createHash("sha256")
    .update(`${opts.baseUrl}|${opts.authKind}|${opts.login}|${opts.senha}`)
    .digest("hex");
}

export function computeAuthFingerprintMulti(opts: {
  baseUrl: string;
  accesses: AccessCredential[];
}): string {
  const body = opts.accesses
    .map((a) => `${a.authKind}|${a.login}|${a.senha}|${a.label ?? ""}`)
    .join(";");
  return createHash("sha256").update(`${opts.baseUrl}|${body}`).digest("hex");
}

/** Invalida sessao Playwright se URL/credenciais mudaram. */
export function ensureAuthSessionFresh(opts: {
  baseUrl: string;
  authKind: AuthKind;
  login: string;
  senha: string;
  accesses?: AccessCredential[];
  onLog?: (line: string) => void;
}): boolean {
  const log = opts.onLog ?? (() => undefined);
  mkdirSync(authDir(), { recursive: true });

  const fp = opts.accesses?.length
    ? computeAuthFingerprintMulti({ baseUrl: opts.baseUrl, accesses: opts.accesses })
    : computeAuthFingerprint(opts);
  const fpPath = authFingerprintPath();
  const sessionPath = authSessionPath();
  const prev = existsSync(fpPath) ? readFileSync(fpPath, "utf8").trim() : "";

  if (prev && prev !== fp) {
    log("credenciais ou URL mudaram — invalidando .auth/session.json");
    rmSync(sessionPath, { force: true });
    writeFileSync(fpPath, fp, "utf8");
    return true;
  }

  if (!existsSync(sessionPath)) {
    log("sessao Playwright: globalSetup vai autenticar na proxima rodada");
    writeFileSync(fpPath, fp, "utf8");
    return true;
  }

  if (!prev) writeFileSync(fpPath, fp, "utf8");
  return false;
}
