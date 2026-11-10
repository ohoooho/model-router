import React from "react";
import { createRoot } from "react-dom/client";
import { BaseUiProvider } from "@/lib/baseui-provider";
import App from "./App";
import VirtualRoutes from "./components/VirtualRoutes";

// OMR UI v2 hash 路由 (老板 09-14 lockin: 项目体系更新)
// 老 CCR UI 默认, 加 #v2 切新 UI (4 档虚拟路由卡片 + hot reload)
const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element not found");
}

// 老 UI 的 RPC 桥: window.ccr.rpc(method, ...args) → Promise
function bridgeRpc(method: string, ...args: unknown[]): Promise<unknown> {
  const win = window as unknown as { ccr?: { rpc?: (m: string, ...a: unknown[]) => Promise<unknown> }; omr?: { rpc?: (m: string, ...a: unknown[]) => Promise<unknown> } };
  const bridge = win.omr?.rpc ? win.omr : win.ccr;
  if (!bridge?.rpc) {
    return Promise.reject(new Error("OMR web RPC bridge not ready. Run 'omr serve' first."));
  }
  return bridge.rpc(method, ...args);
}

const isV2 = typeof window !== "undefined" && window.location.hash.startsWith("#v2");

createRoot(container).render(
  <React.StrictMode>
    <BaseUiProvider>
      {isV2 ? (
        <VirtualRoutes rpc={bridgeRpc} />
      ) : (
        <App />
      )}
    </BaseUiProvider>
  </React.StrictMode>
);

