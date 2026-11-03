import { buildBrowserRenderer, buildMain, buildRenderer, buildStyles, buildTrayRenderer, buildWebClientBridge, cleanDist, copyAppAssets, copyBrowserRendererHtml, copyBundledClaudeRuntimePlugins, copyModelCatalog, copyRendererHtml, copyTrayRendererHtml, syncUiRendererToRuntimeDists } from "./esbuild.config.mjs";

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
  buildTrayRenderer({ mode }),
  buildWebClientBridge({ mode }),
  buildStyles({ minify: mode === "production" })
]);

syncUiRendererToRuntimeDists();

// 断言: 前端 bridge 的 RPC 端点必须与服务端路由一致, 且构建产物不能是陈旧的。
// 陈旧产物 => 运行时 405 => GUI 能看不能点 (2026-11-03 实测, 无任何运行时告警)。
await import("./../scripts/verify-renderer-bridge.mjs");

console.log(`Built monorepo package assets in ${mode} mode.`);
