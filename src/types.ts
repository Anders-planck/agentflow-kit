export type ClientName = "codex" | "claude" | "opencode";

export interface Components {
  policies: boolean;
  bundledSkills: boolean;
  externalSkills: boolean;
  contextMode: boolean;
  serena: boolean;
  astGrep: boolean;
}

export interface Preset {
  schemaVersion: number;
  name: string;
  description: string;
  components: Components;
  externalSkillSets?: string[];
}

export interface UserConfig {
  schemaVersion: 1;
  preset?: string;
  clients?: "auto" | ClientName[];
  components?: Partial<Components>;
  externalSkillSets?: string[];
}

export interface ToolRegistry {
  schemaVersion: number;
  tools: Record<string, {
    kind: string;
    source: string;
    commit: string;
    testedVersion: string;
    executable?: string;
    fallbackExecutable?: string;
    executables?: string[];
  }>;
}

export interface SkillSource {
  repository: string;
  commit: string;
  version: string;
  license: string;
  licensePath: string;
  sets: Record<string, string[]>;
}

export interface SkillSourcesRegistry {
  schemaVersion: number;
  sources: Record<string, SkillSource>;
}

export interface AppPaths {
  home: string;
  configDir: string;
  dataDir: string;
  stateDir: string;
  appConfigDir: string;
  appDataDir: string;
  appStateDir: string;
}

export interface CommandSpec {
  command: string;
  args: string[];
  inverse?: CommandSpec;
  cwd?: string;
}

export type PlanItem =
  | { kind: "write"; id: string; description: string; target: string; content: string }
  | { kind: "symlink"; id: string; description: string; target: string; source: string; replaceExisting?: boolean }
  | { kind: "copy-dir"; id: string; description: string; target: string; source: string }
  | { kind: "external-skills"; id: string; description: string; target: string; sourceName: string; skillSet: string }
  | { kind: "command"; id: string; description: string; spec: CommandSpec }
  | { kind: "notice"; id: string; description: string; level: "info" | "warn" | "error" };

export interface InstallPlan {
  preset: Preset;
  items: PlanItem[];
  clients: Record<ClientName, boolean>;
  releaseDir: string;
}

export interface PathSnapshot {
  target: string;
  existed: boolean;
  type?: "file" | "directory" | "symlink";
  backupPath?: string;
  symlinkTarget?: string;
}

export interface AppliedCommand {
  id: string;
  inverse?: CommandSpec;
}

export interface InstallManifest {
  schemaVersion: 1;
  toolkitVersion: string;
  createdAt: string;
  preset: string;
  backupDir: string;
  snapshots: PathSnapshot[];
  commands: AppliedCommand[];
  ownedSymlinks: string[];
}

export interface GlobalOptions {
  home: string;
  root: string;
  preset?: string;
  dryRun: boolean;
  json: boolean;
  yes: boolean;
  skipExternal: boolean;
  adoptExisting?: boolean;
}
