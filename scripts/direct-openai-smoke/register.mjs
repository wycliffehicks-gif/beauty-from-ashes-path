// Native Node 24 TypeScript/alias resolution for the separate direct test.
// The offline-only loader and its transport prohibition remain unchanged.
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
const root = fileURLToPath(new URL("../../", import.meta.url));
registerHooks({
  resolve(specifier, context, nextResolve) {
    let path;
    if (specifier.startsWith("@/")) path = resolve(root, "src", specifier.slice(2));
    else if (specifier.startsWith(".") && context.parentURL?.startsWith("file:"))
      path = resolve(dirname(fileURLToPath(context.parentURL)), specifier);
    if (path && !existsSync(path) && existsSync(`${path}.ts`))
      return nextResolve(pathToFileURL(`${path}.ts`).href, context);
    return nextResolve(specifier, context);
  },
});
