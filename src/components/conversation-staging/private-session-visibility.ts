// A local display fence only. Server Auth independently verifies the submitted bearer.
// Never retain or display the token, and never use these unverified claims to grant access.
export function privateTypedReviewEnabled() {
  return (
    import.meta.env.VITE_BFA_PRIVATE_STAGING_SIGN_IN === "true" &&
    import.meta.env.VITE_BFA_PRIVATE_TYPED_REVIEW === "true"
  );
}

export function privateSessionVisibilityKey(
  session: { access_token: string; user: { id: string } } | null,
): string | null {
  try {
    if (
      !session ||
      typeof session.access_token !== "string" ||
      session.access_token.length > 16_384
    )
      return null;
    const parts = session.access_token.split(".");
    if (parts.length !== 3 || !parts.every((part) => /^[a-zA-Z0-9_-]+$/.test(part))) return null;
    const claims = JSON.parse(atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/")));
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    if (
      claims.sub !== session.user.id ||
      !uuid.test(claims.sub) ||
      typeof claims.session_id !== "string" ||
      !uuid.test(claims.session_id)
    )
      return null;
    return claims.sub + "/" + claims.session_id;
  } catch {
    return null;
  }
}
