import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { APP_STORAGE_NAME, migrateLegacyConfigDir, resolveRuntimeConfigDir, resolveRuntimeDataDir } from "@ccr/core/runtime/app-paths.ts";

test("runtime config and data dirs default to the shared CCR storage", () => {
  withRuntimePathEnv({
    appData: path.join(os.tmpdir(), "ccr-app-paths-app-data"),
    home: path.join(os.tmpdir(), "ccr-app-paths-home")
  }, () => {
    const configDir = resolveRuntimeConfigDir();
    const expectedConfigDir = process.platform === "win32"
      ? path.join(os.tmpdir(), "ccr-app-paths-app-data", APP_STORAGE_NAME)
      : path.join(os.tmpdir(), "ccr-app-paths-home", `.${APP_STORAGE_NAME}`);
    const expectedDataDir = process.platform === "win32"
      ? expectedConfigDir
      : path.join(expectedConfigDir, "app-data");

    assert.equal(configDir, expectedConfigDir);
    assert.equal(resolveRuntimeDataDir(), expectedDataDir);
  });
});

test("OMR_DATA_DIR becomes the single root for config and data dirs", () => {
  const isolated = path.join(os.tmpdir(), "ccr-app-paths-omr-data-dir");
  withRuntimePathEnv({
    appData: path.join(os.tmpdir(), "ccr-app-paths-omr-app-data"),
    home: path.join(os.tmpdir(), "ccr-app-paths-omr-home")
  }, () => {
    withOptionalEnv("OMR_DATA_DIR", isolated, () => {
      assert.equal(resolveRuntimeConfigDir(), isolated);
      assert.equal(
        resolveRuntimeDataDir(),
        process.platform === "win32" ? isolated : path.join(isolated, "app-data")
      );
    });
  });
});

test("two different OMR_DATA_DIR values never share runtime state", () => {
  const first = path.join(os.tmpdir(), "ccr-app-paths-omr-iso-a");
  const second = path.join(os.tmpdir(), "ccr-app-paths-omr-iso-b");

  withOptionalEnv("OMR_DATA_DIR", first, () => {
    const configDir = resolveRuntimeConfigDir();
    const dataDir = resolveRuntimeDataDir();
    withOptionalEnv("OMR_DATA_DIR", second, () => {
      assert.notEqual(resolveRuntimeConfigDir(), configDir);
      assert.notEqual(resolveRuntimeDataDir(), dataDir);
      assert.equal(resolveRuntimeConfigDir(), second);
    });
  });
});

test("an explicit OMR_DATA_DIR never absorbs the legacy home directory", () => {
  const isolated = path.join(os.tmpdir(), "ccr-app-paths-omr-no-migrate");
  withRuntimePathEnv({
    appData: path.join(os.tmpdir(), "ccr-app-paths-omr-no-migrate-app-data"),
    home: path.join(os.tmpdir(), "ccr-app-paths-omr-no-migrate-home")
  }, () => {
    withOptionalEnv("OMR_DATA_DIR", isolated, () => {
      assert.equal(migrateLegacyConfigDir(), false);
    });
  });
});

test("runtime data dir still allows explicit test and deployment overrides", () => {
  withRuntimePathEnv({
    appData: path.join(os.tmpdir(), "ccr-app-paths-override-app-data"),
    home: path.join(os.tmpdir(), "ccr-app-paths-override-home"),
    userData: path.join(os.tmpdir(), "ccr-app-paths-override-user-data")
  }, () => {
    assert.equal(resolveRuntimeDataDir(), path.join(os.tmpdir(), "ccr-app-paths-override-user-data"));
  });
});

function withOptionalEnv(name, value, run) {
  const previous = process.env[name];
  try {
    setOptionalEnv(name, value);
    run();
  } finally {
    setOptionalEnv(name, previous);
  }
}

function withRuntimePathEnv(paths, run) {
  const previous = {
    appData: process.env.CCR_INTERNAL_APP_DATA_DIR,
    home: process.env.CCR_INTERNAL_HOME_DIR,
    userData: process.env.CCR_INTERNAL_USER_DATA_DIR
  };
  try {
    setOptionalEnv("CCR_INTERNAL_APP_DATA_DIR", paths.appData);
    setOptionalEnv("CCR_INTERNAL_HOME_DIR", paths.home);
    setOptionalEnv("CCR_INTERNAL_USER_DATA_DIR", paths.userData);
    run();
  } finally {
    setOptionalEnv("CCR_INTERNAL_APP_DATA_DIR", previous.appData);
    setOptionalEnv("CCR_INTERNAL_HOME_DIR", previous.home);
    setOptionalEnv("CCR_INTERNAL_USER_DATA_DIR", previous.userData);
  }
}

function setOptionalEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
