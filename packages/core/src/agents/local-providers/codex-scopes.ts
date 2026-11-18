// Local Codex tokens authorize model inference without connector permissions.
export function localCodexOauthConfig(plugin: Record<string, unknown>): Record<string, unknown> {
  const oauth = plugin.codexOauth as Record<string, unknown>;
  const key = typeof plugin.key === "string" ? plugin.key.toLowerCase() : "";
  const importedLocalAgent = key.startsWith("omr-local-agent-") || key.startsWith("ccr-local-agent-");
  return importedLocalAgent && key.includes("codex-oauth") && oauth.requiredScopes === undefined
    ? { ...oauth, requiredScopes: [] }
    : oauth;
}

export function codexRequiredScopes(value: unknown): string[] {
  if (Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim())) {
    return [...new Set(value.flatMap((item: string) => item.trim().split(/\s+/)))];
  }
  return ["api.connectors.read", "api.connectors.invoke"];
}
