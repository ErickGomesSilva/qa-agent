import { createInterface, type Interface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { getLocale, t } from "./i18n.ts";
import { sgr, theme } from "./tui/theme.ts";

export function createRl(): Interface {
  return createInterface({ input, output });
}

export function stripQuotes(s: string): string {
  const t = s.trim();
  if (
    (t.startsWith('"') && t.endsWith('"') && t.length >= 2) ||
    (t.startsWith("'") && t.endsWith("'") && t.length >= 2)
  ) {
    return t.slice(1, -1);
  }
  return t;
}

export async function ask(
  rl: Interface,
  question: string,
  defaultValue?: string,
): Promise<string> {
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  const answer = stripQuotes(await rl.question(`${sgr("▸", theme.accent)} ${question}${suffix}: `));
  return answer || defaultValue || "";
}

export async function askYesNo(
  rl: Interface,
  question: string,
  defaultYes: boolean,
): Promise<boolean> {
  const hint = getLocale() === "en-US" ? (defaultYes ? "Y/n" : "y/N") : (defaultYes ? "S/n" : "s/N");
  const answer = (await ask(rl, `${question} (${hint})`)).toLowerCase();
  if (!answer) return defaultYes;
  return ["s", "sim", "y", "yes"].includes(answer);
}

export async function askChoice<T extends string>(
  rl: Interface,
  question: string,
  options: Array<{ id: T; label: string }>,
  defaultId?: T,
): Promise<T> {
  if (options.length === 0) throw new Error(t("ask.noOptions"));
  for (const [i, opt] of options.entries()) {
    const mark = opt.id === defaultId ? ` ${t("ask.current")}` : "";
    console.log(`  ${sgr(`${i + 1})`, theme.accent)} ${opt.label}${sgr(mark, theme.muted)}`);
  }
  const defIndex = defaultId ? options.findIndex((o) => o.id === defaultId) : -1;
  const defHint = defIndex >= 0 ? String(defIndex + 1) : undefined;

  for (;;) {
    const raw = (await ask(rl, question, defHint)).trim();
    if (!raw && defIndex >= 0) return options[defIndex]!.id;
    const asNum = Number(raw);
    if (Number.isInteger(asNum) && asNum >= 1 && asNum <= options.length) {
      return options[asNum - 1]!.id;
    }
    const byId = options.find(
      (o) => o.id.toLowerCase() === raw.toLowerCase() || o.label.toLowerCase() === raw.toLowerCase(),
    );
    if (byId) return byId.id;
    console.log(t("ask.invalid"));
  }
}

/** Senha com eco mascarado no TTY. Fora de TTY, lê uma linha normal. */
export async function askSecret(rl: Interface, question: string): Promise<string> {
  const prompt = `${sgr("▸", theme.accent)} ${question}: `;
  if (!input.isTTY || !output.isTTY) {
    return stripQuotes(await rl.question(prompt));
  }

  rl.pause();
  output.write(prompt);
  input.setRawMode(true);
  input.resume();
  input.setEncoding("utf8");

  let value = "";
  try {
    await new Promise<void>((resolve, reject) => {
      const onData = (chunk: string | Buffer) => {
        const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
        for (const ch of text) {
          if (ch === "\r" || ch === "\n") {
            cleanup();
            output.write("\n");
            resolve();
            return;
          }
          if (ch === "\u0003") {
            cleanup();
            output.write("\n");
            reject(new Error(t("ask.cancelled")));
            return;
          }
          if (ch === "\u0008" || ch === "\u007f") {
            if (value.length > 0) {
              value = value.slice(0, -1);
              output.write("\b \b");
            }
            continue;
          }
          if (ch < " ") continue;
          value += ch;
          output.write("*");
        }
      };
      const cleanup = () => {
        input.off("data", onData);
        if (input.isTTY) input.setRawMode(false);
      };
      input.on("data", onData);
    });
  } finally {
    if (input.isTTY) input.setRawMode(false);
    rl.resume();
  }
  return value;
}
