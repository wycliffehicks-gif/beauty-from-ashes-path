// Conversation P3a — service-owned scoped grant issuer with lineage.
//
// Grants are issued ONLY by the service from its trusted fixture resolver,
// bound to the exact owner / thread / current turn / admitted message and
// the preference + restriction revisions at issue time. A follow-up grant
// must resolve a real, unrevoked parent issued for the IMMEDIATELY previous
// admitted turn, keep the original kind and pin the original source bytes.
//
// What this proves: lineage INTEGRITY. Whether a sentence is a direct
// follow-up is fixture-defined (see semantic-fixtures.ts), not understood.

import type { ServerGrant } from "../contract";
import { resolveRegistrySource, sha256Hex, type SourceRegistry } from "../sources";

/** Complete pinned contract provenance of a source at grant issue time. */
export interface PinnedSource {
  readonly sourceKey: string;
  readonly kind: string;
  readonly title: string;
  readonly textSha256: string;
  readonly sourceCommit: string;
  /** Canonical JSON of origin (reference/translation/file/day...). */
  readonly originJson: string;
  readonly reviewStatus: string;
  readonly spiritualClassification: string;
  readonly limitationsJson: string;
  readonly testOnly: boolean;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

async function pinFromExcerpt(ex: import("../sources").SourceExcerpt): Promise<PinnedSource> {
  return Object.freeze({
    sourceKey: ex.sourceKey,
    kind: ex.kind,
    title: ex.title,
    textSha256: await sha256Hex(ex.exactText),
    sourceCommit: ex.sourceCommit,
    originJson: canonical(ex.origin),
    reviewStatus: ex.reviewStatus,
    spiritualClassification: ex.spiritualClassification,
    limitationsJson: canonical(ex.limitations),
    testOnly: ex.testOnly,
  });
}

function pinsEqual(a: PinnedSource, b: PinnedSource): boolean {
  return canonical(a) === canonical(b);
}

export interface IssuedGrant {
  readonly grantId: string;
  readonly kind: "prayer" | "passage";
  readonly ownerId: string;
  readonly threadId: string;
  readonly turnId: string;
  readonly messageEventId: string;
  readonly messageSha256: string;
  readonly preferenceRevision: number;
  readonly restrictionRevision: number;
  readonly originalGrantId: string;
  readonly originalTurnId: string;
  readonly parentGrantId: string | null;
  readonly sources: readonly PinnedSource[];
  readonly provenance: "service-fixture-resolver";
}

export type GrantFailure =
  | "orphan-or-forged"
  | "revoked"
  | "owner-mismatch"
  | "thread-mismatch"
  | "turn-mismatch"
  | "message-mismatch"
  | "kind-changed"
  | "sources-changed"
  | "source-hash-changed"
  | "parent-not-immediate"
  | "revision-mismatch"
  | "follow-up-kind-mismatch";

export interface GrantBinding {
  readonly ownerId: string;
  readonly threadId: string;
  readonly turnId: string;
  readonly messageEventId: string;
  readonly messageSha256: string;
  readonly preferenceRevision: number;
  readonly restrictionRevision: number;
}

export class GrantIssuer {
  private readonly issued = new Map<string, IssuedGrant>();
  private readonly revoked = new Set<string>();
  private counter = 0;

  constructor(private readonly idPrefix: string) {}

  async issueOriginal(
    binding: GrantBinding,
    kind: "prayer" | "passage",
    sourceKeys: readonly string[],
    registry: SourceRegistry,
    allowTestSources: boolean,
  ): Promise<IssuedGrant | null> {
    const sources: PinnedSource[] = [];
    for (const key of sourceKeys) {
      const r = resolveRegistrySource(registry, key, allowTestSources);
      if (!r.ok) return null;
      sources.push(await pinFromExcerpt(r.value.excerpt));
    }
    this.counter += 1;
    const grantId = `bfa-grant-${this.idPrefix}-${this.counter}`;
    const grant: IssuedGrant = Object.freeze({
      grantId,
      kind,
      ...binding,
      originalGrantId: grantId,
      originalTurnId: binding.turnId,
      parentGrantId: null,
      sources: Object.freeze(sources.map((s) => Object.freeze(s))),
      provenance: "service-fixture-resolver" as const,
    });
    this.issued.set(grantId, grant);
    return grant;
  }

