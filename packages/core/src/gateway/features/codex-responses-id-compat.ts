/**
 * Codex stores a function_call's call id in both `id` and `call_id` in its
 * session history. The OpenAI Responses API requires the item `id` to use the
 * `fc_` prefix (function calls) or `fco_` prefix (function call outputs), while
 * `call_id` remains the Chat-Completions-style `call_*` value.
 *
 * Normalize only Codex-style call ids; leave already-valid item ids alone.
 */
import { isRecord, stringValue } from "@ccr/core/gateway/internal/value";

export const codexResponsesIdCompatHeader = "x-omr-codex-responses-id-compat";

export function normalizeCodexResponsesInputIds(
  body: Record<string, unknown>
): { body: Record<string, unknown>; changed: number } | undefined {
  if (!Array.isArray(body.input)) {
    return undefined;
  }
  let changed = 0;
  const input = body.input.map((item) => {
    if (!isRecord(item)) {
      return item;
    }
    const type = stringValue(item.type);
    const id = stringValue(item.id);
    if (!id) {
      return item;
    }
    if (type === "function_call" && id.startsWith("call_")) {
      changed += 1;
      return { ...item, id: `fc_${id.slice("call_".length)}` };
    }
    if (type === "function_call_output" && (id.startsWith("call_") || !id.startsWith("fco_"))) {
      changed += 1;
      return {
        ...item,
        id: `fco_${id.startsWith("call_") ? id.slice("call_".length) : id}`
      };
    }
    return item;
  });
  return changed > 0 ? { body: { ...body, input }, changed } : undefined;
}
