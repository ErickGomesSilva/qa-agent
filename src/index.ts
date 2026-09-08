import "./cursor-sdk-init.ts";
import { runCli } from "./cli.ts";
import { startServer } from "./server.ts";

if (process.argv.includes("--serve")) {
  startServer();
} else {
  await runCli();
}