  /** Issue a follow-up bound to the current turn from a real parent. */
  async issueFollowUp(
    binding: GrantBinding,
    parentGrantId: string,
    immediatePreviousTurnId: string | null,
    requiredKind: "prayer" | "passage",
    registry: SourceRegistry,
    allowTestSources: boolean,
  ): Promise<{ ok: true; grant: IssuedGrant } | { ok: false; failure: GrantFailure }> {
    const parent = this.issued.get(parentGrantId);
    if (!parent) return { ok: false, failure: "orphan-or-forged" };
    if (this.revoked.has(parent.grantId) || this.revoked.has(parent.originalGrantId)) {
      return { ok: false, failure: "revoked" };
    }
    if (parent.ownerId !== binding.ownerId) return { ok: false, failure: "owner-mismatch" };
    if (parent.threadId !== binding.threadId) return { ok: false, failure: "thread-mismatch" };
    if (parent.turnId !== immediatePreviousTurnId) {
      return { ok: false, failure: "parent-not-immediate" };
    }
    if (parent.kind !== requiredKind) return { ok: false, failure: "follow-up-kind-mismatch" };
    // An older permission never survives a preference/restriction change.
    if (
      parent.preferenceRevision !== binding.preferenceRevision ||
      parent.restrictionRevision !== binding.restrictionRevision
    ) {
      return { ok: false, failure: "revision-mismatch" };
    }
    const pinned = await this.verifyPinnedSources(parent, registry, allowTestSources);
    if (pinned) return { ok: false, failure: pinned };
    this.counter += 1;
    const grant: IssuedGrant = Object.freeze({
      grantId: `bfa-grant-${this.idPrefix}-${this.counter}`,
      kind: parent.kind,
      ...binding,
      originalGrantId: parent.originalGrantId,
      originalTurnId: parent.originalTurnId,
      parentGrantId: parent.grantId,
      sources: parent.sources,
      provenance: "service-fixture-resolver" as const,
    });
    this.issued.set(grant.grantId, grant);
    return { ok: true, grant };
  }

  private async verifyPinnedSources(
    grant: IssuedGrant,
    registry: SourceRegistry,
    allowTestSources: boolean,
  ): Promise<GrantFailure | null> {
    for (const pin of grant.sources) {
      const r = resolveRegistrySource(registry, pin.sourceKey, allowTestSources);
      if (!r.ok) return "sources-changed";
      const now = await pinFromExcerpt(r.value.excerpt);
      if (now.textSha256 !== pin.textSha256) return "source-hash-changed";
      if (!pinsEqual(now, pin)) return "sources-changed";
    }
    return null;
  }

