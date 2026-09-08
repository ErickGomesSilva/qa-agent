import { config } from "./config.ts";
import { applySavedSettings, buildRunBody } from "./setup.ts";
import { loadSettings } from "./settings.ts";
import { startRun } from "./orchestrator.ts";
import { ensureWorkspace } from "./workspace.ts";

ensureWorkspace();
applySavedSettings();

const settings = loadSettings();
const body = buildRunBody(false);
body.mode = "generate-massa";
if (!body.requisitosPath && settings.requisitosPath) body.requisitosPath = settings.requisitosPath;
if (!body.baseUrl && settings.baseUrl) body.baseUrl = settings.baseUrl;

console.log(`generate-massa: limite ${config.massaGenerateLimit} entradas por rodada`);

startRun(body, {
  wait: true,
  onLog: (line) => console.log(line),
})
  .then((run) => {
    console.log(`\nFim: ${run.status}`);
    console.log("Arquivo: data/workspace/scripts/massa/dados.json");
    process.exitCode = run.status === "massa_complete" ? 0 : 2;
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
