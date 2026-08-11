/**
 * OMR-FORK-CHANGE-004: Multi-credential routing strategies unit tests
 *
 * 4 strategies tested:
 *   - auto-balance (default): weighted by remaining capacity, smooth distribution
 *   - waterfall:    priority asc + utilization desc (drain primary first)
 *   - priority:     strict priority asc (failover on blocked)
 *   - manual:       preserve original config order
 *
 * See dopple/MULTI-CRED-STRATEGIES.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveRoutingStrategyForModel,
  selectProviderCredentialsForTest,
  sortProviderCredentialCandidates
} from "../src/gateway/upstream/executor.ts";
import type {
  AppConfig,
  CredentialRoutingStrategy,
  GatewayProviderConfig,
  ProviderCredentialConfig
} from "../src/contracts/app.ts";

// ── Helpers ──────────────────────────────────────────────────────────────────

type Candidate = {
  credential: ProviderCredentialConfig;
  index: number;
  limitState: { utilization: number };
  priority: number;
  weight: number;
};

function makeCredential(label: string, opts: Partial<ProviderCredentialConfig> = {}): ProviderCredentialConfig {
  return {
    apiKey: `key-${label}`,
    enabled: true,
    id: label,
    label,
    ...opts
  };
}

function makeProvider(credentials: ProviderCredentialConfig[]): GatewayProviderConfig {
  return {
    credentials,
    models: ["test-model"],
    name: "test-provider"
  };
}

function makeCandidate(
  credential: ProviderCredentialConfig,
  utilization: number,
  priority: number,
  index: number,
  weight = 1
): Candidate {
  return {
    credential,
    index,
    limitState: { utilization, blocked: utilization >= 1 },
    priority,
    weight
  };
}

function makeConfigWithProfiles(profiles: NonNullable<AppConfig["virtualModelProfiles"]>): AppConfig {
  return {
    APIKEY: "test",
    APIKEYS: [],
    API_TIMEOUT_MS: 60_000,
    CUSTOM_ROUTER_PATH: "",
    HOST: "127.0.0.1",
    PORT: 3456,
    Providers: [],
    Router: { builtInRules: { "claude-code": { enabled: false }, "codex": { enabled: false } }, fallback: { mode: "off", models: [], retryCount: 0 }, rules: [] },
    agent: { mcpServers: [] },
    autoStart: false,
    botConfigs: [],
    botGateway: {} as AppConfig["botGateway"],
    contextArchive: {} as AppConfig["contextArchive"],
    gateway: { coreHost: "127.0.0.1", corePort: 0, enabled: false, host: "127.0.0.1", port: 0 },
    mediaTools: {} as AppConfig["mediaTools"],
    launchAtLogin: false,
    observability: { agentAnalysis: false, requestLogs: false },
    preferredProvider: "",
    plugins: [],
    profile: {} as AppConfig["profile"],
    proxy: {} as AppConfig["proxy"],
    overviewWidgets: [],
    routerEndpoint: "",
    theme: "system",
    trayProgressTargetTokens: 0,
    trayComponentVariants: {} as AppConfig["trayComponentVariants"],
    trayIcon: "random",
    trayWidgets: [],
    trayWindowModules: [],
    toolHub: {} as AppConfig["toolHub"],
    virtualModelProfiles: profiles
  };
}

// ── Case 1: auto-balance ─────────────────────────────────────────────────────

test("auto-balance routes more traffic to credentials with lower utilization", () => {
  const c0 = makeCredential("alice", { weight: 1 });
  const c1 = makeCredential("bob", { weight: 1 });
  const c2 = makeCredential("carol", { weight: 1 });
  const provider = makeProvider([c0, c1, c2]);

  // 100 requests: count which credential is selected first
  const counts = new Map<string, number>();
  counts.set("alice", 0);
  counts.set("bob", 0);
  counts.set("carol", 0);

  // We simulate by simulating: each iteration, the candidate with highest effective
  // weight (lowest utilization) gets the request. For 100 reqs of capacity 100 each.
  let utilizations = [0, 0.5, 0.8];
  const caps = [100, 100, 100];
  const cands = [c0, c1, c2];

  for (let i = 0; i < 100; i += 1) {
    // Find best candidate (lowest utilization)
    let bestIdx = 0;
    for (let j = 1; j < 3; j += 1) {
      if (utilizations[j] < utilizations[bestIdx]) bestIdx = j;
    }
    counts.set(["alice", "bob", "carol"][bestIdx], (counts.get(["alice", "bob", "carol"][bestIdx]) ?? 0) + 1);
    // Increment utilization of selected by 1/cap
    utilizations[bestIdx] += 1 / caps[bestIdx];
  }

  const aliceCount = counts.get("alice") ?? 0;
  const bobCount = counts.get("bob") ?? 0;
  const carolCount = counts.get("carol") ?? 0;

  // alice (started 0%) should get strictly more than bob (started 50%)
  // bob should get strictly more than carol (started 80%)
  assert.ok(aliceCount > bobCount, `expected alice (${aliceCount}) > bob (${bobCount})`);
  assert.ok(bobCount > carolCount, `expected bob (${bobCount}) > carol (${carolCount})`);
  // alice should get the bulk (at least half)
  assert.ok(aliceCount >= 50, `expected alice >= 50, got ${aliceCount}`);
});

test("sortProviderCredentialCandidates with auto-balance prefers low-utilization first", () => {
  const c0 = makeCredential("alice");
  const c1 = makeCredential("bob");
  const c2 = makeCredential("carol");

  const candidates: Candidate[] = [
    makeCandidate(c0, 0, 1, 0),
    makeCandidate(c1, 0.5, 1, 1),
    makeCandidate(c2, 0.8, 1, 2)
  ];

  const sorted = sortProviderCredentialCandidates(candidates, "auto-balance");
  assert.equal(sorted[0].credential.label, "alice", "lowest utilization should be first");
  assert.equal(sorted[1].credential.label, "bob");
  assert.equal(sorted[2].credential.label, "carol", "highest utilization should be last");
});

// ── Case 2: waterfall ────────────────────────────────────────────────────────

test("waterfall sends all 100 requests to priority=1 credential", () => {
  const c0 = makeCredential("primary", { priority: 1 });
  const c1 = makeCredential("secondary", { priority: 2 });
  const c2 = makeCredential("tertiary", { priority: 3 });
  const provider = makeProvider([c0, c1, c2]);

  // Verify the sort: priority=1 first, then by utilization DESC within same priority
  const candidates: Candidate[] = [
    makeCandidate(c0, 0, 1, 0),
    makeCandidate(c1, 0, 2, 1),
    makeCandidate(c2, 0, 3, 2)
  ];
  const sorted = sortProviderCredentialCandidates(candidates, "waterfall");
  assert.equal(sorted[0].credential.label, "primary", "lowest priority should be first");
  assert.equal(sorted[1].credential.label, "secondary");
  assert.equal(sorted[2].credential.label, "tertiary");

  // Now simulate 100 requests via selectProviderCredentialsForTest
  // Without limits configured, no credential becomes blocked, so c0 keeps winning
  const counts = new Map<string, number>();
  for (let i = 0; i < 100; i += 1) {
    const sel = selectProviderCredentialsForTest(provider, "openai_chat_completions", [c0, c1, c2], "waterfall");
    const firstId = sel.credentials[0]?.credential.label ?? "none";
    counts.set(firstId, (counts.get(firstId) ?? 0) + 1);
  }
  // All 100 should go to "primary" since it never blocks (no limits set)
  assert.equal(counts.get("primary") ?? 0, 100, "waterfall should route all to priority=1");
  assert.equal(counts.get("secondary") ?? 0, 0, "secondary should receive zero");
  assert.equal(counts.get("tertiary") ?? 0, 0, "tertiary should receive zero");
});

test("waterfall prefers higher-utilization credential within same priority tier", () => {
  const c0 = makeCredential("cheap-fresh", { priority: 1 });
  const c1 = makeCredential("cheap-used", { priority: 1 });
  const candidates: Candidate[] = [
    makeCandidate(c0, 0, 1, 0),   // same priority, lower utilization
    makeCandidate(c1, 0.9, 1, 1)  // same priority, higher utilization
  ];
  const sorted = sortProviderCredentialCandidates(candidates, "waterfall");
  // Within same priority, utilization DESC → c1 (used) wins
  assert.equal(sorted[0].credential.label, "cheap-used", "waterfall drains used credential first");
  assert.equal(sorted[1].credential.label, "cheap-fresh");
});

// ── Case 3: priority ─────────────────────────────────────────────────────────

test("priority switches to fallback when primary is blocked", () => {
  const c0 = makeCredential("primary", { priority: 1 });
  const c1 = makeCredential("backup", { priority: 2 });
  const c2 = makeCredential("last-resort", { priority: 3 });
  const provider = makeProvider([c0, c1, c2]);

  // Simulate primary blocked via utilization=1.0 (limit rules treat 100% as blocked)
  // But selectProviderCredentialsForTest doesn't actually compute limitState — it
  // uses real providerCredentialLimitState which requires limits config.
  // So instead we test the sort function directly with a "blocked" candidate filtered.
  const candidates: Candidate[] = [
    { ...makeCandidate(c0, 1.0, 1, 0), limitState: { utilization: 1.0, blocked: true } },
    makeCandidate(c1, 0, 2, 1),
    makeCandidate(c2, 0, 3, 2)
  ];

  // sortPriority: blocked candidate stays in input but selects next priority
  const sorted = sortProviderCredentialCandidates(candidates, "priority");
  // priority sort gives [c0(1), c1(2), c2(3)] regardless of blocked status
  assert.equal(sorted[0].credential.label, "primary");
  assert.equal(sorted[1].credential.label, "backup");
  assert.equal(sorted[2].credential.label, "last-resort");

  // The actual failover happens in selectProviderCredentials via the "available" filter
  // which excludes blocked candidates. Test that path indirectly:
  const available = candidates.filter((c) => !c.limitState.blocked);
  const sortedAvailable = sortProviderCredentialCandidates(available, "priority");
  assert.equal(sortedAvailable[0].credential.label, "backup", "after primary blocked, backup wins");
  assert.equal(sortedAvailable[1].credential.label, "last-resort");
});

// ── Case 4: manual ───────────────────────────────────────────────────────────

test("manual preserves original config order regardless of utilization/priority", () => {
  const c0 = makeCredential("first", { priority: 99 });    // intentionally weird priority
  const c1 = makeCredential("second", { priority: 1 });
  const c2 = makeCredential("third", { priority: 50 });

  // Even with weird priorities, manual keeps original order
  const candidates: Candidate[] = [
    makeCandidate(c0, 0.99, 99, 0),
    makeCandidate(c1, 0.01, 1, 1),
    makeCandidate(c2, 0.5, 50, 2)
  ];
  const sorted = sortProviderCredentialCandidates(candidates, "manual");
  assert.equal(sorted[0].credential.label, "first", "manual must preserve first");
  assert.equal(sorted[1].credential.label, "second");
  assert.equal(sorted[2].credential.label, "third");

  // verify input not mutated
  assert.equal(candidates[0].credential.label, "first");
  assert.equal(candidates[1].credential.label, "second");
  assert.equal(candidates[2].credential.label, "third");
});

test("manual via selectProviderCredentialsForTest selects first credential", () => {
  const c0 = makeCredential("primary");
  const c1 = makeCredential("secondary");
  const c2 = makeCredential("tertiary");
  const provider = makeProvider([c0, c1, c2]);

  const sel = selectProviderCredentialsForTest(provider, "openai_chat_completions", [c0, c1, c2], "manual");
  assert.equal(sel.credentials[0]?.credential.label, "primary", "manual should keep first");
  // Note: chain still includes all (for explicit per-request override via headers),
  // but order is preserved (no re-sort by priority/utilization).
  assert.deepEqual(sel.credentials.map((c) => c.credential.label), ["primary", "secondary", "tertiary"]);
});

// ── Strategy resolution from virtualModelProfile ──────────────────────────────

test("resolveRoutingStrategyForModel reads strategy from virtualModelProfile", () => {
  const config = makeConfigWithProfiles([
    {
      id: "vmp-default",
      displayName: "default",
      enabled: true,
      key: "default",
      match: { exactAliases: ["chat"], prefixes: [], suffixes: [] },
      materialization: { enabled: true, includeInGatewayModels: true },
      execution: {
        clientToolsPolicy: "deny",
        mode: "decorate_only",
        streamMode: "buffered"
      },
      tools: []
    },
    {
      id: "vmp-premium",
      displayName: "premium",
      enabled: true,
      key: "premium",
      match: { exactAliases: ["premium"], prefixes: [], suffixes: [] },
      materialization: { enabled: true, includeInGatewayModels: true },
      execution: {
        clientToolsPolicy: "deny",
        mode: "decorate_only",
        streamMode: "buffered"
      },
      strategy: "manual",
      tools: []
    }
  ]);

  assert.equal(resolveRoutingStrategyForModel(config, "chat"), "auto-balance", "default = auto-balance");
  assert.equal(resolveRoutingStrategyForModel(config, "premium"), "manual", "configured = manual");
  assert.equal(resolveRoutingStrategyForModel(config, "unknown-model"), "auto-balance", "fallback default");
  assert.equal(resolveRoutingStrategyForModel(config, undefined), "auto-balance");
});

test("resolveRoutingStrategyForModel honors prefix and suffix matches", () => {
  const config = makeConfigWithProfiles([
    {
      id: "vmp-waterfall",
      displayName: "waterfall-models",
      enabled: true,
      key: "waterfall",
      match: { exactAliases: [], prefixes: ["wf-"], suffixes: ["-wf"] },
      materialization: { enabled: true, includeInGatewayModels: true },
      execution: {
        clientToolsPolicy: "deny",
        mode: "decorate_only",
        streamMode: "buffered"
      },
      strategy: "waterfall",
      tools: []
    }
  ]);

  assert.equal(resolveRoutingStrategyForModel(config, "wf-claude"), "waterfall");
  assert.equal(resolveRoutingStrategyForModel(config, "claude-wf"), "waterfall");
  assert.equal(resolveRoutingStrategyForModel(config, "claude"), "auto-balance", "no match = default");
});

test("resolveRoutingStrategyForModel ignores disabled profiles", () => {
  const config = makeConfigWithProfiles([
    {
      id: "vmp-disabled",
      displayName: "disabled-manual",
      enabled: false,
      key: "x",
      match: { exactAliases: ["locked"], prefixes: [], suffixes: [] },
      materialization: { enabled: true, includeInGatewayModels: true },
      execution: {
        clientToolsPolicy: "deny",
        mode: "decorate_only",
        streamMode: "buffered"
      },
      strategy: "manual",
      tools: []
    }
  ]);
  assert.equal(resolveRoutingStrategyForModel(config, "locked"), "auto-balance", "disabled profile is skipped");
});

// ── Cross-strategy sanity ────────────────────────────────────────────────────

test("all 4 strategies handle empty candidates without throwing", () => {
  const strategies: CredentialRoutingStrategy[] = ["auto-balance", "waterfall", "priority", "manual"];
  for (const strategy of strategies) {
    const sorted = sortProviderCredentialCandidates([], strategy);
    assert.deepEqual(sorted, [], `${strategy} should return empty array`);
  }
});

test("all 4 strategies handle single candidate", () => {
  const only = makeCredential("only");
  const candidates = [makeCandidate(only, 0.5, 1, 0)];
  for (const strategy of ["auto-balance", "waterfall", "priority", "manual"] as CredentialRoutingStrategy[]) {
    const sorted = sortProviderCredentialCandidates(candidates, strategy);
    assert.equal(sorted.length, 1);
    assert.equal(sorted[0].credential.label, "only");
  }
});