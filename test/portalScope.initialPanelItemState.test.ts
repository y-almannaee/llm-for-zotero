/// <reference types="zotero-types" />

import { assert } from "chai";
import { after, before, beforeEach, describe, it } from "mocha";
import {
  isPaperPortalItem,
  resolveActiveNoteSession,
  resolveInitialPanelItemState,
} from "../src/modules/contextPanel/portalScope";
import { createClaudePaperPortalItem } from "../src/claudeCode/portal";
import {
  activeConversationModeByLibrary,
  activeGlobalConversationByLibrary,
  activePaperConversationByPaper,
} from "../src/modules/contextPanel/state";

describe("portalScope resolveInitialPanelItemState", function () {
  const originalZotero = globalThis.Zotero;
  const itemsById = new Map<number, Zotero.Item>();

  before(function () {
    (globalThis as typeof globalThis & { Zotero: typeof Zotero }).Zotero = {
      Items: {
        get: (itemId: number) => itemsById.get(itemId) || null,
      },
    } as typeof Zotero;
  });

  after(function () {
    (globalThis as typeof globalThis & { Zotero?: typeof Zotero }).Zotero =
      originalZotero;
  });

  beforeEach(function () {
    activeConversationModeByLibrary.clear();
    activeGlobalConversationByLibrary.clear();
    activePaperConversationByPaper.clear();
    itemsById.clear();
  });

  it("restores the remembered global chat when library mode is global", function () {
    const paperItem = {
      id: 42,
      libraryID: 7,
      parentID: undefined,
      isAttachment: () => false,
      isRegularItem: () => true,
    } as unknown as Zotero.Item;

    activeConversationModeByLibrary.set(7, "global");
    activeGlobalConversationByLibrary.set(7, 9001);

    const resolved = resolveInitialPanelItemState(paperItem);

    assert.equal(resolved.basePaperItem, paperItem);
    assert.equal(resolved.item?.id, 9001);
    assert.equal(resolved.item?.libraryID, 7);
  });

  it("restores the remembered paper chat session for the selected paper", function () {
    const paperItem = {
      id: 42,
      libraryID: 7,
      parentID: undefined,
      isAttachment: () => false,
      isRegularItem: () => true,
    } as unknown as Zotero.Item;

    activePaperConversationByPaper.set("7:42", 4207);

    const resolved = resolveInitialPanelItemState(paperItem);

    assert.equal(resolved.basePaperItem, paperItem);
    assert.isTrue(isPaperPortalItem(resolved.item));
    assert.equal(resolved.item?.id, 4207);
    assert.equal(resolved.item?.libraryID, 7);
  });

  it("keeps item notes on their own conversation while exposing the parent paper", function () {
    const parentItem = {
      id: 42,
      libraryID: 7,
      parentID: undefined,
      isAttachment: () => false,
      isRegularItem: () => true,
    } as unknown as Zotero.Item;
    const noteItem = {
      id: 99,
      libraryID: 7,
      parentID: 42,
      isAttachment: () => false,
      isRegularItem: () => false,
      isNote: () => true,
      getNoteTitle: () => "Item Note",
    } as unknown as Zotero.Item;
    itemsById.set(42, parentItem);

    const resolved = resolveInitialPanelItemState(noteItem);
    const session = resolveActiveNoteSession(noteItem);

    assert.equal(resolved.item, noteItem);
    assert.equal(resolved.basePaperItem, parentItem);
    assert.deepEqual(session, {
      noteKind: "item",
      noteId: 99,
      title: "Item Note",
      parentItemId: 42,
      displayConversationKind: "paper",
      capabilities: {
        showModeSwitch: false,
        showNewConversation: false,
        showHistory: false,
        showOpenLock: false,
      },
    });
  });

  it("keeps standalone notes in open-chat semantics without remapping them", function () {
    const noteItem = {
      id: 108,
      libraryID: 7,
      parentID: undefined,
      isAttachment: () => false,
      isRegularItem: () => false,
      isNote: () => true,
      getNoteTitle: () => "Standalone Note",
    } as unknown as Zotero.Item;

    const resolved = resolveInitialPanelItemState(noteItem);
    const session = resolveActiveNoteSession(noteItem);

    assert.equal(resolved.item, noteItem);
    assert.isNull(resolved.basePaperItem);
    assert.isFalse(isPaperPortalItem(resolved.item));
    assert.deepEqual(session, {
      noteKind: "standalone",
      noteId: 108,
      title: "Standalone Note",
      parentItemId: undefined,
      displayConversationKind: "global",
      capabilities: {
        showModeSwitch: false,
        showNewConversation: false,
        showHistory: false,
        showOpenLock: false,
      },
    });
  });

  it("falls back to upstream paper state when Claude mode is disabled", function () {
    let claudeEnabled = false;
    const originalPrefs = globalThis.Zotero?.Prefs;
    const paperItem = {
      id: 42,
      libraryID: 7,
      parentID: undefined,
      isAttachment: () => false,
      isRegularItem: () => true,
    } as unknown as Zotero.Item;
    itemsById.set(42, paperItem);
    activePaperConversationByPaper.set("7:42", 4207);
    globalThis.Zotero = {
      ...globalThis.Zotero,
      Items: {
        get: (itemId: number) => itemsById.get(itemId) || null,
      },
      Prefs: {
        get: (key: string) => {
          if (String(key).endsWith("enableClaudeCodeMode")) return claudeEnabled;
          if (String(key).endsWith("conversationSystem")) return "claude_code";
          return originalPrefs?.get?.(key, true) ?? "";
        },
      },
    } as typeof Zotero;

    const claudePortal = createClaudePaperPortalItem(paperItem, 3500005254) as Zotero.Item;
    const resolved = resolveInitialPanelItemState(claudePortal, {
      conversationSystem: "claude_code",
    });

    assert.equal(resolved.basePaperItem, paperItem);
    assert.isTrue(isPaperPortalItem(resolved.item));
    assert.equal(resolved.item?.id, 4207);
    assert.equal(resolved.item?.libraryID, 7);
  });
});
