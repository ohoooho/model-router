import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildBrowserRenderer, buildMain, buildRenderer, buildRequestLogBodyWorker, buildStyles, buildTrayRenderer, buildWebClientBridge, cleanDist, copyAppAssets, copyBrowserRendererHtml, copyBundledClaudeRuntimePlugins, copyModelCatalog, copyRendererHtml, copyTrayRendererHtml, syncUiRendererToRuntimeDists } from "./esbuild.config.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedCatalogFiles = [
  "packages/core/models.json",
  "packages/ui/src/generated/claude-code-config-options.json"
];

// Release builds must be byte-reproducible. The generated catalogs are
// checked in; only refresh them when a maintainer explicitly asks for a network
// refresh. Otherwise two clean checkouts can produce different tarballs because
// the upstream model/doc APIs changed between builds.
if (process.env.OMR_BUILD_REFRESH === "1") {
  await import("../scripts/generate-models-json.mjs");
  await import("./../scripts/generate-claude-code-config-options.mjs");
} else {
  for (const relativePath of generatedCatalogFiles) {
    const absolutePath = path.join(projectRoot, relativePath);
    if (!existsSync(absolutePath)) {
      throw new Error(
        `Missing generated catalog: ${relativePath}. Run with OMR_BUILD_REFRESH=1 once, then commit the result.`
      );
    }
  }
}

const mode = process.argv.includes("--dev") ? "development" : "production";

cleanDist();
copyAppAssets();
copyBundledClaudeRuntimePlugins();
copyModelCatalog();
copyBrowserRendererHtml();
copyRendererHtml();
copyTrayRendererHtml();

await Promise.all([
  buildMain({ mode }),
  buildBrowserRenderer({ mode }),
  buildRenderer({ mode }),
  buildRequestLogBodyWorker({ mode }),
  buildTrayRenderer({ mode }),
  buildWebClientBridge({ mode }),
  buildStyles({ minify: mode === "production" })
]);

syncUiRendererToRuntimeDists();

// 断言: 前端 bridge 的 RPC 端点必须与服务端路由一致, 且构建产物不能是陈旧的。
// 陈旧产物 => 运行时 405 => GUI 能看不能点 (2026-11-03 实测, 无任何运行时告警)。
await import("./../scripts/verify-renderer-bridge.mjs");

console.log(`Built monorepo package assets in ${mode} mode.`);
