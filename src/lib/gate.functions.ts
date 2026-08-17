import { createServerFn } from "@tanstack/react-start";

export const getGateStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { getGateSession } = await import("./gate.server");
  const expected = process.env["SITE_PASSWORD"];
  // With no code configured the pilot gate is simply off.
  if (!expected) return { required: false as const, unlocked: true };
  const session = await getGateSession();
  return { required: true as const, unlocked: Boolean(session.data.unlocked) };
});

export const unlockSite = createServerFn({ method: "POST" })
  .inputValidator((data: { passcode: string }) => ({
    passcode: String(data?.passcode ?? "").slice(0, 200),
  }))
  .handler(async ({ data }) => {
    const { getGateSession, passcodeMatches } = await import("./gate.server");
    const expected = process.env["SITE_PASSWORD"];
    if (!expected) return { ok: true as const };
    if (!passcodeMatches(data.passcode, expected)) return { ok: false as const };
    const session = await getGateSession();
    await session.update({ unlocked: true });
    return { ok: true as const };
  });

export const lockSite = createServerFn({ method: "POST" }).handler(async () => {
  const { getGateSession } = await import("./gate.server");
  const session = await getGateSession();
  await session.clear();
  return { ok: true as const };
});
