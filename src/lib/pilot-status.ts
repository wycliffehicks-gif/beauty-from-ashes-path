export type PilotStatus = "checking" | "locked" | "open" | "unavailable";

export const PUBLIC_PILOT_PATHS = [
  "/support", "/privacy", "/terms", "/important-information", "/contact-support",
] as const;

export function isPublicPilotPath(pathname: string): boolean {
  return PUBLIC_PILOT_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function classifyPilotStatus(value: unknown): PilotStatus {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "unavailable";
  const status = value as Record<string, unknown>;
  if (typeof status.required !== "boolean" || typeof status.unlocked !== "boolean") return "unavailable";
  return !status.required || status.unlocked ? "open" : "locked";
}

/** One access check at a time; failed checks never admit protected content. */
export function createPilotStatusCheck(
  check: () => Promise<unknown>,
  publish: (status: PilotStatus) => void,
) {
  let active = true;
  let busy = false;
  return {
    async retry(): Promise<void> {
      if (!active || busy) return;
      busy = true;
      publish("checking");
      try {
        const result = await check();
        if (active) publish(classifyPilotStatus(result));
      } catch {
        if (active) publish("unavailable");
      } finally {
        busy = false;
      }
    },
    dispose() { active = false; },
  };
}
