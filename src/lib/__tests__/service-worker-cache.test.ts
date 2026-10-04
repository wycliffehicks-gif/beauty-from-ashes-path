import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

// Executes the actual worker script with synthetic fetch/cache events. No
// registration, browser, service, credentials or real network is involved.
const source = readFileSync("public/sw.js", "utf8");
const origin = "https://bfa.example.test";
const currentCache = "bfa-shell-v2";
const key = (input: Request | string) => typeof input === "string" ? new URL(input, origin).href : input.url;
function response(text: string, type = "text/html", headers: Record<string, string> = {}, status = 200) {
  return new Response(text, { status, headers: { "content-type": type, ...headers } });
}
function request(path: string, options: RequestInit = {}, navigate = false) {
  const req = new Request(new URL(path, origin), options);
  if (navigate) Object.defineProperty(req, "mode", { value: "navigate" });
  return req;
}
function worker() {
  const listeners = new Map<string, (event: any) => void>();
  const disk = new Map<string, Map<string, Response>>();
  const fetch = vi.fn(async (_request: Request): Promise<Response> => { throw Error("synthetic offline"); });
  const deleted: string[] = [];
  let storageUnavailable = false;
  const cache = (name: string) => {
    if (!disk.has(name)) disk.set(name, new Map());
    const entries = disk.get(name)!;
    return {
      match: async (req: Request | string) => entries.get(key(req))?.clone(),
      put: async (req: Request | string, res: Response) => { entries.set(key(req), res.clone()); },
      delete: async (req: Request | string) => entries.delete(key(req)),
    };
  };
  const self = { location: { origin }, addEventListener: (type: string, fn: (event: any) => void) => listeners.set(type, fn), skipWaiting: vi.fn(), clients: { claim: vi.fn() } };
  runInNewContext(source, {
    self, Request, Response, URL, fetch,
    caches: {
      open: async (name: string) => { if (storageUnavailable) throw Error("synthetic cache unavailable"); return cache(name); },
      keys: async () => [...disk.keys()],
      delete: async (name: string) => { deleted.push(name); return disk.delete(name); },
    },
  });
  return {
    disk, fetch, deleted, self,
    setStorageUnavailable: () => { storageUnavailable = true; },
    seed: async (path: string, value: Response, name = currentCache) => cache(name).put(new URL(path, origin).href, value),
    stored: (path: string, name = currentCache) => disk.get(name)?.get(new URL(path, origin).href),
    dispatch(req: Request) {
      let result: Promise<Response> | undefined;
      listeners.get("fetch")!({ request: req, respondWith: (promise: Promise<Response>) => { result = promise; } });
      return result;
    },
    async lifecycle(type: string) {
      let pending: Promise<unknown> | undefined;
      listeners.get(type)!({ waitUntil: (promise: Promise<unknown>) => { pending = promise; } });
      await pending;
    },
  };
}

describe("service-worker shell updates and offline fallback", () => {
  it("fetches fresh root HTML before any cached shell and replaces the saved shell", async () => {
    const w = worker(); await w.seed("/", response("OLD SHELL"));
    w.fetch.mockResolvedValue(response("UPDATED SHELL"));
    const result = await w.dispatch(request("/", {}, true));
    expect(await result!.text()).toBe("UPDATED SHELL");
    expect(w.fetch).toHaveBeenCalledTimes(1);
    expect(await w.stored("/")!.clone().text()).toBe("UPDATED SHELL");
  });
  it("uses the current cached root offline and redirects deep links home without caching route HTML", async () => {
    const w = worker(); await w.seed("/", response("SAFE ROOT"));
    expect(await (await w.dispatch(request("/", {}, true)))!.text()).toBe("SAFE ROOT");
    const deep = await w.dispatch(request("/day/2", {}, true));
    expect(deep!.status).toBe(307);
    expect(deep!.headers.get("location")).toBe(`${origin}/`);
    expect(w.stored("/day/2")).toBeUndefined();
    w.fetch.mockResolvedValue(response("DYNAMIC ROUTE HTML"));
    expect(await (await w.dispatch(request("/settings", {}, true)))!.text()).toBe("DYNAMIC ROUTE HTML");
    expect(w.stored("/settings")).toBeUndefined();
  });
  it("shows a static offline response when no current safe shell exists; never borrows old dynamic caches", async () => {
    const w = worker();
    await w.seed("/", response("OLD SHELL"), "bfa-shell-v1");
    await w.seed("/day/2", response("OLD DYNAMIC DATA"), "bfa-shell-v1");
    const result = await w.dispatch(request("/day/2", {}, true));
    expect(result!.status).toBe(503);
    expect(await result!.text()).toContain("Connect to the internet");
    expect(result!.headers.get("cache-control")).toBe("no-store");
  });
  it("returns an online error instead of hiding it behind the cached shell", async () => {
    const w = worker(); await w.seed("/", response("OLD SHELL"));
    w.fetch.mockResolvedValue(response("ACCESS REFUSED", "text/html", {}, 403));
    const result = await w.dispatch(request("/", {}, true));
    expect(result!.status).toBe(403);
    expect(await result!.text()).toBe("ACCESS REFUSED");
    expect(w.stored("/")).toBeUndefined();
  });
  it("keeps a successful network response usable when Cache Storage fails", async () => {
    const w = worker(); w.setStorageUnavailable();
    w.fetch.mockResolvedValue(response("NETWORK SHELL"));
    expect(await (await w.dispatch(request("/", {}, true)))!.text()).toBe("NETWORK SHELL");
    w.fetch.mockRejectedValue(Error("synthetic offline"));
    expect((await w.dispatch(request("/", {}, true)))!.status).toBe(503);
  });
});

