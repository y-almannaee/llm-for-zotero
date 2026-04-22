import { getClaudeRuntimeRootDir } from "../../claudeCode/projectSkills";
import { getLocalParentPath, joinLocalPath } from "../../utils/localPath";

const HARNESS_DIR = joinLocalPath(getClaudeRuntimeRootDir(), ".debug", "panel-harness");
const COMMAND_PATH = joinLocalPath(HARNESS_DIR, "command.json");
const RESULT_PATH = joinLocalPath(HARNESS_DIR, "result.json");
const POLL_INTERVAL_MS = 1200;

type IOUtilsLike = {
  exists?: (path: string) => Promise<boolean>;
  read?: (path: string) => Promise<Uint8Array<ArrayBufferLike> | ArrayBuffer>;
  write?: (path: string, data: Uint8Array<ArrayBufferLike>) => Promise<unknown>;
  makeDirectory?: (
    path: string,
    options?: { createAncestors?: boolean; ignoreExisting?: boolean },
  ) => Promise<void>;
};

type OSFileLike = {
  writeAtomic?: (path: string, data: Uint8Array<ArrayBufferLike>) => Promise<void>;
  makeDir?: (
    path: string,
    options?: { from?: string; ignoreExisting?: boolean },
  ) => Promise<void>;
};

type HarnessPanelInfo = {
  conversationKey: number | null;
  itemId: number | null;
  conversationSystem: string;
  providerLabel: string | null;
  isConnected: boolean;
};

type HarnessEntry = {
  runSend: (text: string) => Promise<void>;
  getInfo: () => HarnessPanelInfo;
};

type HarnessCommand = {
  id: string;
  action: "send";
  text: string;
};

const harnessEntries = new Map<Element, HarnessEntry>();
let harnessStarted = false;
let harnessTimer: number | null = null;
let lastHandledCommandId = "";
let commandInFlight = false;

function getIOUtils(): IOUtilsLike | undefined {
  return (globalThis as unknown as { IOUtils?: IOUtilsLike }).IOUtils;
}

function getOSFile(): OSFileLike | undefined {
  return (globalThis as { OS?: { File?: OSFileLike } }).OS?.File;
}

async function ensureDir(path: string): Promise<void> {
  const io = getIOUtils();
  if (io?.makeDirectory) {
    await io.makeDirectory(path, { createAncestors: true, ignoreExisting: true });
    return;
  }
  const osFile = getOSFile();
  if (osFile?.makeDir) {
    await osFile.makeDir(path, {
      from: getLocalParentPath(path),
      ignoreExisting: true,
    });
  }
}

async function writeJsonFile(path: string, value: unknown): Promise<void> {
  const bytes = new TextEncoder().encode(JSON.stringify(value, null, 2));
  await ensureDir(getLocalParentPath(path));
  const io = getIOUtils();
  if (io?.write) {
    await io.write(path, bytes);
    return;
  }
  const osFile = getOSFile();
  if (osFile?.writeAtomic) {
    await osFile.writeAtomic(path, bytes);
  }
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  const io = getIOUtils();
  if (!io?.read) return null;
  const exists = io.exists ? await io.exists(path).catch(() => false) : true;
  if (!exists) return null;
  const raw = await io.read(path).catch(() => null);
  if (!raw) return null;
  const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

function getActiveHarnessEntry(): { body: Element; entry: HarnessEntry } | null {
  for (const [body, entry] of harnessEntries.entries()) {
    if (!body.isConnected) {
      harnessEntries.delete(body);
      continue;
    }
    return { body, entry };
  }
  return null;
}

async function writeHarnessResult(result: Record<string, unknown>): Promise<void> {
  await writeJsonFile(RESULT_PATH, {
    updatedAt: Date.now(),
    ...result,
  }).catch(() => {});
}

async function pollHarnessCommand(): Promise<void> {
  if (commandInFlight) return;
  const command = await readJsonFile<HarnessCommand>(COMMAND_PATH).catch(() => null);
  if (!command?.id || !command.action) return;
  if (command.id === lastHandledCommandId) return;
  lastHandledCommandId = command.id;
  commandInFlight = true;
  const active = getActiveHarnessEntry();
  if (!active) {
    await writeHarnessResult({
      id: command.id,
      status: "failed",
      error: "No active context panel harness is registered",
    });
    commandInFlight = false;
    return;
  }
  const infoBefore = active.entry.getInfo();
  await writeHarnessResult({
    id: command.id,
    status: "running",
    action: command.action,
    infoBefore,
  });
  try {
    if (command.action === "send") {
      await active.entry.runSend(command.text);
    }
    await writeHarnessResult({
      id: command.id,
      status: "completed",
      action: command.action,
      infoBefore,
      infoAfter: active.entry.getInfo(),
    });
  } catch (error) {
    await writeHarnessResult({
      id: command.id,
      status: "failed",
      action: command.action,
      infoBefore,
      infoAfter: active.entry.getInfo(),
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    commandInFlight = false;
  }
}

export function ensurePanelDebugHarnessStarted(): void {
  if (harnessStarted) return;
  harnessStarted = true;
  void ensureDir(HARNESS_DIR).catch(() => {});
  harnessTimer = setInterval(() => {
    void pollHarnessCommand();
  }, POLL_INTERVAL_MS) as unknown as number;
}

export function registerPanelDebugHarness(
  body: Element,
  entry: HarnessEntry,
): void {
  harnessEntries.set(body, entry);
}

export function unregisterPanelDebugHarness(body: Element): void {
  harnessEntries.delete(body);
}

export function getPanelDebugHarnessPaths(): {
  commandPath: string;
  resultPath: string;
} {
  return {
    commandPath: COMMAND_PATH,
    resultPath: RESULT_PATH,
  };
}
