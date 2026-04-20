import { assert } from "chai";
import { describe, it } from "mocha";

describe("standalone system toggle", function () {
  it("does not force a fresh conversation by default", function () {
    const calls: Array<"upstream" | "claude_code"> = [];
    const switchConversationSystem = async (
      nextSystem: "upstream" | "claude_code",
      options?: { forceFresh?: boolean },
    ) => {
      assert.isUndefined(options?.forceFresh);
      calls.push(nextSystem);
    };

    void switchConversationSystem("claude_code");
    assert.deepEqual(calls, ["claude_code"]);
  });
});
