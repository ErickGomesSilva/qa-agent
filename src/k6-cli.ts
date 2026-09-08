import { config } from "./config.ts";
import { applySavedSettings, buildRunBody } from "./setup.ts";
import { loadSettings } from "./settings.ts";
import { startRun } from "./orchestrator.ts";
import { ensureWorkspace } from "./workspace.ts";

ensureWorkspace();
applySavedSettings();
process.env.K6_ENABLED = "true";

const settings = loadSettings();
const body = buildRunBody(false);
body.mode = "load-only";
if (!body.requisitosPath && settings.requisitosPath) body.requisitosPath = settings.requisitosPath;
if (!body.baseUrl && settings.baseUrl) body.baseUrl = settings.baseUrl;

console.log(`k6: vus=${config.k6Vus} duration=${config.k6Duration} enabled=${config.k6Enabled}`);

startRun(body, {
  wait: true,
  onLog: (line) => console.log(line),
})
  .then((run) => {
    console.log(`\nFim: ${run.status}`);
    if (run.k6?.reportMdPath) console.log(`Relatório k6: ${run.k6.reportMdPath}`);
    process.exitCode = run.status === "load_complete" ? 0 : 2;
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
