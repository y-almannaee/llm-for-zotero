export const CLAUDE_GLOBAL_CONVERSATION_KEY_BASE = 3_000_000_000;
export const CLAUDE_PAPER_CONVERSATION_KEY_BASE = 3_500_000_000;
export const CLAUDE_HISTORY_LIMIT = 200;

export const CLAUDE_MODEL_OPTIONS = ["sonnet", "opus", "haiku"] as const;
export type ClaudeRuntimeModel = (typeof CLAUDE_MODEL_OPTIONS)[number];

export const CLAUDE_REASONING_OPTIONS = [
  "auto",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;
export type ClaudeReasoningMode = (typeof CLAUDE_REASONING_OPTIONS)[number];

export function buildDefaultClaudeGlobalConversationKey(libraryID: number): number {
  return CLAUDE_GLOBAL_CONVERSATION_KEY_BASE + Math.max(1, Math.floor(libraryID));
}

export function buildDefaultClaudePaperConversationKey(paperItemID: number): number {
  return CLAUDE_PAPER_CONVERSATION_KEY_BASE + Math.max(1, Math.floor(paperItemID));
}

export function isClaudeConversationKey(conversationKey: number): boolean {
  return Number.isFinite(conversationKey) && conversationKey >= CLAUDE_GLOBAL_CONVERSATION_KEY_BASE;
}
