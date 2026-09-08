import { e2eEnv, type AuthKind } from "./env";

export function accessEnvPrefix(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return "";
  if (/^E2E_/i.test(trimmed)) {
    return trimmed.replace(/_LOGIN$|_SENHA$|_AUTH_KIND$/i, "").toUpperCase();
  }
  const slug = trimmed
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return slug ? `E2E_USER_${slug}` : "";
}

export function hasAccessEnv(labelOrPrefix: string): boolean {
  const prefix = labelOrPrefix.startsWith("E2E_")
    ? labelOrPrefix.replace(/_LOGIN$|_SENHA$/i, "").toUpperCase()
    : accessEnvPrefix(labelOrPrefix);
  if (!prefix) return false;
  const login = (process.env[`${prefix}_LOGIN`] ?? "").trim();
  const senha = (process.env[`${prefix}_SENHA`] ?? process.env[`${prefix}_PASSWORD`] ?? "").trim();
  return Boolean(login && senha);
}

export function e2eAccessEnv(access: number | string): {
  authKind: AuthKind;
  login: string;
  senha: string;
  email: string;
  cpf: string;
} {
  if (typeof access === "number") {
    if (access <= 1) {
      const env = e2eEnv();
      return {
        authKind: env.authKind,
        login: env.login,
        senha: env.senha,
        email: env.email,
        cpf: env.cpf,
      };
    }
    const authKind: AuthKind =
      process.env[`E2E_ACCESS_${access}_AUTH_KIND`] === "cpf" ? "cpf" : "email";
    const login = (process.env[`E2E_ACCESS_${access}_LOGIN`] ?? "").trim();
    const senha = (
      process.env[`E2E_ACCESS_${access}_SENHA`] ??
      process.env[`E2E_ACCESS_${access}_PASSWORD`] ??
      ""
    ).trim();
    return {
      authKind,
      login,
      senha,
      email: authKind === "email" ? login : "",
      cpf: authKind === "cpf" ? login : "",
    };
  }

  const prefix = access.startsWith("E2E_")
    ? access.replace(/_LOGIN$|_SENHA$/i, "").toUpperCase()
    : accessEnvPrefix(access);
  const authKind: AuthKind = process.env[`${prefix}_AUTH_KIND`] === "cpf" ? "cpf" : "email";
  const login = (process.env[`${prefix}_LOGIN`] ?? "").trim();
  const senha = (process.env[`${prefix}_SENHA`] ?? process.env[`${prefix}_PASSWORD`] ?? "").trim();
  return {
    authKind,
    login,
    senha,
    email: authKind === "email" ? login : "",
    cpf: authKind === "cpf" ? login : "",
  };
}
