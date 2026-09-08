import { accessEnvPrefix } from "./credentials.ts";
import { config } from "./config.ts";
import type { AccessCredential, AppCredentials, ResolvedCredentials } from "./types.ts";

function spreadAccessEnv(
  env: Record<string, string>,
  index: number,
  access: AccessCredential,
  opts?: { alsoPrimary?: boolean },
): void {
  const n = index;
  env[`E2E_ACCESS_${n}_AUTH_KIND`] = access.authKind;
  env[`E2E_ACCESS_${n}_LOGIN`] = access.login;
  env[`E2E_ACCESS_${n}_SENHA`] = access.senha;
  env[`E2E_ACCESS_${n}_PASSWORD`] = access.senha;
  if (access.authKind === "email") {
    env[`E2E_ACCESS_${n}_EMAIL`] = access.login;
    env[`E2E_ACCESS_${n}_CPF`] = "";
  } else {
    env[`E2E_ACCESS_${n}_CPF`] = access.login;
    env[`E2E_ACCESS_${n}_EMAIL`] = "";
  }

  const prefix = access.label ? accessEnvPrefix(access.label) : "";
  if (prefix) {
    env[`${prefix}_AUTH_KIND`] = access.authKind;
    env[`${prefix}_LOGIN`] = access.login;
    env[`${prefix}_SENHA`] = access.senha;
    env[`${prefix}_PASSWORD`] = access.senha;
    if (access.authKind === "email") {
      env[`${prefix}_EMAIL`] = access.login;
    } else {
      env[`${prefix}_CPF`] = access.login;
    }
  }

  if (opts?.alsoPrimary || n === 1) {
    env.BASE_URL = env.BASE_URL ?? "";
    env.E2E_AUTH_KIND = access.authKind;
    env.E2E_LOGIN = access.login;
    env.E2E_USER = access.login;
    env.E2E_SENHA = access.senha;
    env.E2E_PASSWORD = access.senha;
    env.E2E_EMAIL = access.authKind === "email" ? access.login : "";
    env.E2E_CPF = access.authKind === "cpf" ? access.login : "";
  }
}

export function playwrightEnv(
  creds: AppCredentials & { baseUrl: string },
): Record<string, string> {
  return playwrightEnvFromResolved({
    baseUrl: creds.baseUrl,
    accessCount: 1,
    accesses: [
      {
        authKind: creds.authKind,
        login: creds.login,
        senha: creds.senha,
      },
    ],
  });
}

export function playwrightEnvFromResolved(resolved: ResolvedCredentials): Record<string, string> {
  const env: Record<string, string> = {
    BASE_URL: resolved.baseUrl,
    E2E_BASE_URL: resolved.baseUrl,
  };
  if (config.playwrightHeaded) env.PLAYWRIGHT_HEADED = "1";
  if (config.playwrightVideo && config.playwrightVideo !== "off") {
    env.PLAYWRIGHT_VIDEO = config.playwrightVideo;
  }
  env.TOUR_SLOWMO = String(config.tourSlowMo);

  for (let i = 0; i < resolved.accesses.length; i++) {
    spreadAccessEnv(env, i + 1, resolved.accesses[i]!, { alsoPrimary: i === 0 });
  }

  return env;
}

/** Env Playwright usando um acesso específico como login principal (ex.: massa por perfil). */
export function playwrightEnvForAccess(
  resolved: ResolvedCredentials,
  accessIndex: number,
): Record<string, string> {
  const access = resolved.accesses[accessIndex];
  if (!access) return playwrightEnvFromResolved(resolved);
  return playwrightEnv({ ...access, baseUrl: resolved.baseUrl });
}

export function grepForCase(us: string, ca: string): string {
  return `${us}.*${ca}`;
}
