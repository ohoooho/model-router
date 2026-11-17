import { existsSync } from "node:fs";
import {
  loadPersistedAppSetting,
  replacePersistedAppSetting
} from "@ccr/core/config/config-repository";
import {
  AGENT_SETUP_COMPLETED_AT_SETTING_KEY,
  ONBOARDING_FINISHED_AT_SETTING_KEY,
  ONBOARDING_FINISHED_FILE
} from "@ccr/core/config/constants";

function hasPersistedTimestamp(value: unknown): boolean {
  return typeof value === "string" && Boolean(value.trim());
}

export async function loadOnboardingFinished(): Promise<boolean> {
  try {
    const onboardingFinishedAt = await loadPersistedAppSetting(ONBOARDING_FINISHED_AT_SETTING_KEY);
    const agentSetupCompletedAt = await loadPersistedAppSetting(AGENT_SETUP_COMPLETED_AT_SETTING_KEY);
    // The installer marks onboardingFinishedAt after seeding the provider and
    // routing config. Require the user-facing agent setup confirmation too, so
    // a fresh install opens the "Connect agent" step instead of jumping
    // straight to Overview. Existing installs that only have the old marker
    // see the setup flow once; "Skip setup" writes both markers.
    return hasPersistedTimestamp(onboardingFinishedAt) && hasPersistedTimestamp(agentSetupCompletedAt);
  } catch (error) {
    console.warn(`[config] Failed to load onboarding state: ${formatError(error)}`);
    return existsSync(ONBOARDING_FINISHED_FILE);
  }
}

export async function markOnboardingFinished(): Promise<void> {
  const now = new Date().toISOString();
  await replacePersistedAppSetting(ONBOARDING_FINISHED_AT_SETTING_KEY, now);
  await replacePersistedAppSetting(AGENT_SETUP_COMPLETED_AT_SETTING_KEY, now);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
