import type {
  AgentModelCapabilities,
  AgentRuntimeRequest,
  AgentModelStep,
} from "../types";
import type { AgentModelAdapter, AgentStepParams } from "./adapter";
import {
  extractCodexAppServerThreadId,
  extractCodexAppServerTurnId,
  getOrCreateCodexAppServerProcess,
  waitForCodexAppServerTurnCompletion,
} from "../../utils/codexAppServerProcess";
import { extractLatestCodexAppServerUserInput } from "../../utils/codexAppServerInput";
import { isMultimodalRequestSupported } from "./messageBuilder";

export class CodexAppServerAdapter implements AgentModelAdapter {
  private threadId: string | null = null;
  private processKey: string;

  constructor(processKey = "default") {
    this.processKey = processKey;
  }

  getCapabilities(_request: AgentRuntimeRequest): AgentModelCapabilities {
    return {
      streaming: true,
      toolCalls: false,
      multimodal: isMultimodalRequestSupported(_request),
      fileInputs: false,
      reasoning: false,
    };
  }

  supportsTools(_request: AgentRuntimeRequest): boolean {
    // AgentRuntime uses this as a coarse "can enter the agent loop" gate.
    // The app-server transport does not expose local plugin tool calls, but it
    // still needs to run turns through runStep() instead of forcing fallback.
    return true;
  }

  async runStep(params: AgentStepParams): Promise<AgentModelStep> {
    const request = params.request;
    const proc = await getOrCreateCodexAppServerProcess(this.processKey);
    let text: string;
    try {
      text = await proc.runTurnExclusive(async () => {
        if (!this.threadId) {
          const threadResp = await proc.sendRequest("thread/start", {
            model: request.model,
            approvalPolicy: "never",
          });
          this.threadId = extractCodexAppServerThreadId(threadResp);
          if (!this.threadId) {
            throw new Error("Codex app-server did not return a thread ID");
          }
        }
        const userInput = await extractLatestCodexAppServerUserInput(
          params.messages,
        );

        const turnResp = await proc.sendRequest("turn/start", {
          threadId: this.threadId,
          input: userInput,
        });
        const turnId = extractCodexAppServerTurnId(turnResp);
        if (!turnId) {
          throw new Error("Codex app-server did not return a turn ID");
        }

        return waitForCodexAppServerTurnCompletion({
          proc,
          turnId,
          onTextDelta: params.onTextDelta,
          signal: params.signal,
          cacheKey: this.processKey,
        });
      });
    } catch (error) {
      this.threadId = null;
      throw error;
    }

    const assistantMessage = { role: "assistant" as const, content: text };
    return { kind: "final", text, assistantMessage };
  }
}
