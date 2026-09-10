import "./cursor-sdk-init.ts";
import { handleEarlyCli } from "./cli-flags.ts";
import { runCli } from "./cli.ts";
import { startServer } from "./server.ts";

if (process.argv.includes("--serve")) {
  startServer();
} else if (await handleEarlyCli(process.argv)) {
  /* --help / --clean / --projects */
} else {
  await runCli();
}
