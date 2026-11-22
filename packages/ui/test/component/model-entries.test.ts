import assert from "node:assert/strict";
import test from "node:test";
import { isBuiltinSceneProfile, isModelEntry } from "@ccr/ui/pages/home/components/model-entries.tsx";

function profile(alias: string, metadata?: Record<string, unknown>) {
  return {
    baseModel: { fixedModel: `baozi/${alias}`, mode: "fixed" as const },
    displayName: alias,
    enabled: true,
    execution: {
      clientToolsPolicy: "allow" as const,
      mode: "tool_loop" as const,
      streamMode: "optimistic" as const
    },
    id: alias,
    key: alias,
    match: { exactAliases: [alias] },
    materialization: { enabled: true, includeInGatewayModels: true },
    metadata,
    tools: []
  };
}

test("model entries include built-in scene aliases without metadata", () => {
  for (const alias of ["coding-auto", "assist-auto", "chat-auto", "team-auto", "trial-auto"]) {
    const item = profile(alias);
    assert.equal(isBuiltinSceneProfile(item), true, `${alias} should be built-in`);
    assert.equal(isModelEntry(item), true, `${alias} should be listed`);
  }
});

test("model entries include user-created aliases and exclude unrelated legacy virtual models", () => {
  const custom = profile("baozi-code", { source: "model-entry" });
  assert.equal(isBuiltinSceneProfile(custom), false);
  assert.equal(isModelEntry(custom), true);

  const legacy = profile("legacy-fusion");
  assert.equal(isBuiltinSceneProfile(legacy), false);
  assert.equal(isModelEntry(legacy), false);
});
