// Node 24 native TypeScript execution with the app's @ alias, no extra dependency.
// This CLI never loads providers; unexpected transport imports fail closed.
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const forbidden =
  /^(?:node:)?(?:http|https|http2|net|tls|dns|dgram|child_process|worker_threads)(?:\/|$)/;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (forbidden.test(specifier) || /\.server(?:\.|$)/.test(specifier))
      throw new Error("offline-transport-import-forbidden");
    let candidate;
    if (specifier.startsWith("@/")) candidate = resolve(repoRoot, "src", specifier.slice(2));
    else if (specifier.startsWith(".") && context.parentURL?.startsWith("file:"))
      candidate = resolve(dirname(fileURLToPath(context.parentURL)), specifier);
    if (candidate && !existsSync(candidate) && existsSync(`${candidate}.ts`))
      return nextResolve(pathToFileURL(`${candidate}.ts`).href, context);
    return nextResolve(specifier, context);
  },
});
