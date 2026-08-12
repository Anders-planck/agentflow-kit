export type ClientName = "codex" | "claude" | "opencode";

export type CapabilityMode = "off" | "registered" | "auto" | "project" | "always";
export type RiskLevel = "low" | "medium" | "high";
export type ReportFormat = "terminal" | "json" | "markdown" | "sarif" | "html";

export interface CapabilitySelection {
  mode: CapabilityMode;
  provider?: string;
  options?: Record<string, unknown>;
}

export interface CapabilityDefinition {
  description: string;
  defaultProvider: string;
  defaultMode: CapabilityMode;
  risk: RiskLevel;
  conflicts?: string[];
  projectSignals?: string[];
  skills?: string[];
}

export interface CapabilityRegistry {
  schemaVersion: 2;
  capabilities: Record<string, CapabilityDefinition>;
}

export interface ProviderDefinition {
  description: string;
  kind: "builtin" | "skill" | "cli" | "mcp" | "plugin" | "hook";
  source: string;
  version?: string;
  commit?: string;
  executable?: string;
  transport?: "stdio" | "http";
  endpoint?: string;
  clients: ClientName[];
  risk: RiskLevel;
  network: boolean;
  authenticated: boolean;
  writes: boolean;
  hooks: boolean;
}

export interface ProviderRegistry {
  schemaVersion: 2;
  providers: Record<string, ProviderDefinition>;
}

export interface DependencyInstaller {
  platforms?: NodeJS.Platform[];
  requires: string;
  command: string;
  args: string[];
}

export interface DependencyDefinition {
  description: string;
  source: string;
  version?: string;
  commit?: string;
  requiredBy: string[];
  satisfiedBy: string[];
  installers: DependencyInstaller[];
}

export interface DependencyRegistry {
  schemaVersion: 1;
  dependencies: Record<string, DependencyDefinition>;
}

export interface DependencyPlanItem {
  name: string;
  description: string;
  source: string;
  version?: string;
  commit?: string;
  requiredBy: string[];
  satisfiedBy: string[];
  status: "satisfied" | "missing" | "unresolved";
  spec?: CommandSpec;
}

export interface ProfileDefinition {
  schemaVersion: 2;
  name: string;
  description: string;
  detects?: string[];
  capabilities: Record<string, CapabilitySelection>;
  skills?: string[];
}

export interface Components {
  policies: boolean;
  bundledSkills: boolean;
  externalSkills: boolean;
  contextMode: boolean;
  serena: boolean;
  astGrep: boolean;
}

export interface Preset {
  schemaVersion: 1 | 2;
  name: string;
  description: string;
  components: Components;
  capabilities: Record<string, CapabilitySelection>;
  externalSkillSets?: string[];
}

export interface UserConfig {
  schemaVersion: 1 | 2;
  preset?: string;
  clients?: "auto" | ClientName[];
  components?: Partial<Components>;
  capabilities?: Record<string, CapabilitySelection>;
  profiles?: string[];
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
    requires?: Record<string, string>;
  }>;
}

export interface SkillSource {
  repository: string;
  commit: string;
  version: string;
  license: string;
  licensePath: string;
  licenseDigest?: string;
  reviewedAt?: string;
  risk?: RiskLevel;
  contentDigests?: Record<string, string>;
  permissions?: {
    network: boolean;
    hooks: boolean;
    writesOutsideProject: boolean;
  };
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
  timeoutMs?: number;
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
  capabilities: Record<string, CapabilitySelection>;
  releaseDir: string;
  dependencies?: DependencyPlanItem[];
}

export interface Finding {
  id: string;
  capability: string;
  status: "pass" | "info" | "warning" | "error";
  summary: string;
  evidence?: string[];
  remediation?: string;
  source?: string;
  durationMs?: number;
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
  format?: ReportFormat;
  output?: string;
  budget?: number;
  skipDependencies?: boolean;
  assumedExecutables?: string[];
}
