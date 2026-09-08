import { config } from "./config.ts";
import { applySavedSettings, buildRunBody } from "./setup.ts";
import { loadSettings } from "./settings.ts";
import { startRun } from "./orchestrator.ts";
import { ensureWorkspace } from "./workspace.ts";

ensureWorkspace();
applySavedSettings();

const settings = loadSettings();
const body = buildRunBody(false);
body.mode = "unblock-massa";
if (!body.requisitosPath && settings.requisitosPath) body.requisitosPath = settings.requisitosPath;
if (!body.baseUrl && settings.baseUrl) body.baseUrl = settings.baseUrl;

console.log(`unblock-massa: limite ${config.massaUnblockLimit} entradas por rodada`);

startRun(body, {
  wait: true,
  onLog: (line) => console.log(line),
})
  .then((run) => {
    console.log(`\nFim: ${run.status}`);
    if (run.coverage) {
      console.log(
        `Cobertura: real=${run.coverage.real} massa=${run.coverage.skipMassa}`,
      );
    }
    process.exitCode = run.status === "unblock_complete" ? 0 : 2;
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
