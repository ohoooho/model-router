import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

test("onboarding requires both the installer marker and the agent setup confirmation", async () => {
  const testRoot = path.join(
    process.env.CCR_INTERNAL_HOME_DIR,
    `onboarding-agent-setup-${process.pid}`
  );
  process.env.CCR_INTERNAL_HOME_DIR = path.join(testRoot, "home");
  process.env.CCR_INTERNAL_APP_DATA_DIR = path.join(testRoot, "app-data");
  process.env.CCR_INTERNAL_USER_DATA_DIR = path.join(testRoot, "user-data");

  const {
    AGENT_SETUP_COMPLETED_AT_SETTING_KEY,
    ONBOARDING_FINISHED_AT_SETTING_KEY
  } = await import("@ccr/core/config/constants.ts");
  const { replacePersistedAppSetting } = await import("@ccr/core/config/config-repository.ts");
  const { loadOnboardingFinished, markOnboardingFinished } = await import(
    "@ccr/core/config/onboarding-state.ts"
  );

  const installedAt = new Date().toISOString();
  await replacePersistedAppSetting(ONBOARDING_FINISHED_AT_SETTING_KEY, installedAt);
  assert.equal(
    await loadOnboardingFinished(),
    false,
    "an installer-seeded marker alone must still open agent setup"
  );

  await markOnboardingFinished();
  assert.equal(
    await loadOnboardingFinished(),
    true,
    "completing or skipping setup must write both markers"
  );

  const { loadPersistedAppSetting } = await import("@ccr/core/config/config-repository.ts");
  assert.equal(
    await loadPersistedAppSetting(AGENT_SETUP_COMPLETED_AT_SETTING_KEY),
    await loadPersistedAppSetting(ONBOARDING_FINISHED_AT_SETTING_KEY)
  );
});
