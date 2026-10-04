// Opt-in Node build for a future AWS/Azure host. The normal Lovable build stays
// in vite.config.ts. Use the same pinned plugins exactly once via the helper.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// The managed Lovable builder deliberately pins its own output target. Do not
// silently produce a Cloudflare bundle when this command promises Node output.
if (process.env.LOVABLE_SANDBOX === "1" || process.env.DEV_SERVER__PROJECT_PATH) {
  throw new Error(
    "Build the cloud package in an external checkout or Docker; use the normal build inside Lovable.",
  );
}

export default defineConfig({
  tanstackStart: { server: { entry: "server" } },
  nitro: { preset: "node-server" },
});
