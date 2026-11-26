import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCodexResponsesInputIds } from "@ccr/core/gateway/features/codex-responses-id-compat.ts";

test("normalizes Codex call ids on Responses function call items", () => {
  const result = normalizeCodexResponsesInputIds({
    input: [
      {
        type: "function_call",
        id: "call_NAkoOzN04TLL6GReUhSmxVAM",
        call_id: "call_NAkoOzN04TLL6GReUhSmxVAM",
        name: "exec_command",
        arguments: "{}"
      },
      {
        type: "function_call_output",
        id: "call_NAkoOzN04TLL6GReUhSmxVAM",
        call_id: "call_NAkoOzN04TLL6GReUhSmxVAM",
        output: "ok"
      }
    ]
  });

  assert.ok(result);
  assert.equal(result.changed, 2);
  assert.equal(result.body.input[0].id, "fc_NAkoOzN04TLL6GReUhSmxVAM");
  assert.equal(result.body.input[0].call_id, "call_NAkoOzN04TLL6GReUhSmxVAM");
  assert.equal(result.body.input[1].id, "fco_NAkoOzN04TLL6GReUhSmxVAM");
  assert.equal(result.body.input[1].call_id, "call_NAkoOzN04TLL6GReUhSmxVAM");
});

test("strips reasoning item ids when Responses are not stored", () => {
  const result = normalizeCodexResponsesInputIds({
    store: false,
    input: [
      {
        type: "reasoning",
        id: "rs_293293c2565d4f308cdd4a28b9bb8a6f",
        summary: [],
        content: [{ type: "reasoning_text", text: "thinking" }]
      },
      { type: "message", role: "user", content: "hello" }
    ]
  });

  assert.ok(result);
  assert.equal(result.changed, 1);
  assert.equal(result.body.input[0].id, undefined);
  assert.equal(result.body.input[0].type, "reasoning");
});

test("keeps reasoning item ids when Responses are stored", () => {
  const body = {
    store: true,
    input: [{ type: "reasoning", id: "rs_existing", summary: [] }]
  };
  assert.equal(normalizeCodexResponsesInputIds(body), undefined);
});

test("leaves already valid Responses ids and non-function items untouched", () => {
  const body = {
    store: true,
    input: [
      { type: "function_call", id: "fc_existing", call_id: "call_existing", name: "tool", arguments: "{}" },
      { type: "function_call_output", id: "fco_existing", call_id: "call_existing", output: "ok" },
      { type: "message", id: "msg_existing", role: "user", content: "hello" }
    ]
  };
  assert.equal(normalizeCodexResponsesInputIds(body), undefined);
});

test("ignores string input and malformed items", () => {
  assert.equal(normalizeCodexResponsesInputIds({ input: "hello" }), undefined);
  assert.equal(normalizeCodexResponsesInputIds({ input: [null, "x", { type: "function_call" }] }), undefined);
});
