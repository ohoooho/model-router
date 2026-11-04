import { existsSync, renameSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const APP_NAME = "OMR";
export const APP_STORAGE_NAME = "omr";

const homeDirEnv = "CCR_INTERNAL_HOME_DIR";
const appDataDirEnv = "CCR_INTERNAL_APP_DATA_DIR";
const userDataDirEnv = "CCR_INTERNAL_USER_DATA_DIR";
const omrDataDirEnv = "OMR_DATA_DIR";

type RuntimePathName = "appData" | "home" | "userData";

export type RuntimeAppPaths = Partial<Record<RuntimePathName, string>>;

export function setRuntimeAppPaths(paths: RuntimeAppPaths): void {
  setPathEnv(homeDirEnv, paths.home);
  setPathEnv(appDataDirEnv, paths.appData);
  setPathEnv(userDataDirEnv, paths.userData);
}

/**
 * Explicit data-dir override (OMR_DATA_DIR).
 *
 * When set, it becomes the single root for every runtime-owned path:
 * config dir, data dir, config.sqlite, gateway runtime marker and service state.
 * That is what makes an isolated instance (a second OMR on the same host)
 * truly isolated: without it the instance shares the production CONFIGDIR and
 * can stop the production managed gateway.
 */
export function resolveOmrDataDirOverride(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env[omrDataDirEnv]?.trim();
  return value || undefined;
}

export function resolveRuntimeAppPath(name: RuntimePathName): string {
  const configured = readConfiguredPath(name);
  if (configured) {
    return configured;
  }
  if (name === "home") {
    return os.homedir();
  }
  if (name === "appData") {
    return fallbackAppDataDir();
  }
  return fallbackUserDataDir();
}

export const LEGACY_CONFIGDIR = path.join(resolveRuntimeAppPath("home"), ".claude-code-router");

let configDir: string | undefined;

function defaultRuntimeConfigDir(): string {
  if (process.platform === "win32") {
    return path.join(resolveRuntimeAppPath("appData"), APP_STORAGE_NAME);
  }
  return path.join(resolveRuntimeAppPath("home"), `.${APP_STORAGE_NAME}`);
}

export function resolveRuntimeConfigDir(): string {
  // An explicit OMR_DATA_DIR is authoritative and re-read every call, so a
  // process that changes it (tests, installers) never keeps a stale directory.
  const explicitDataDir = resolveOmrDataDirOverride();
  if (explicitDataDir) {
    return explicitDataDir;
  }
  if (configDir) {
    return configDir;
  }
  if (process.platform === "win32") {
    configDir = path.join(resolveRuntimeAppPath("appData"), APP_STORAGE_NAME);
  } else {
    configDir = path.join(resolveRuntimeAppPath("home"), `.${APP_STORAGE_NAME}`);
  }
  return configDir;
}

/**
 * Migrate legacy ~/.claude-code-router → ~/.omr if the legacy directory exists
 * and the new directory does not. Idempotent — safe to call on every startup.
 * Returns true if a migration was performed.
 */
export function migrateLegacyConfigDir(): boolean {
  const newDir = resolveRuntimeConfigDir();
  const legacyDir = LEGACY_CONFIGDIR;

  // An explicit OMR_DATA_DIR that points somewhere else than the default home
  // directory is a deliberate choice of directory: never move the legacy
  // directory into it, that would steal another instance's state.
  // When it matches the default home directory the normal migration still runs.
  const explicitDataDir = resolveOmrDataDirOverride();
  if (explicitDataDir && path.resolve(explicitDataDir) !== path.resolve(defaultRuntimeConfigDir())) {
    return false;
  }

  // Normalize to avoid false positives from path differences
  if (path.resolve(newDir) === path.resolve(legacyDir)) {
    return false;
  }

  if (existsSync(newDir)) {
    return false; // new directory already exists, nothing to migrate
  }

  if (!existsSync(legacyDir)) {
    return false; // no legacy directory to migrate
  }

  try {
    renameSync(legacyDir, newDir);
    return true;
  } catch {
    return false; // rename failed — new dir may have been created concurrently, or permissions issue
  }
}

export function resolveRuntimeDataDir(): string {
  // An explicit OMR_DATA_DIR owns the whole runtime tree, data dir included.
  // CCR_INTERNAL_USER_DATA_DIR is an internal test/desktop hook and must not
  // pull the data dir back into a shared location while an instance asked for
  // its own isolated directory.
  if (resolveOmrDataDirOverride()) {
    if (process.platform === "win32") {
      return resolveRuntimeConfigDir();
    }
    return path.join(resolveRuntimeConfigDir(), "app-data");
  }
  const configured = readConfiguredPath("userData");
  if (configured) {
    return configured;
  }
  if (process.platform === "win32") {
    return resolveRuntimeConfigDir();
  }
  return path.join(resolveRuntimeConfigDir(), "app-data");
}

function readConfiguredPath(name: RuntimePathName): string | undefined {
  const key = name === "home"
    ? homeDirEnv
    : name === "appData"
      ? appDataDirEnv
      : userDataDirEnv;
  const value = process.env[key]?.trim();
  return value || undefined;
}

function setPathEnv(key: string, value: string | undefined): void {
  if (value?.trim()) {
    process.env[key] = value;
  }
}

function fallbackAppDataDir(): string {
  if (process.platform === "win32") {
    return process.env.APPDATA ||
      process.env.LOCALAPPDATA ||
      (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "AppData", "Roaming") : path.join(os.homedir(), "AppData", "Roaming"));
  }
  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
}

function fallbackUserDataDir(): string {
  return resolveRuntimeDataDir();
}
