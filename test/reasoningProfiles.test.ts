import { assert } from "chai";
import {
  getDeepseekReasoningProfileForModel,
  getOpenAIReasoningProfileForModel,
  getReasoningDefaultLevelForModel,
  getRuntimeReasoningOptionsForModel,
} from "../src/utils/reasoningProfiles";
import { buildReasoningPayload } from "../src/utils/llmClient";

describe("reasoningProfiles", function () {
  describe("OpenAI GPT-5 family profiles", function () {
    it("supports xhigh reasoning for gpt-5.4", function () {
      const options = getRuntimeReasoningOptionsForModel("openai", "gpt-5.4");
      assert.deepEqual(
        options.map((option) => option.level),
        ["default", "low", "medium", "high", "xhigh"],
      );

      const profile = getOpenAIReasoningProfileForModel("gpt-5.4");
      assert.equal(profile.defaultLevel, "default");
      assert.deepEqual(profile.levelToEffort, {
        default: null,
        low: "low",
        medium: "medium",
        high: "high",
        xhigh: "xhigh",
      });
    });

    it("limits gpt-5.4-pro to medium/high/xhigh reasoning", function () {
      const options = getRuntimeReasoningOptionsForModel(
        "openai",
        "gpt-5.4-pro",
      );
      assert.deepEqual(
        options.map((option) => option.level),
        ["medium", "high", "xhigh"],
      );
      assert.equal(
        getReasoningDefaultLevelForModel("openai", "gpt-5.4-pro"),
        "medium",
      );
    });

    it("limits gpt-5-pro to high reasoning only", function () {
      const options = getRuntimeReasoningOptionsForModel(
        "openai",
        "gpt-5-pro",
      );
      assert.deepEqual(
        options.map((option) => option.level),
        ["high"],
      );
      assert.equal(
        getReasoningDefaultLevelForModel("openai", "gpt-5-pro"),
        "high",
      );
    });

    it("supports codex-specific xhigh reasoning on gpt-5.2 and gpt-5.3 codex", function () {
      const gpt52Codex = getRuntimeReasoningOptionsForModel(
        "openai",
        "gpt-5.2-codex",
      );
      const gpt53Codex = getRuntimeReasoningOptionsForModel(
        "openai",
        "gpt-5.3-codex",
      );

      assert.deepEqual(
        gpt52Codex.map((option) => option.level),
        ["low", "medium", "high", "xhigh"],
      );
      assert.deepEqual(
        gpt53Codex.map((option) => option.level),
        ["low", "medium", "high", "xhigh"],
      );
    });
  });

  describe("DeepSeek V4 profiles", function () {
    it("supports disabled, high, and max thinking modes", function () {
      const options = getRuntimeReasoningOptionsForModel(
        "deepseek",
        "deepseek-v4-pro",
      );
      assert.deepEqual(
        options.map((option) => option.level),
        ["default", "minimal", "high", "xhigh"],
      );

      const profile = getDeepseekReasoningProfileForModel(
        "deepseek/deepseek-v4-flash",
      );
      assert.equal(profile.defaultLevel, "default");
      assert.equal(profile.defaultThinkingType, "enabled");
      assert.equal(profile.defaultReasoningEffort, "high");
      assert.isTrue(profile.omitTemperatureWhenThinking);
      assert.equal(profile.levelToThinkingType.minimal, "disabled");
      assert.equal(profile.levelToReasoningEffort.xhigh, "max");
    });

    it("builds documented DeepSeek V4 thinking payloads", function () {
      assert.deepEqual(
        buildReasoningPayload(
          { provider: "deepseek", level: "minimal" },
          false,
          "deepseek-v4-pro",
        ),
        {
          extra: { thinking: { type: "disabled" } },
          omitTemperature: false,
        },
      );
      assert.deepEqual(
        buildReasoningPayload(
          { provider: "deepseek", level: "high" },
          false,
          "deepseek-v4-pro",
        ),
        {
          extra: {
            thinking: { type: "enabled" },
            reasoning_effort: "high",
          },
          omitTemperature: true,
        },
      );
      assert.deepEqual(
        buildReasoningPayload(
          { provider: "deepseek", level: "xhigh" },
          false,
          "deepseek-v4-pro",
        ),
        {
          extra: {
            thinking: { type: "enabled" },
            reasoning_effort: "max",
          },
          omitTemperature: true,
        },
      );
      assert.deepEqual(
        buildReasoningPayload(
          { provider: "deepseek", level: "xhigh" },
          false,
          "deepseek-v4-pro",
          "https://api.deepseek.com/anthropic",
          "anthropic_messages",
        ),
        {
          extra: {
            thinking: { type: "enabled" },
            output_config: { effort: "max" },
          },
          omitTemperature: true,
        },
      );
      assert.deepEqual(
        buildReasoningPayload(
          { provider: "deepseek", level: "default" },
          false,
          "deepseek-reasoner",
        ),
        {
          extra: { thinking: { type: "enabled" } },
          omitTemperature: false,
        },
      );
    });
  });
});
