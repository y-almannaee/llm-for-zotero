declare const Zotero: any;

import { joinLocalPath } from "../utils/localPath";

export type ClaudeProjectSkillEntry = {
  name: string;
  filePath: string;
  description: string;
};

type IOUtilsLike = {
  exists?: (path: string) => Promise<boolean>;
  read?: (path: string) => Promise<Uint8Array<ArrayBufferLike> | ArrayBuffer>;
  write?: (path: string, data: Uint8Array<ArrayBufferLike>) => Promise<number>;
  makeDirectory?: (
    path: string,
    options?: { createAncestors?: boolean; ignoreExisting?: boolean },
  ) => Promise<void>;
  getChildren?: (path: string) => Promise<string[]>;
  remove?: (path: string) => Promise<void>;
};

function getIOUtils(): IOUtilsLike | undefined {
  return (globalThis as unknown as { IOUtils?: IOUtilsLike }).IOUtils;
}

function getHomeDir(): string {
  const env = (globalThis as unknown as {
    process?: { env?: Record<string, string | undefined> };
  }).process?.env;
  const home = env?.HOME?.trim() || env?.USERPROFILE?.trim() || "";
  if (home) return home;
  throw new Error("Cannot resolve home directory for Claude runtime root");
}

export function getClaudeRuntimeRootDir(): string {
  return joinLocalPath(getHomeDir(), "Zotero", "agent-runtime");
}

export function getClaudeProjectDir(): string {
  return joinLocalPath(getClaudeRuntimeRootDir(), ".claude");
}

export function getClaudeProjectSkillsDir(): string {
  return joinLocalPath(getClaudeProjectDir(), "skills");
}

export function getClaudeProjectCommandsDir(): string {
  return joinLocalPath(getClaudeProjectDir(), "commands");
}

export function getClaudeProjectInstructionFile(): string {
  return joinLocalPath(getClaudeRuntimeRootDir(), "CLAUDE.md");
}

export function getClaudeProjectSettingsFile(): string {
  return joinLocalPath(getClaudeProjectDir(), "settings.json");
}

function parseDescription(raw: string): string {
  const match = raw.match(/^description:\s*(.+)$/m);
  if (match?.[1]?.trim()) return match[1].trim();
  return "Claude Code project skill";
}

function parseCommandName(raw: string, fallback: string): string {
  const skillName = raw.match(/^name:\s*([a-z0-9-]+)$/m)?.[1]?.trim();
  if (skillName) return skillName;
  const normalized = fallback.replace(/\.md$/i, "").trim();
  return normalized || "custom-skill";
}

async function ensureDir(path: string): Promise<void> {
  const io = getIOUtils();
  if (!io?.makeDirectory) return;
  await io.makeDirectory(path, { createAncestors: true, ignoreExisting: true });
}

export async function ensureClaudeProjectSkillStructure(): Promise<void> {
  await ensureDir(getClaudeProjectDir());
  await ensureDir(getClaudeProjectSkillsDir());
  await ensureDir(getClaudeProjectCommandsDir());
}

export async function listClaudeProjectSkillEntries(): Promise<ClaudeProjectSkillEntry[]> {
  const io = getIOUtils();
  if (!io?.exists || !io?.read || !io?.getChildren) return [];
  const skillsDir = getClaudeProjectSkillsDir();
  const commandsDir = getClaudeProjectCommandsDir();
  const entries: ClaudeProjectSkillEntry[] = [];

  try {
    if (await io.exists(skillsDir)) {
      const skillDirs = await io.getChildren(skillsDir);
      for (const dirPath of skillDirs) {
        const skillName = dirPath.split(/[\\/]/).pop() || "";
        if (!skillName) continue;
        const filePath = joinLocalPath(dirPath, "SKILL.md");
        if (!(await io.exists(filePath))) continue;
        const data = await io.read(filePath);
        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
        const raw = new TextDecoder("utf-8").decode(bytes);
        entries.push({
          name: parseCommandName(raw, skillName),
          filePath,
          description: parseDescription(raw),
        });
      }
    }
  } catch {
    // ignore and continue to commands
  }

  try {
    if (await io.exists(commandsDir)) {
      const commandFiles = await io.getChildren(commandsDir);
      for (const filePath of commandFiles) {
        if (!filePath.endsWith(".md")) continue;
        const filename = filePath.split(/[\\/]/).pop() || filePath;
        const data = await io.read(filePath);
        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
        const raw = new TextDecoder("utf-8").decode(bytes);
        entries.push({
          name: parseCommandName(raw, filename),
          filePath,
          description: parseDescription(raw),
        });
      }
    }
  } catch {
    // ignore
  }

  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createClaudeProjectSkillTemplate(): Promise<string | null> {
  const io = getIOUtils();
  if (!io?.exists || !io?.write || !io?.makeDirectory) return null;
  await ensureClaudeProjectSkillStructure();
  const encoder = new TextEncoder();
  let index = 1;
  while (index <= 999) {
    const dirPath = joinLocalPath(getClaudeProjectSkillsDir(), `zotero-skill-${index}`);
    const filePath = joinLocalPath(dirPath, "SKILL.md");
    const exists = await io.exists(filePath).catch(() => false);
    if (!exists) {
      await io.makeDirectory(dirPath, { createAncestors: true, ignoreExisting: true });
      const template = `---
name: zotero-skill-${index}
description: Claude Code skill for Zotero runtime
---

Describe when Claude should use this Zotero-specific skill.`;
      await io.write(filePath, encoder.encode(template));
      return filePath;
    }
    index += 1;
  }
  return null;
}

export async function deleteClaudeProjectSkillFile(filePath: string): Promise<boolean> {
  const io = getIOUtils();
  if (!io?.remove) return false;
  try {
    await io.remove(filePath);
    return true;
  } catch {
    return false;
  }
}