describe("service-worker request and response cache boundary", () => {
  it.each([
    ["server function", "/_serverFn/getJourneyAiAvailability", {}, false],
    ["RPC navigation", "/_serverFn/getJourneyAiAvailability", {}, true],
    ["API", "/api/private", {}, false],
    ["auth", "/auth/session", {}, false],
    ["unlisted JSON", "/private.json", {}, false],
    ["unhashed asset", "/assets/app.js", {}, false],
    ["source map", "/assets/app-abcdef12.js.map", {}, false],
    ["query-bearing asset", "/assets/app-abcdef12.js?private=sentinel", {}, false],
    ["query-bearing navigation", "/?private=sentinel", {}, true],
    ["foreign origin", "https://elsewhere.example.test/assets/app-abcdef12.js", {}, false],
    ["authorization", "/assets/app-abcdef12.js", { headers: { authorization: "fictional-token" } }, false],
    ["range", "/assets/app-abcdef12.js", { headers: { range: "bytes=0-10" } }, false],
    ["request no-store", "/assets/app-abcdef12.js", { cache: "no-store" }, false],
    ["header no-store", "/assets/app-abcdef12.js", { headers: { "cache-control": "no-store" } }, false],
    ["POST", "/", { method: "POST" }, false],
  ] as const)("does not intercept or inspect cached data for %s", async (_name, path, options, navigate) => {
    const w = worker(); await w.seed(path, response("STALE PRIVATE SENTINEL"), "bfa-shell-v1");
    expect(w.dispatch(request(path, options, navigate))).toBeUndefined();
    expect(w.fetch).not.toHaveBeenCalled();
    expect(w.disk.has(currentCache)).toBe(false);
  });
  it("caches an approved hashed script and serves that immutable file offline", async () => {
    const w = worker(), path = "/assets/app-abcdef12.js";
    w.fetch.mockResolvedValue(response("SAFE JAVASCRIPT", "text/javascript"));
    expect(await (await w.dispatch(request(path)))!.text()).toBe("SAFE JAVASCRIPT");
    w.fetch.mockRejectedValue(Error("synthetic offline"));
    expect(await (await w.dispatch(request(path)))!.text()).toBe("SAFE JAVASCRIPT");
    expect(w.fetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["private", { "cache-control": "private, max-age=60" }],
    ["no-store", { "cache-control": "public, no-store" }],
    ["no-cache", { "cache-control": "no-cache" }],
    ["vary cookie", { vary: "Accept-Encoding, Cookie" }],
    ["vary authorization", { vary: "Authorization" }],
    ["vary wildcard", { vary: "*" }],
    ["set-cookie when visible", { "set-cookie": "fictional=yes" }],
  ])("does not persist a %s response and removes an older root copy", async (_name, headers) => {
    const w = worker(); await w.seed("/", response("OLDER SHELL"));
    w.fetch.mockResolvedValue(response("NOT FOR CACHING", "text/html", headers as Record<string, string>));
    expect(await (await w.dispatch(request("/", {}, true)))!.text()).toBe("NOT FOR CACHING");
    expect(w.stored("/")).toBeUndefined();
  });
  it.each(["wrong MIME", "redirect", "opaque", "different URL"])("rejects a static response with %s", async kind => {
    const w = worker(), path = "/assets/app-abcdef12.js";
    const res = response("NOT FOR CACHING", kind === "wrong MIME" ? "text/html" : "text/javascript");
    if (kind === "redirect") Object.defineProperty(res, "redirected", { value: true });
    if (kind === "opaque") Object.defineProperty(res, "type", { value: "opaque" });
    if (kind === "different URL") Object.defineProperty(res, "url", { value: `${origin}/auth/login` });
    w.fetch.mockResolvedValue(res);
    expect(await (await w.dispatch(request(path)))!.text()).toBe("NOT FOR CACHING");
    expect(w.stored(path)).toBeUndefined();
  });
});

describe("service-worker cache lifecycle", () => {
  it("installs despite unavailable optional files, with no obsolete index.html dependency", async () => {
    const w = worker();
    w.fetch.mockImplementation(async req => {
      const path = new URL(req.url).pathname;
      if (path === "/") return response("SAFE ROOT");
      if (path === "/favicon.svg") throw Error("synthetic unavailable asset");
      return response("missing", "text/plain", {}, 404);
    });
    await w.lifecycle("install");
    expect(w.self.skipWaiting).toHaveBeenCalledTimes(1);
    expect(w.fetch.mock.calls.map(([req]) => new URL(req.url).pathname).sort()).toEqual(["/", "/favicon.svg", "/manifest.json"]);
    expect(w.fetch.mock.calls.every(([req]) => req.credentials === "omit")).toBe(true);
    expect(await w.stored("/")!.clone().text()).toBe("SAFE ROOT");
    expect(w.stored("/manifest.json")).toBeUndefined();
  });
  it("purges only old BFA shell caches, leaving unrelated origin caches intact", async () => {
    const w = worker();
    for (const name of ["bfa-shell-v1", "bfa-shell-v0", currentCache, "another-app-v1"]) await w.seed("/", response("shell"), name);
    await w.lifecycle("activate");
    expect(w.deleted.sort()).toEqual(["bfa-shell-v0", "bfa-shell-v1"]);
    expect([...w.disk.keys()].sort()).toEqual(["another-app-v1", currentCache]);
    expect(w.self.clients.claim).toHaveBeenCalledTimes(1);
  });
});
