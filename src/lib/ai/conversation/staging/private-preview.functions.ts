import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { isPrivateProjectPreview } from "./private-preview-origin";

// This content-free decision may be requested before sign-in. No Auth, project
// settings, material, SQL rows or credentials are exposed to the browser.
export const readPrivatePreviewAvailability = createServerFn({ method: "POST" }).handler(() => {
  setResponseHeader("Cache-Control", "private, no-store");
  return (
    process.env["BFA_PRIVATE_TYPED_SEND_ENABLED"] === "true" &&
    isPrivateProjectPreview(getRequest().url)
  );
});
