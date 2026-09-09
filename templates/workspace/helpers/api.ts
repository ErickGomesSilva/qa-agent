import { expect, type APIRequestContext } from "@playwright/test";
import { e2eEnv } from "./env";

/** Request autenticado opcional — CAs @api. Não invente URL: use a do CA/RN. */
export async function apiJson(
  request: APIRequestContext,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  opts?: { data?: unknown; expectedStatus?: number },
): Promise<unknown> {
  const base = e2eEnv().baseUrl.replace(/\/$/, "");
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`;
  const res = await request.fetch(url, {
    method,
    data: opts?.data as object | undefined,
  });
  const expected = opts?.expectedStatus ?? 200;
  expect(res.status(), `API ${method} ${path}`).toBe(expected);
  const ct = res.headers()["content-type"] ?? "";
  if (ct.includes("json")) return res.json();
  return res.text();
}
