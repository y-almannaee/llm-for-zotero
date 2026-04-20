import { getCoreAgentRuntime } from "../agent";
import { updateClaudeRuntimeRetention, buildClaudeScope } from "./runtime";
import { resolveConversationSystemForItem, resolveConversationBaseItem, resolveDisplayConversationKind } from "../modules/contextPanel/portalScope";
import { getConversationKey } from "../modules/contextPanel/chat";

const retainedMounts = new WeakMap<Element, { mountId: string; conversationKey: number; scopeType: string; scopeId: string }>();
let nextMountOrdinal = 1;

function makeMountId(): string {
  return `cc-ui-${Date.now()}-${nextMountOrdinal++}`;
}

const getCoreRuntime = () => getCoreAgentRuntime();

function resolveRetentionTarget(item: any | null | undefined): {
  conversationKey: number;
  scope: { scopeType: "paper" | "open"; scopeId: string; scopeLabel?: string };
} | null {
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
  const previous = retainedMounts.get(body);
  if (!target) {
    if (previous) {
      await updateClaudeRuntimeRetention(getCoreRuntime(), {
        conversationKey: previous.conversationKey,
        scope: { scopeType: previous.scopeType as "paper" | "open", scopeId: previous.scopeId },
        mountId: previous.mountId,
        retain: false,
      }).catch(() => {});
      retainedMounts.delete(body);
    }
    return;
  }
  if (
    previous &&
    previous.conversationKey === target.conversationKey &&
    previous.scopeType === target.scope.scopeType &&
    previous.scopeId === target.scope.scopeId
  ) {
    return;
  }
  if (previous) {
    await updateClaudeRuntimeRetention(getCoreRuntime(), {
      conversationKey: previous.conversationKey,
      scope: { scopeType: previous.scopeType as "paper" | "open", scopeId: previous.scopeId },
      mountId: previous.mountId,
      retain: false,
    }).catch(() => {});
  }
  const mountId = previous?.mountId || makeMountId();
  retainedMounts.set(body, {
    mountId,
    conversationKey: target.conversationKey,
    scopeType: target.scope.scopeType,
    scopeId: target.scope.scopeId,
  });
  await updateClaudeRuntimeRetention(getCoreRuntime(), {
    conversationKey: target.conversationKey,
    scope: target.scope,
    mountId,
    retain: true,
  }).catch(() => {});
}

export async function releaseClaudeRuntimeForBody(body: Element): Promise<void> {
  const previous = retainedMounts.get(body);
  if (!previous) return;
  retainedMounts.delete(body);
  await updateClaudeRuntimeRetention(getCoreRuntime(), {
    conversationKey: previous.conversationKey,
    scope: { scopeType: previous.scopeType as "paper" | "open", scopeId: previous.scopeId },
    mountId: previous.mountId,
    retain: false,
  }).catch(() => {});
}
