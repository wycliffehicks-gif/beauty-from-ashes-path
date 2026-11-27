import { afterEach, expect, it, vi } from "vitest";
import { isPrivateProjectPreview } from "../staging/private-preview-origin";

const http = vi.hoisted(() => ({ request: vi.fn(), header: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ handler: (value: () => unknown) => value }),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: http.request,
  setResponseHeader: http.header,
}));
import { readPrivatePreviewAvailability } from "../staging/private-preview.functions";

const editor = "https://id-preview--62fcd5e5-2179-45ff-b8f1-2aef8df3ece3.lovable.app";
const preview = "https://preview--beauty-from-ashes-path.lovable.app";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it.each([
  editor,
  preview,
  preview + "/conversation-staging?test=1",
  editor + "/_serverFn/availability",
])("recognizes the verified project origin on %s", (url) =>
  expect(isPrivateProjectPreview(url)).toBe(true),
);
it.each([
  "",
  "null",
  "http://preview--beauty-from-ashes-path.lovable.app",
  preview + ":8443/a",
  preview + ":443/a",
  preview.replace("https://", "https://person@"),
  preview.replace("https://", "https://person:pass@"),
  preview + ".example.invalid/a",
  preview + "@example.invalid/a",
  preview.replace("preview", "p%72eview"),
  preview.replace("preview", "Preview"),
  preview.replace("//", "////"),
  preview.replace("://", ":\\\\"),
  "https://beauty-from-ashes-path.lovable.app",
  "https://preview--other.lovable.app",
  "http://localhost:4178",
  "https://example.invalid/?host=" + preview,
  "https://example.invalid/#" + editor,
  "blob:" + preview + "/a",
  "https://preview--beauty-from-ashes-path.lovable.app./a",
])("rejects unverified or noncanonical preview URL %j", (url) =>
  expect(isPrivateProjectPreview(url)).toBe(false),
);
it.each([undefined, "", "false", "TRUE", "1"])(
  "keeps an exact preview closed without explicit server opt-in %j",
  async (value) => {
    vi.stubEnv("BFA_PRIVATE_TYPED_SEND_ENABLED", value);
    http.request.mockReturnValue(new Request(preview + "/_serverFn/a"));
    expect(await readPrivatePreviewAvailability()).toBe(false);
    expect(http.header).toHaveBeenCalledWith("Cache-Control", "private, no-store");
  },
);
it("accepts the canonical host only and ignores browser and proxy header overrides", async () => {
  vi.stubEnv("BFA_PRIVATE_TYPED_SEND_ENABLED", "true");
  const headers = {
    Origin: preview,
    Referer: editor,
    Host: new URL(preview).host,
    "X-Forwarded-Host": new URL(preview).host,
    "X-Forwarded-Proto": "https",
  };
  http.request.mockReturnValue(new Request("http://internal.invalid/_serverFn/a", { headers }));
  expect(await readPrivatePreviewAvailability()).toBe(false);
  http.request.mockReturnValue(new Request(editor + "/_serverFn/a"));
  expect(await readPrivatePreviewAvailability()).toBe(true);
  vi.stubEnv("BFA_PRIVATE_TYPED_SEND_ENABLED", "false");
  expect(await readPrivatePreviewAvailability()).toBe(false);
});
