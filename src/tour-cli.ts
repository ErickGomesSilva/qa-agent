import { applySavedSettings, buildRunBody } from "./setup.ts";
import { loadSettings } from "./settings.ts";
import { startRun } from "./orchestrator.ts";
import { ensureWorkspace } from "./workspace.ts";

ensureWorkspace();
applySavedSettings();

const settings = loadSettings();
const body = buildRunBody(false);
body.mode = "user-tour";
if (!body.requisitosPath && settings.requisitosPath) body.requisitosPath = settings.requisitosPath;
if (!body.baseUrl && settings.baseUrl) body.baseUrl = settings.baseUrl;

console.log("user-tour: janela visivel; clica na UI como usuario; grava scripts/falhas/JORNADA.md");

startRun(body, {
  wait: true,
  onLog: (line) => console.log(line),
})
  .then((run) => {
    console.log(`\nFim: ${run.status}`);
    process.exitCode = run.status === "tour_complete" ? 0 : 2;
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
