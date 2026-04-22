import { getCoreAgentRuntime } from "../agent";
import { updateClaudeRuntimeRetention, buildClaudeScope } from "./runtime";
import { resolveConversationSystemForItem, resolveConversationBaseItem, resolveDisplayConversationKind } from "../modules/contextPanel/portalScope";
import { getConversationKey } from "../modules/contextPanel/chat";

const THREAD_RELEASE_GRACE_MS = 30_000;

type RetentionTarget = {
  conversationKey: number;
  scope: { scopeType: "paper" | "open"; scopeId: string; scopeLabel?: string };
};

type ThreadRetentionEntry = {
  mountId: string;
  target: RetentionTarget;
  bodies: Set<Element>;
  releaseTimer: ReturnType<typeof setTimeout> | null;
};

const retainedThreadKeyByBody = new WeakMap<Element, string>();
const retainedThreads = new Map<string, ThreadRetentionEntry>();
let nextMountOrdinal = 1;

function makeMountId(): string {
  return `cc-ui-${Date.now()}-${nextMountOrdinal++}`;
}

const getCoreRuntime = () => getCoreAgentRuntime();

function resolveRetentionTarget(item: any | null | undefined): RetentionTarget | null {
  if (!item) return null;
  if (resolveConversationSystemForItem(item) !== "claude_code") return null;
  const conversationKey = getConversationKey(item);
  const kind = resolveDisplayConversationKind(item);
  if (!kind) return null;
  const baseItem = resolveConversationBaseItem(item);
  const libraryID = Number(item.libraryID || baseItem?.libraryID || 0);
  if (!Number.isFinite(conversationKey) || conversationKey <= 0 || !Number.isFinite(libraryID) || libraryID <= 0) {
    return null;
  }
  const scope = buildClaudeScope({
    libraryID: Math.floor(libraryID),
    kind,
    paperItemID: kind === "paper" ? Number(baseItem?.id || 0) || undefined : undefined,
    paperTitle: kind === "paper"
      ? String(baseItem?.getField?.("title") || "").trim() || undefined
      : undefined,
  });
  return {
    conversationKey,
    scope,
  };
}

export async function retainClaudeRuntimeForBody(
  body: Element,
  item: any | null | undefined,
): Promise<void> {
  const target = resolveRetentionTarget(item);
  const nextThreadKey = target
    ? `${target.scope.scopeType}:${target.scope.scopeId}:${target.conversationKey}`
    : null;
  const previousThreadKey = retainedThreadKeyByBody.get(body) || null;

  if (previousThreadKey && previousThreadKey !== nextThreadKey) {
    const previousEntry = retainedThreads.get(previousThreadKey);
    if (previousEntry) {
      previousEntry.bodies.delete(body);
      if (!previousEntry.bodies.size && !previousEntry.releaseTimer) {
        previousEntry.releaseTimer = setTimeout(() => {
          const liveEntry = retainedThreads.get(previousThreadKey);
          if (!liveEntry || liveEntry.bodies.size > 0) return;
          retainedThreads.delete(previousThreadKey);
          void updateClaudeRuntimeRetention(getCoreRuntime(), {
            conversationKey: liveEntry.target.conversationKey,
            scope: liveEntry.target.scope,
            mountId: liveEntry.mountId,
            retain: false,
          }).catch(() => {});
        }, THREAD_RELEASE_GRACE_MS);
      }
    }
    retainedThreadKeyByBody.delete(body);
  }

  if (!target || !nextThreadKey) {
    return;
  }

  let entry = retainedThreads.get(nextThreadKey);
  if (!entry) {
    entry = {
      mountId: makeMountId(),
      target,
      bodies: new Set<Element>(),
      releaseTimer: null,
    };
    retainedThreads.set(nextThreadKey, entry);
    await updateClaudeRuntimeRetention(getCoreRuntime(), {
      conversationKey: target.conversationKey,
      scope: target.scope,
      mountId: entry.mountId,
      retain: true,
    }).catch(() => {});
  } else {
    entry.target = target;
    if (entry.releaseTimer) {
      clearTimeout(entry.releaseTimer);
      entry.releaseTimer = null;
    }
  }

  entry.bodies.add(body);
  retainedThreadKeyByBody.set(body, nextThreadKey);
}

export async function releaseClaudeRuntimeForBody(body: Element): Promise<void> {
  const previousThreadKey = retainedThreadKeyByBody.get(body) || null;
  if (!previousThreadKey) return;
  retainedThreadKeyByBody.delete(body);
  const entry = retainedThreads.get(previousThreadKey);
  if (!entry) return;
  entry.bodies.delete(body);
  if (entry.bodies.size > 0 || entry.releaseTimer) return;
  entry.releaseTimer = setTimeout(() => {
    const liveEntry = retainedThreads.get(previousThreadKey);
    if (!liveEntry || liveEntry.bodies.size > 0) return;
    retainedThreads.delete(previousThreadKey);
    void updateClaudeRuntimeRetention(getCoreRuntime(), {
      conversationKey: liveEntry.target.conversationKey,
      scope: liveEntry.target.scope,
      mountId: liveEntry.mountId,
      retain: false,
    }).catch(() => {});
  }, THREAD_RELEASE_GRACE_MS);
}
