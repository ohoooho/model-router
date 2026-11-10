#!/usr/bin/env node
// 构建期断言: Web 前端 bridge 打的 RPC 端点 必须与 core 服务端路由一致。
//
// 为什么必须有 (2026-11-03 实战踩坑):
//   已安装包里的前端产物是 8 月 8 日的**上游构建**, bridge 打 /api/ccr/rpc,
//   而 fork 服务端只路由 /api/omr/rpc
//   => POST 落到非 GET 分支 => 405 "Method not allowed"
//   => React 界面渲染完全正常, 但**所有写操作全废**(能看不能点)
//   这类错运行时没有任何告警, 只能靠构建期拦住。
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(repoRoot, rel), "utf8");

const BRIDGE_SRC = "packages/ui/src/web-client-bridge.ts";
const SERVER_SRC = "packages/core/src/web/management-server.ts";

const bridgeEndpoint = read(BRIDGE_SRC).match(/rpcEndpoint\s*=\s*"([^"]+)"/)?.[1];
const serverRoute = read(SERVER_SRC).match(/url\.pathname\s*===\s*"([^"]+)"/)?.[1];

const fail = (msg) => {
  console.error(`✗ renderer bridge 断言失败: ${msg}`);
  process.exit(1);
};

if (!bridgeEndpoint) fail(`${BRIDGE_SRC} 里解析不出 rpcEndpoint`);
if (!serverRoute) fail(`${SERVER_SRC} 里解析不出 RPC 路由`);
if (bridgeEndpoint !== serverRoute) {
  fail(`前端 bridge 打 ${bridgeEndpoint}, 服务端只路由 ${serverRoute} => 405, GUI 能看不能点`);
}

// 已构建产物再验一遍 (防止源码对了但产物是陈旧的)
const builtFiles = [
  "packages/ui/dist/renderer/assets/web-client-bridge.js",
  "packages/cli/dist/renderer/assets/web-client-bridge.js",
  "packages/core/dist/renderer/assets/web-client-bridge.js",
  "packages/electron/dist/renderer/assets/web-client-bridge.js"
];
let checked = 0;
for (const rel of builtFiles) {
  if (!existsSync(path.join(repoRoot, rel))) continue;
  checked += 1;
  const content = read(rel);
  if (!content.includes(bridgeEndpoint)) {
    fail(`${rel} 里没有 ${bridgeEndpoint} => 产物是陈旧的 (陈旧产物会在运行时报 405)`);
  }
  const stale = content.includes("/api/ccr/rpc");
  if (stale) fail(`${rel} 里还残留上游端点 /api/ccr/rpc`);
}

console.log(`✓ renderer bridge 断言通过 (前端/服务端端点一致: ${bridgeEndpoint}; 已验 ${checked} 个构建产物)`);
