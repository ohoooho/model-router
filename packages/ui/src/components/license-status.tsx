import React, { useEffect, useState } from "react";

type LicenseInfo = {
  valid: boolean;
  expiresAt: string | null;
  daysRemaining: number | null;
  fingerprint: string;
  preset: string | null;
};

const fallbackLicense: LicenseInfo = {
  valid: false,
  expiresAt: null,
  daysRemaining: null,
  fingerprint: "unsigned",
  preset: null,
};

/**
 * K-295 (2026-09-15) — License status card for the OMR v2 UI.
 *
 * Polls the local OMR gateway for the active Taoxian License v1.2 metadata
 * and renders a small badge in the tray header. When a license is missing or
 * expired the card surfaces a clear warning so the operator notices before
 * the gateway starts refusing requests.
 *
 * The card is intentionally read-only — license mutations belong in the CLI
 * (`model-router license`) and should never happen from a browser tab.
 */
export const LicenseStatus: React.FC = () => {
  const [info, setInfo] = useState<LicenseInfo>(fallbackLicense);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/v1/license");
        if (!res.ok) return;
        const json = (await res.json()) as Partial<LicenseInfo>;
        if (!cancelled) {
          setInfo({ ...fallbackLicense, ...json });
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const id = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  if (loading) {
    return (
      <span className="license-badge license-badge--loading" aria-label="License loading">
        License · 校验中
      </span>
    );
  }

  if (!info.valid) {
    return (
      <span className="license-badge license-badge--invalid" role="alert">
        License · 未激活 (桃仙 v1.2)
      </span>
    );
  }

  const remaining = info.daysRemaining ?? 0;
  const tone = remaining < 7 ? "warn" : "ok";
  return (
    <span className={`license-badge license-badge--${tone}`} aria-label={`License valid, ${remaining} days remaining`}>
      License · {info.preset ?? "taoxian"} · {remaining}d
    </span>
  );
};

export default LicenseStatus;
