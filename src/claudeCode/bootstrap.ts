import { DEFAULT_SYSTEM_PROMPT } from "../utils/llmDefaults";
import {
  ensureClaudeProjectSkillStructure,
  getClaudeProjectInstructionFile,
  getClaudeProjectSettingsFile,
} from "./projectSkills";

type IOUtilsLike = {
  exists?: (path: string) => Promise<boolean>;
  read?: (path: string) => Promise<Uint8Array<ArrayBufferLike> | ArrayBuffer>;
  write?: (path: string, data: Uint8Array<ArrayBufferLike>) => Promise<number>;
  makeDirectory?: (
    path: string,
    options?: { createAncestors?: boolean; ignoreExisting?: boolean },
  ) => Promise<void>;
};

function getIOUtils(): IOUtilsLike | undefined {
  return (globalThis as unknown as { IOUtils?: IOUtilsLike }).IOUtils;
}

function getBootstrapSettingsTemplate(): string {
  return JSON.stringify(
    {
      $schema: "https://json.schemastore.org/claude-code-settings.json",
      permissions: {
        defaultMode: "default",
      },
      env: {
        ENABLE_CLAUDEAI_MCP_SERVERS: "false",
      },
      enabledPlugins: {},
    },
    null,
    2,
  ) + "\n";
}

function getBootstrapInstructionTemplate(): string {
  return [
    "# Claude Code in Zotero",
    "",
    "This Claude runtime is embedded inside Zotero and is specialized for reading, comparing, and editing around academic papers.",
    "",
    "## Shared Zotero behavior",
    DEFAULT_SYSTEM_PROMPT,
    "",
    "## Config model",
    "- Project config is shared by all Zotero Claude runtimes launched from this installation.",
    "- Local config is scoped to the current conversation runtime folder.",
    "- Put shared Zotero skills in `.claude/skills/` or `.claude/commands/` under the runtime root.",
  ].join("\n");
}

async function writeIfMissing(path: string, content: string): Promise<void> {
  const io = getIOUtils();
  if (!io?.exists || !io?.write) return;
  const exists = await io.exists(path).catch(() => false);
  if (exists) return;
  await io.write(path, new TextEncoder().encode(content));
}

export async function ensureClaudeProjectBootstrap(): Promise<void> {
  await ensureClaudeProjectSkillStructure();
  await writeIfMissing(getClaudeProjectSettingsFile(), getBootstrapSettingsTemplate());
  await writeIfMissing(getClaudeProjectInstructionFile(), getBootstrapInstructionTemplate());
}
