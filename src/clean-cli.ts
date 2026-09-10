import { runCleanCli } from "./cli-flags.ts";

await runCleanCli(["--clean", ...process.argv.slice(2)]);
