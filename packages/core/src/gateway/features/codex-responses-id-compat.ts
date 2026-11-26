/**
 * Codex stores function-call ids and reasoning item ids from earlier turns in
 * its session history. The OpenAI Responses API accepts `call_*` as
 * `call_id`, but function-call item ids must use `fc_` / `fco_`. When
 * `store:false`, previously generated reasoning items are not persisted and
 * their `rs_*` ids cannot be referenced again.
 *
 * Normalize only Codex-style ids; leave already-valid item ids alone.
 */
import { isRecord, stringValue } from "@ccr/core/gateway/internal/value";

export const codexResponsesIdCompatHeader = "x-omr-codex-responses-id-compat";

export function normalizeCodexResponsesInputIds(
  body: Record<string, unknown>
): { body: Record<string, unknown>; changed: number } | undefined {
  if (!Array.isArray(body.input)) {
    return undefined;
  }
  const stripReasoningIds = body.store !== true;
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
    if (type === "reasoning" && stripReasoningIds) {
      changed += 1;
      const { id: _id, ...rest } = item;
      return rest;
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
