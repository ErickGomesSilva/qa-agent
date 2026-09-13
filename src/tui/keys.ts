export type Key =
  | { type: "f"; n: number }
  | { type: "char"; ch: string }
  | { type: "enter" }
  | { type: "tab"; shift: boolean }
  | { type: "backspace" }
  | { type: "escape" }
  | { type: "left" }
  | { type: "right" }
  | { type: "up" }
  | { type: "down" }
  | { type: "pageup" }
  | { type: "pagedown" }
  | { type: "home" }
  | { type: "end" }
  | { type: "ctrl"; ch: string };

const F_CSI: Record<string, number> = {
  "11": 1,
  "12": 2,
  "13": 3,
  "14": 4,
  "15": 5,
  "17": 6,
  "18": 7,
  "19": 8,
  "20": 9,
  "21": 10,
  "23": 11,
  "24": 12,
};

export function attachKeys(onKey: (key: Key) => void): () => void {
  const stdin = process.stdin;
  if (!stdin.isTTY) throw new Error("Precisa de um terminal interativo (TTY)");

  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");

  let buf = "";
  let escTimer: ReturnType<typeof setTimeout> | undefined;

  const flushEsc = () => {
    escTimer = undefined;
    if (buf === "\x1b") {
      buf = "";
      onKey({ type: "escape" });
    }
  };

  const emit = (key: Key) => {
    onKey(key);
  };

  const onData = (chunk: string | Buffer) => {
    buf += typeof chunk === "string" ? chunk : chunk.toString("utf8");

    while (buf.length) {
      if (escTimer) {
        clearTimeout(escTimer);
        escTimer = undefined;
      }

      const c0 = buf[0];
      if (c0 !== "\x1b") {
        const ch = buf[0] ?? "";
        buf = buf.slice(1);
        if (ch === "\r" || ch === "\n") emit({ type: "enter" });
        else if (ch === "\t") emit({ type: "tab", shift: false });
        else if (ch === "\x7f" || ch === "\b") emit({ type: "backspace" });
        else if (ch === "\x03") emit({ type: "ctrl", ch: "c" });
        else if (ch === "\x13") emit({ type: "ctrl", ch: "s" });
        else if (ch < " ") continue;
        else emit({ type: "char", ch });
        continue;
      }

      if (buf.length === 1) {
        escTimer = setTimeout(flushEsc, 40);
        return;
      }

      // SS3: ESC O P/Q/R/S = F1-F4  | ESC O A/B/C/D arrows
      if (buf[1] === "O" && buf.length >= 3) {
        const t = buf[2] ?? "";
        buf = buf.slice(3);
        const f = { P: 1, Q: 2, R: 3, S: 4 }[t];
        if (f) emit({ type: "f", n: f });
        else if (t === "A") emit({ type: "up" });
        else if (t === "B") emit({ type: "down" });
        else if (t === "C") emit({ type: "right" });
        else if (t === "D") emit({ type: "left" });
        continue;
      }

      if (buf[1] === "[") {
        const m = buf.match(/^\x1b\[(\d+)~/);
        if (m) {
          buf = buf.slice(m[0].length);
          const code = m[1] ?? "";
          const f = F_CSI[code];
          if (f) emit({ type: "f", n: f });
          else if (code === "5") emit({ type: "pageup" });
          else if (code === "6") emit({ type: "pagedown" });
          else if (code === "1" || code === "7") emit({ type: "home" });
          else if (code === "4" || code === "8") emit({ type: "end" });
          continue;
        }
        if (buf.length >= 3) {
          const t = buf[2] ?? "";
          buf = buf.slice(3);
          if (t === "A") emit({ type: "up" });
          else if (t === "B") emit({ type: "down" });
          else if (t === "C") emit({ type: "right" });
          else if (t === "D") emit({ type: "left" });
          else if (t === "H") emit({ type: "home" });
          else if (t === "F") emit({ type: "end" });
          else if (t === "Z") emit({ type: "tab", shift: true });
          continue;
        }
        return;
      }

      buf = buf.slice(1);
      emit({ type: "escape" });
    }
  };

  stdin.on("data", onData);
  return () => {
    if (escTimer) clearTimeout(escTimer);
    stdin.off("data", onData);
    if (stdin.isTTY) stdin.setRawMode(false);
    stdin.pause();
  };
}
