// A display check for the existing fictional staging page. Neither URL grants access.
const previewOrigins = new Set([
  "https://id-preview--62fcd5e5-2179-45ff-b8f1-2aef8df3ece3.lovable.app",
  "https://preview--beauty-from-ashes-path.lovable.app",
]);

export function isPrivateProjectPreview(url: string): boolean {
  try {
    const { origin } = new URL(url);
    // Match the canonical authority too: the URL parser alone normalizes credentials,
    // encoded host characters, explicit default ports and backslashes.
    return previewOrigins.has(origin) && (url === origin || url.startsWith(origin + "/"));
  } catch {
    return false;
  }
}