  /**
   * Validate a candidate grant record for use in the current turn. The
   * candidate must be the IDENTICAL issued record (object identity), so
   * a forged/client-supplied/copied record with the same ID fails; and its
   * whole chain back to the original must be intact and unrevoked.
   */
  async validate(
    candidate: unknown,
    binding: GrantBinding,
    registry: SourceRegistry,
    allowTestSources: boolean,
  ): Promise<{ ok: true; grant: IssuedGrant } | { ok: false; failure: GrantFailure }> {
    if (!candidate || typeof candidate !== "object") {
      return { ok: false, failure: "orphan-or-forged" };
    }
    const id = (candidate as { grantId?: unknown }).grantId;
    const issued = typeof id === "string" ? this.issued.get(id) : undefined;
    if (!issued || issued !== candidate) return { ok: false, failure: "orphan-or-forged" };
    if (this.revoked.has(issued.grantId)) return { ok: false, failure: "revoked" };
    if (issued.ownerId !== binding.ownerId) return { ok: false, failure: "owner-mismatch" };
    if (issued.threadId !== binding.threadId) return { ok: false, failure: "thread-mismatch" };
    if (issued.turnId !== binding.turnId) return { ok: false, failure: "turn-mismatch" };
    if (
      issued.messageEventId !== binding.messageEventId ||
      issued.messageSha256 !== binding.messageSha256
    ) {
      return { ok: false, failure: "message-mismatch" };
    }
    if (
      issued.preferenceRevision !== binding.preferenceRevision ||
      issued.restrictionRevision !== binding.restrictionRevision
    ) {
      return { ok: false, failure: "revision-mismatch" };
    }
    // Walk the chain: every ancestor real, unrevoked, same kind, same sources.
    let node: IssuedGrant = issued;
    while (node.parentGrantId !== null) {
      const parent = this.issued.get(node.parentGrantId);
      if (!parent) return { ok: false, failure: "orphan-or-forged" };
      if (this.revoked.has(parent.grantId)) return { ok: false, failure: "revoked" };
      if (parent.kind !== node.kind) return { ok: false, failure: "kind-changed" };
      if (
        parent.preferenceRevision !== node.preferenceRevision ||
        parent.restrictionRevision !== node.restrictionRevision
      ) {
        return { ok: false, failure: "revision-mismatch" };
      }
      if (parent.threadId !== node.threadId || parent.ownerId !== node.ownerId) {
        return { ok: false, failure: "thread-mismatch" };
      }
      const a = parent.sources.map((s) => canonical(s)).sort().join("|");
      const b = node.sources.map((s) => canonical(s)).sort().join("|");
      if (a !== b) return { ok: false, failure: "sources-changed" };
      node = parent;
    }
    if (node.grantId !== issued.originalGrantId || node.kind !== issued.kind) {
      return { ok: false, failure: "kind-changed" };
    }
    const pinned = await this.verifyPinnedSources(issued, registry, allowTestSources);
    if (pinned) return { ok: false, failure: pinned };
    return { ok: true, grant: issued };
  }

  /** Revoke grants (discarded turns, deleted thread, clear-all). */
  revoke(grantIds: Iterable<string>) {
    for (const id of grantIds) this.revoked.add(id);
  }

  /** Remove every record for a thread (confirmed delete / clear). */
  purgeThread(threadId: string) {
    for (const [id, g] of this.issued) {
      if (g.threadId === threadId) {
        this.issued.delete(id);
        this.revoked.delete(id);
      }
    }
  }

  get(grantId: string): IssuedGrant | undefined {
    return this.issued.get(grantId);
  }

  /** Test/inspection: records currently held for a thread. */
  forThread(threadId: string): IssuedGrant[] {
    return [...this.issued.values()].filter((g) => g.threadId === threadId);
  }

  isRevoked(grantId: string): boolean {
    return this.revoked.has(grantId);
  }

  /** Internal server persistence only; never accept this projection from client JSON. */
  exportAuthority(threadId?: string) {
    const issued = [...this.issued.values()].filter(g => threadId === undefined || g.threadId === threadId);
    const selectedIds = new Set(issued.map(g => g.grantId));
    const revoked = [...this.revoked].filter(id => threadId === undefined || selectedIds.has(id));
    // Keep the issuer high-water counter: omitted threads must not cause ID reuse.
    // Filtering is a detached projection, never a mutation of live issuer records.
    return structuredClone({ issued, revoked, counter: this.counter });
  }

  restoreAuthority(state: ReturnType<GrantIssuer["exportAuthority"]>): void {
    this.issued.clear();
    this.revoked.clear();
    this.counter = state.counter;
    for (const grant of state.issued) {
      const copy = structuredClone(grant);
      this.issued.set(copy.grantId, Object.freeze({ ...copy, sources: Object.freeze(copy.sources.map(s => Object.freeze(s))) }));
    }
    for (const id of state.revoked) this.revoked.add(id);
  }
}

/** Project an issued grant onto the P1 ServerGrant contract. */
export function toServerGrant(grant: IssuedGrant, parent: IssuedGrant | null): ServerGrant {
  return {
    grantId: grant.grantId,
    kind: grant.kind,
    ownerId: grant.ownerId,
    threadId: grant.threadId,
    turnId: grant.turnId,
    sourceIds: grant.sources.map((s) => s.sourceKey),
    followUpOfTurnId: parent ? parent.turnId : null,
  };
}
