import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildBrowserRenderer,
  buildCoreServer,
  buildRenderer,
  buildRequestLogBodyWorker,
  buildStyles,
  buildTrayRenderer,
  buildWebClientBridge,
  cleanDist,
  copyBrowserRendererHtml,
  copyModelCatalog,
  copyRendererHtml,
  copyTrayRendererHtml,
  syncUiRendererToRuntimeDists
} from "./esbuild.config.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modelCatalog = path.join(projectRoot, "packages", "core", "models.json");

if (process.env.OMR_BUILD_REFRESH === "1") {
  await import("../scripts/generate-models-json.mjs");
} else if (!existsSync(modelCatalog)) {
  throw new Error(
    "Missing generated model catalog: packages/core/models.json. Run with OMR_BUILD_REFRESH=1 once, then commit the result."
  );
}

const mode = process.argv.includes("--dev") ? "development" : "production";

cleanDist();
copyModelCatalog();
copyBrowserRendererHtml();
copyRendererHtml();
copyTrayRendererHtml();

await Promise.all([
  buildCoreServer({ mode }),
  buildBrowserRenderer({ mode }),
  buildRenderer({ mode }),
  buildRequestLogBodyWorker({ mode }),
  buildTrayRenderer({ mode }),
  buildWebClientBridge({ mode }),
  buildStyles({ minify: mode === "production" })
]);

syncUiRendererToRuntimeDists();

console.log(`Built Docker core server and UI assets in ${mode} mode.`);
