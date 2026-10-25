// Conversation P3a — provider-independent shared conversation service.
//
// One service-owned in-memory FIXTURE repository holds, per thread: the
// event history, derived context items (report / intention / correction /
// restriction / AI interpretation, each with provenance), issued grants and
// lifecycle revisions. The P2 preview store is a UI projection that calls
// this service at every confirmed lifecycle change; the service is the only
// authority for what may enter a provider request.
//
// Every request is built through the P1 boundary: validateClientTurnRequest
// and assembleConversationContext (registry admission, grant binding,
// spiritual access) are reused, never bypassed. The provider is a MOCK.
//
// TRUST LIMITS (P3a): the owner is a fixed developer-preview fixture, not an
// authenticated person (P3b). Semantic meaning comes from an exact-match
// fixture table, not understanding. Storage is memory-only and disappears on
// refresh. No public endpoint exists. Nothing here proves model quality.

import { CONVERSATION_CONTRACT_VERSION } from "../contract";
import { assembleConversationContext } from "../context";
import { buildTeachingSourceRecords } from "../content/index";
import type { SpiritualRestriction } from "../grants";
import {
  CONVERSATION_POLICY_BLOCK,
  CONVERSATION_POLICY_BLOCK_SHA256,
  CONVERSATION_POLICY_IDENTITY,
} from "../policy";
import {
  createSourceRegistry,
  resolveRegistrySource,
  type SourceCard,
  type SourceRegistry,
} from "../sources";
import { GrantIssuer, toServerGrant, type IssuedGrant } from "./grant-issuer";
import {
  createMockProvider,
  type MockProvider,
  type MockProviderRequest,
  type MockProviderResponse,
  type ProviderEffectiveItem,
  type ProviderHistoryEntry,
} from "./mock-provider";
import { MockVoiceLifecycle, type VoiceOrigin } from "./mock-voice";
import { sha256HexSync } from "./sha256-sync";
import { resolveFixtureCase, type FixtureCase } from "./semantic-fixtures";

export const PREVIEW_FIXTURE_OWNER_ID = "developer-preview-fixture-owner";
export const DEFAULT_MAX_HISTORY_EVENTS = 60;
export const DEFAULT_MAX_HISTORY_CHARS = 24_000;

// ---------------------------------------------------------------------------
// Repository types

export type EventStatus = "delivered" | "not-sent" | "retried" | "cancelled";

export interface ThreadEvent {
  readonly eventId: string;
  readonly messageId: string;
  readonly turnId: string | null;
  readonly role: "user" | "assistant" | "shared-source";
  readonly text: string;
  readonly textSha256: string | null;
  status: EventStatus;
  readonly sourceKey?: string;
}

export type DerivedKind =
  | "user-report"
  | "user-intention"
  | "user-correction"
  | "active-restriction"
  | "ai-interpretation";

export interface DerivedItem {
  readonly itemId: string;
  readonly kind: DerivedKind;
  readonly tag: string;
  readonly text: string;
  readonly sourceEventId: string;
  readonly evidenceSha256: string;
  readonly origin: "fixture-resolver" | "mock-provider-fixture";
  readonly fixtureCaseId: string;
  readonly supersedesItemId: string | null;
  status: "effective" | "superseded" | "unanchored";
  supersededByItemId: string | null;
}

interface ThreadSnapshot {
  readonly events: ThreadEvent[];
  readonly derived: DerivedItem[];
  readonly restrictions: SpiritualRestriction[];
  readonly grantByTurn: [string, string][];
}

interface ThreadRecord {
  readonly storeId: string;
  readonly threadId: string;
  readonly ownerId: string;
  events: ThreadEvent[];
  derived: DerivedItem[];
  restrictions: SpiritualRestriction[];
  restrictionRevision: number;
  preferenceOn: boolean;
  preferenceRevision: number;
  generation: number;
  grantByTurn: Map<string, string>;
  historyGap: boolean;
  saved: ThreadSnapshot | null;
  lastRequest: RequestSummary | null;
  controllers: Set<AbortController>;
}

export interface RequestSummary {
  readonly requestId: string;
  readonly turnId: string;
  readonly policyIdentity: string;
  readonly policySha256: string;
  readonly historyEventIds: readonly string[];
  readonly effectiveItemIds: readonly string[];
  readonly restrictions: readonly string[];
  readonly sourceKeys: readonly string[];
  readonly spiritualReason: string;
  readonly grantId: string | null;
  readonly historyComplete: boolean;
  readonly preferenceRevision: number;
  readonly restrictionRevision: number;
}

export interface TraceEntry {
  readonly seq: number;
  readonly type: string;
  readonly threadId: string | null;
  readonly turnId?: string;
  readonly detail?: string;
}

export type TurnOutcome =
  | {
      readonly ok: true;
      readonly turnId: string;
      readonly text: string;
      readonly sourceCards: readonly SourceCard[];
    }
  | { readonly ok: false; readonly code: string; readonly message: string };

export type TurnStage =
  | "registry-ready"
  | "message-hashed"
  | "fixture-resolved"
  | "grant-issued"
  | "context-assembled"
  | "before-dispatch"
  | "provider-returned"
  | "before-commit";

export interface ConversationServiceOptions {
  readonly provider?: MockProvider;
  readonly registryRecords?: () => Promise<readonly unknown[]>;
  readonly allowTestSources?: boolean;
  /** Source keys a passage grant may name (harness-only Scripture fixture). */
  readonly passageSourceKeys?: readonly string[];
  readonly maxHistoryEvents?: number;
  readonly maxHistoryChars?: number;
  /** Test hook: runs (and is awaited) at each async stage boundary. */
  readonly stageHook?: (stage: TurnStage, turnId: string) => void | Promise<void>;
}

const FAILURE_MESSAGES: Record<string, string> = {
  "context-limit":
    "Not answered: this conversation is longer than the preview's context limit. Nothing was silently dropped; start a new conversation to continue.",
  "invalid-provider-sources":
    "Not answered: the mock reply named a source that was not admitted for this turn, so it was refused.",
  "provider-error": "Not answered: the mock provider reported an error. Nothing was retried automatically.",
  "source-hash-mismatch":
    "Not answered: shared teaching no longer matches its registered source, so it was not used.",
};

function failureMessage(code: string): string {
  return FAILURE_MESSAGES[code] ?? `Not answered: the request was refused by the context boundary (${code}).`;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Detached, deeply frozen copy (provider requests cannot be mutated). */
export function deepFreezeDetached<T>(v: T): T {
  const copy = structuredClone(v);
  const freeze = (o: unknown) => {
    if (o && typeof o === "object" && !Object.isFrozen(o)) {
      Object.freeze(o);
      for (const k of Object.keys(o)) freeze((o as Record<string, unknown>)[k]);
    } else if (o && typeof o === "object") {
      for (const k of Object.keys(o)) freeze((o as Record<string, unknown>)[k]);
    }
  };
  freeze(copy);
  return copy;
}

/**
 * Immutable admission ticket: captured when a user event is admitted and
 * checked before dispatch and after every asynchronous stage.
 */
interface AdmissionTicket {
  readonly epoch: number;
  readonly record: ThreadRecord;
  readonly userEvent: ThreadEvent;
  readonly fixture: FixtureCase | null;
  readonly generation: number;
  readonly preferenceRevision: number;
  readonly restrictionRevision: number;
  readonly voiceOrigin: VoiceOrigin | null;
}

/** Two-phase UI commit: accept() validates without publishing; apply() publishes. */
export interface TurnCommit {
  accept(): boolean;
  apply(outcome: TurnOutcome): void;
}

// ---------------------------------------------------------------------------

export class ConversationService {
  readonly ownerId = PREVIEW_FIXTURE_OWNER_ID;
  readonly voice = new MockVoiceLifecycle();
  readonly trace: TraceEntry[] = [];
  private readonly threads = new Map<string, ThreadRecord>();
  private issuer: GrantIssuer;
  private epoch = 0;
  private counter = 0;
  private traceSeq = 0;
  private readonly provider: MockProvider;
  private readonly allowTestSources: boolean;
  private readonly passageSourceKeys: readonly string[];
  private readonly maxHistoryEvents: number;
  private readonly maxHistoryChars: number;
  private readonly stageHook?: ConversationServiceOptions["stageHook"];
  private readonly registryPromise: Promise<SourceRegistry | null>;
  private registry: SourceRegistry | null = null;
  private readonly tickets = new Map<string, AdmissionTicket>();

  constructor(options: ConversationServiceOptions = {}) {
    this.provider = options.provider ?? createMockProvider({ delayMs: 350 });
    this.allowTestSources = options.allowTestSources === true;
    this.passageSourceKeys = options.passageSourceKeys ?? [];
    this.maxHistoryEvents = options.maxHistoryEvents ?? DEFAULT_MAX_HISTORY_EVENTS;
    this.maxHistoryChars = options.maxHistoryChars ?? DEFAULT_MAX_HISTORY_CHARS;
    this.stageHook = options.stageHook;
    this.issuer = new GrantIssuer("e0");
    const load = options.registryRecords ?? buildTeachingSourceRecords;
    this.registryPromise = (async () => {
      const built = await createSourceRegistry(await load());
      this.registry = built.ok ? built.registry : null;
      return this.registry;
    })();
  }

  ready(): Promise<SourceRegistry | null> {
    return this.registryPromise;
  }

  private nextId(prefix: string) {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }

  private log(type: string, threadId: string | null, turnId?: string, detail?: string) {
    this.traceSeq += 1;
    this.trace.push({ seq: this.traceSeq, type, threadId, turnId, detail });
  }

  // --- thread lifecycle -------------------------------------------------------

  ensureThread(storeId: string, preferenceOn: boolean): void {
    if (this.threads.has(storeId)) return;
    this.threads.set(storeId, {
      storeId,
      threadId: `bfa-thread-${storeId}`,
      ownerId: this.ownerId,
      events: [],
      derived: [],
      restrictions: [],
      restrictionRevision: 0,
      preferenceOn,
      preferenceRevision: 0,
      generation: 0,
      grantByTurn: new Map(),
      historyGap: false,
      saved: null,
      lastRequest: null,
      controllers: new Set(),
    });
    this.log("thread-created", `bfa-thread-${storeId}`);
  }

  hasThread(storeId: string): boolean {
    return this.threads.has(storeId);
  }

  /** Invalidate every in-flight turn for a thread (Stop, switch, etc.). */
  cancelThread(storeId: string, reason: string): void {
    const record = this.threads.get(storeId);
    if (!record) return;
    record.generation += 1;
    for (const c of record.controllers) c.abort();
    record.controllers.clear();
    this.log("thread-work-cancelled", record.threadId, undefined, reason);
  }

  setPreference(storeId: string, on: boolean): void {
    const record = this.threads.get(storeId);
    if (!record) return;
    this.cancelThread(storeId, "preference-change");
    record.preferenceOn = on;
    record.preferenceRevision += 1;
    if (!on) {
      this.voice.preferenceOff();
      if (this.voice.threadId === record.threadId) this.voice.end("preference-off");
    }
    this.log("preference-confirmed", record.threadId, undefined, on ? "on" : "off");
  }

  openThread(storeId: string): boolean {
    const record = this.threads.get(storeId);
    if (!record) {
      this.log("open-rejected-unknown", null);
      return false;
    }
    this.cancelThread(storeId, "open");
    // Reopening never carries a live voice session across threads.
    if (this.voice.state !== "idle") this.voice.end("switch");
    this.log("thread-opened", record.threadId);
    return true;
  }

  saveThread(storeId: string): void {
    const record = this.threads.get(storeId);
    if (!record) return;
    record.saved = {
      events: clone(record.events),
      derived: clone(record.derived),
      restrictions: [...record.restrictions],
      grantByTurn: [...record.grantByTurn],
    };
    this.log("thread-saved", record.threadId);
  }

  /** Restore the last saved snapshot; remove derived context of discarded turns. */
  discardThread(storeId: string): void {
    const record = this.threads.get(storeId);
    if (!record) return;
    this.cancelThread(storeId, "discard");
    const kept = new Set(record.saved?.grantByTurn.map(([, g]) => g) ?? []);
    this.issuer.revoke([...record.grantByTurn.values()].filter((g) => !kept.has(g)));
    const discardedTurns = new Set(
      record.events.map((e) => e.turnId).filter((t): t is string => t !== null),
    );
    if (record.saved) {
      record.events = clone(record.saved.events);
      record.derived = clone(record.saved.derived);
      record.restrictions = [...record.saved.restrictions];
      record.grantByTurn = new Map(record.saved.grantByTurn);
      for (const e of record.events) if (e.turnId) discardedTurns.delete(e.turnId);
    } else {
      record.events = [];
      record.derived = [];
      record.restrictions = [];
      record.grantByTurn = new Map();
    }
    record.restrictionRevision += 1;
    if (this.voice.threadId === record.threadId) this.voice.end("discard");
    this.voice.purgeTurns(discardedTurns);
    for (const t of discardedTurns) this.tickets.delete(t);
    this.log("thread-discarded", record.threadId);
  }

  /** Confirmed delete: active, saved, derived, grant and queued state removed. */
  deleteThread(storeId: string): void {
    const record = this.threads.get(storeId);
    if (!record) return;
    this.cancelThread(storeId, "delete");
    const turns = new Set(record.events.map((e) => e.turnId).filter((t): t is string => t !== null));
    this.voice.purgeThread(record.threadId);
    this.voice.purgeTurns(turns);
    for (const t of turns) this.tickets.delete(t);
    this.issuer.purgeThread(record.threadId);
    this.threads.delete(storeId);
    this.log("thread-deleted", record.threadId);
  }

  clearAll(): void {
    for (const storeId of [...this.threads.keys()]) this.cancelThread(storeId, "clear");
    this.threads.clear();
    this.epoch += 1;
    this.issuer = new GrantIssuer(`e${this.epoch}`);
    this.voice.purgeAll();
    this.tickets.clear();
    this.log("clear-all", null);
  }

  /** Developer fixture: mark earlier history as missing (gap is reported). */
  simulateHistoryGap(storeId: string): void {
    const record = this.threads.get(storeId);
    if (record) record.historyGap = true;
  }

  // --- events -----------------------------------------------------------------

  /**
   * Admit a submitted user message. Synchronously records the event, its
   * hash and its fixture-derived meaning (report/intention/correction/
   * restriction) so that meaning persists even if the reply later fails or
   * is stopped. Captures an immutable admission ticket.
   */
  admitUserMessage(
    storeId: string,
    messageId: string,
    text: string,
    voiceOrigin: VoiceOrigin | null = null,
  ): string {
    const record = this.threads.get(storeId)!;
    const turnId = `bfa-turn-e${this.epoch}-${this.nextId("t")}`;
    const event: ThreadEvent = {
      eventId: this.nextId("evt"),
      messageId,
      turnId,
      role: "user",
      text,
      textSha256: sha256HexSync(text),
      status: "delivered",
    };
    record.events.push(event);
    const fixture = resolveFixtureCase(text);
    const before = record.restrictions.length;
    const next = new Set(record.restrictions);
    for (const d of fixture?.derivations ?? []) {
      if (d.kind === "restriction") for (const r of d.add) next.add(r);
    }
    record.derived = this.deriveForTurn(record, fixture, event, event.textSha256!);
    if (next.size !== before) {
      record.restrictions = [...next];
      record.restrictionRevision += 1;
    }
    this.tickets.set(
      turnId,
      Object.freeze({
        epoch: this.epoch,
        record,
        userEvent: event,
        fixture,
        generation: record.generation,
        preferenceRevision: record.preferenceRevision,
        restrictionRevision: record.restrictionRevision,
        voiceOrigin: voiceOrigin ? Object.freeze({ ...voiceOrigin }) : null,
      }),
    );
    this.log("user-message-admitted", record.threadId, turnId);
    return turnId;
  }

  recordNotSent(storeId: string, messageId: string, text: string): void {
    const record = this.threads.get(storeId);
    if (!record) return;
    record.events.push({
      eventId: this.nextId("evt"),
      messageId,
      turnId: null,
      role: "user",
      text,
      textSha256: null,
      status: "not-sent",
    });
  }

  markRetried(storeId: string, messageId: string): void {
    const record = this.threads.get(storeId);
    const e = record?.events.find((x) => x.messageId === messageId && x.status === "not-sent");
    if (e) e.status = "retried";
  }

  recordSharedTeaching(storeId: string, messageId: string, sourceKey: string, exactText: string): void {
    const record = this.threads.get(storeId);
    if (!record) return;
    record.events.push({
      eventId: this.nextId("evt"),
      messageId,
      turnId: null,
      role: "shared-source",
      text: exactText,
      textSha256: null,
      status: "delivered",
      sourceKey,
    });
    this.log("teaching-shared", record.threadId, undefined, sourceKey);
  }

  // --- turn pipeline ------------------------------------------------------------

  /**
   * Run one turn. `commit` is called synchronously at the single commit
   * point, only while every identity is still current; it returns whether
   * the UI accepted. Stale work is dropped and traced, never committed.
   */
  async runTurn(
    storeId: string,
    turnId: string,
    commit: TurnCommit,
  ): Promise<"committed" | "stale" | "refused-by-ui"> {
    const ticket = this.tickets.get(turnId);
    const record = this.threads.get(storeId);
    if (!record || !ticket || ticket.record !== record) {
      this.log("stale-work-dropped", record?.threadId ?? null, turnId, "no-ticket");
      return "stale";
    }
    const userEvent: ThreadEvent | undefined = ticket.userEvent;
    const current = () =>
      ticket.epoch === this.epoch &&
      this.threads.get(storeId) === ticket.record &&
      record.generation === ticket.generation &&
      record.preferenceRevision === ticket.preferenceRevision &&
      record.restrictionRevision === ticket.restrictionRevision &&
      userEvent !== undefined &&
      userEvent.status === "delivered" &&
      record.events.includes(userEvent);
    const stale = (stage: string) => {
      this.log("stale-work-dropped", record.threadId, turnId, stage);
      return "stale" as const;
    };
    const stageCheck = async (stage: TurnStage) => {
      if (this.stageHook) await this.stageHook(stage, turnId);
      return current();
    };
    let issuedThisTurn: IssuedGrant | null = null;
    const revokeUncommitted = () => {
      if (issuedThisTurn) this.issuer.revoke([issuedThisTurn.grantId]);
    };
    const finish = (outcome: TurnOutcome): "committed" | "refused-by-ui" | "stale" => {
      if (!current()) {
        revokeUncommitted();
        return stale("commit");
      }
      if (!commit.accept()) {
        revokeUncommitted();
        return "refused-by-ui";
      }
      this.tickets.delete(turnId);
      commit.apply(outcome);
      return "committed";
    };

    // Stop/switch/preference change between admission and dispatch: no run.
    if (!current()) return stale("before-start");
    const registry = await this.registryPromise;
    if (!(await stageCheck("registry-ready"))) return stale("registry-ready");
    if (!registry) return finish({ ok: false, code: "registry-unavailable", message: failureMessage("registry-unavailable") });

    const messageSha = userEvent.textSha256!;
    if (!(await stageCheck("message-hashed"))) return stale("message-hashed");

    const fixture: FixtureCase | null = ticket.fixture;
    if (!(await stageCheck("fixture-resolved"))) return stale("fixture-resolved");

    // Restrictions were applied at admission; this reply uses current ones.
    const newRestrictions = new Set(record.restrictions);
    const tentativeRestrictions = [...newRestrictions];

    // --- grant issuance (service-owned) ------------------------------------
    const binding = {
      ownerId: record.ownerId,
      threadId: record.threadId,
      turnId,
      messageEventId: userEvent.eventId,
      messageSha256: messageSha,
      preferenceRevision: record.preferenceRevision,
      restrictionRevision: record.restrictionRevision,
    };
    let grant: IssuedGrant | null = null;
    let parent: IssuedGrant | null = null;
    if (fixture?.grantRequest) {
      grant = await this.issuer.issueOriginal(
        binding,
        fixture.grantRequest,
        // Scripture is never pinned while a current no-bible restriction holds.
        fixture.grantRequest === "passage" &&
          this.allowTestSources &&
          !newRestrictions.has("no-bible")
          ? this.passageSourceKeys
          : [],
        registry,
        this.allowTestSources,
      );
    } else if (fixture?.grantFollowUp) {
      const prevTurn = this.previousAnsweredUserTurn(record, userEvent);
      const parentId = prevTurn ? record.grantByTurn.get(prevTurn) : undefined;
      if (parentId) {
        const r = await this.issuer.issueFollowUp(
          binding,
          parentId,
          prevTurn,
          fixture.grantFollowUp,
          registry,
          this.allowTestSources,
        );
        if (r.ok) {
          grant = r.grant;
          parent = this.issuer.get(parentId) ?? null;
        } else {
          this.log("follow-up-grant-refused", record.threadId, turnId, r.failure);
        }
      } else {
        this.log("follow-up-without-parent", record.threadId, turnId);
      }
    }
    issuedThisTurn = grant;
    if (!(await stageCheck("grant-issued"))) {
      revokeUncommitted();
      return stale("grant-issued");
    }
    if (grant) {
      const v = await this.issuer.validate(grant, binding, registry, this.allowTestSources);
      if (!v.ok) {
        revokeUncommitted();
        return finish({ ok: false, code: `grant-${v.failure}`, message: failureMessage(`grant-${v.failure}`) });
      }
    }

    // --- shared sources: pinned bytes must equal registry bytes --------------
    const shared = record.events.filter((e) => e.role === "shared-source" && e.status === "delivered");
    for (const s of shared) {
      const r = resolveRegistrySource(registry, s.sourceKey, this.allowTestSources);
      if (!r.ok || r.value.excerpt.exactText !== s.text) {
        revokeUncommitted();
        return finish({ ok: false, code: "source-hash-mismatch", message: failureMessage("source-hash-mismatch") });
      }
    }

    // --- P1 boundary: client turn + server-owned context ---------------------
    const assembled = await assembleConversationContext({
      request: {
        contractVersion: CONVERSATION_CONTRACT_VERSION,
        turnId,
        threadId: record.threadId,
        message: userEvent.text,
        selectedExcerpts: [],
      },
      principal: {
        principalId: record.ownerId,
        principalVerified: true,
        threadOwnerId: record.ownerId,
        threadOwnerVerified: true,
        authorizedThreadId: record.threadId,
      },
      serverContext: {
        contractVersion: CONVERSATION_CONTRACT_VERSION,
        threadId: record.threadId,
        ownerId: record.ownerId,
        spiritualPreferenceOn: record.preferenceOn,
        restrictions: tentativeRestrictions,
        preferenceSource: "server",
      },
      registry,
      previewStore: new Map(),
      currentSourceRevisions: new Map(),
      serverGrant: grant ? toServerGrant(grant, parent) : null,
      selectedTeachingKeys: [...new Set(shared.map((s) => s.sourceKey!))],
      allowTestSources: this.allowTestSources,
    });
    if (!(await stageCheck("context-assembled"))) {
      revokeUncommitted();
      return stale("context-assembled");
    }
    if (!assembled.ok) {
      revokeUncommitted();
      return finish({ ok: false, code: assembled.code, message: failureMessage(assembled.code) });
    }

    // --- history: authorized active-thread delivered events only ------------
    const history: ProviderHistoryEntry[] = [];
    for (const e of record.events) {
      if (e === userEvent || e.status !== "delivered") continue;
      if (e.role === "assistant" && e.turnId) {
        const heard = this.voice.playedTextForTurn(e.turnId);
        history.push({
          eventId: e.eventId,
          role: "assistant",
          text: heard ? heard.text : e.text,
          unheardWithheld: heard ? heard.unheard : false,
        });
      } else {
        history.push({
          eventId: e.eventId,
          role: e.role,
          text: e.role === "shared-source" ? `[shared source ${e.sourceKey}]` : e.text,
          unheardWithheld: false,
        });
      }
    }
    const chars = history.reduce((n, h) => n + h.text.length, 0);
    if (history.length > this.maxHistoryEvents || chars > this.maxHistoryChars) {
      revokeUncommitted();
      return finish({ ok: false, code: "context-limit", message: failureMessage("context-limit") });
    }

    const effective: ProviderEffectiveItem[] = record.derived
      .filter((d) => d.status === "effective" && d.kind !== "active-restriction")
      .map((d) => ({
        itemId: d.itemId,
        kind: d.kind as ProviderEffectiveItem["kind"],
        text: d.text,
        sourceEventId: d.sourceEventId,
      }));

    const request: MockProviderRequest = deepFreezeDetached({
      requestId: this.nextId("req"),
      policyIdentity: CONVERSATION_POLICY_IDENTITY,
      policySha256: CONVERSATION_POLICY_BLOCK_SHA256,
      policyBody: CONVERSATION_POLICY_BLOCK,
      context: assembled.context,
      history,
      effective,
      historyComplete: !record.historyGap,
      revisions: { preference: record.preferenceRevision, restrictions: record.restrictionRevision },
      fixture: {
        caseId: fixture?.id ?? null,
        recallRequest: fixture?.recallRequest ?? false,
        mockInterpretation: fixture?.mockInterpretation ?? null,
        grantKind: grant?.kind ?? null,
      },
    });
    record.lastRequest = {
      requestId: request.requestId,
      turnId,
      policyIdentity: request.policyIdentity,
      policySha256: request.policySha256,
      historyEventIds: history.map((h) => h.eventId),
      effectiveItemIds: effective.map((e) => e.itemId),
      restrictions: [...assembled.context.restrictions],
      sourceKeys: assembled.context.sources.map((s) => s.excerpt.sourceKey),
      spiritualReason: assembled.context.spiritual.reason,
      grantId: grant?.grantId ?? null,
      historyComplete: request.historyComplete,
      preferenceRevision: record.preferenceRevision,
      restrictionRevision: record.restrictionRevision,
    };

    if (!(await stageCheck("before-dispatch"))) {
      revokeUncommitted();
      return stale("before-dispatch");
    }
    const controller = new AbortController();
    record.controllers.add(controller);
    this.log("provider-dispatched", record.threadId, turnId, request.requestId);
    let response: MockProviderResponse;
    try {
      response = await this.provider.generate(request, controller.signal);
    } catch {
      record.controllers.delete(controller);
      if (!current()) {
        revokeUncommitted();
        return stale("late-provider-error");
      }
      revokeUncommitted();
      return finish({ ok: false, code: "provider-error", message: failureMessage("provider-error") });
    }
    record.controllers.delete(controller);
    if (!(await stageCheck("provider-returned"))) {
      revokeUncommitted();
      return stale("late-provider-result");
    }

    // Returned source IDs must be a subset of the admitted snapshot.
    const admitted = new Map(assembled.context.sources.map((s) => [s.excerpt.sourceKey, s.card]));
    if (response.sourceIds.some((id) => !admitted.has(id))) {
      revokeUncommitted();
      return finish({ ok: false, code: "invalid-provider-sources", message: failureMessage("invalid-provider-sources") });
    }
    if (response.claims?.length) {
      // Operational claims are data: never executed, never confirmed.
      this.log("provider-claims-ignored", record.threadId, turnId, String(response.claims.length));
    }
    if (!(await stageCheck("before-commit"))) {
      revokeUncommitted();
      return stale("before-commit");
    }

    // --- prepare everything (no awaits after this point) ----------------------
    const outcome: TurnOutcome = {
      ok: true,
      turnId,
      text: response.text,
      sourceCards: [...new Set(response.sourceIds)].map((id) => admitted.get(id)!),
    };
    const assistantEvent: ThreadEvent = {
      eventId: this.nextId("evt"),
      messageId: `assistant-of-${userEvent.messageId}`,
      turnId,
      role: "assistant",
      text: response.text,
      textSha256: sha256HexSync(response.text),
      status: "delivered",
    };
    const interpretation: DerivedItem | null =
      response.interpretation &&
      fixture?.mockInterpretation &&
      response.interpretation.tag === fixture.mockInterpretation.tag
        ? {
            itemId: this.nextId("item"),
            kind: "ai-interpretation",
            tag: fixture.mockInterpretation.tag,
            text: fixture.mockInterpretation.text,
            sourceEventId: assistantEvent.eventId,
            evidenceSha256: sha256HexSync(fixture.mockInterpretation.text),
            origin: "mock-provider-fixture",
            fixtureCaseId: fixture.id,
            supersedesItemId: null,
            status: "effective",
            supersededByItemId: null,
          }
        : null;

    // --- single synchronous commit: validate, commit service, then publish ---
    if (!current()) {
      revokeUncommitted();
      return stale("commit");
    }
    if (!commit.accept()) {
      revokeUncommitted();
      return "refused-by-ui";
    }
    record.events.push(assistantEvent);
    if (interpretation) record.derived.push(interpretation);
    if (grant) record.grantByTurn.set(turnId, grant.grantId);
    this.tickets.delete(turnId);
    if (ticket.voiceOrigin) {
      this.queueVoiceAnswer(storeId, turnId, response.text, record.preferenceOn, ticket.voiceOrigin);
    }
    this.log("turn-committed", record.threadId, turnId, request.requestId);
    commit.apply(outcome);
    return "committed";
  }

  /** Called by the UI when a voice answer is spoken: queue segments. */
  /** Queue an accepted, committed answer for its exact turn and voice origin. */
  queueVoiceAnswer(
    storeId: string,
    turnId: string,
    text: string,
    devotional: boolean,
    origin: VoiceOrigin,
  ): boolean {
    const record = this.threads.get(storeId);
    if (!record || origin.threadId !== record.threadId) return false;
    const segments = text.match(/[^.!?]+[.!?]?/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
    return this.voice.queueAnswer(turnId, segments, devotional, origin);
  }

  /** Start a mock voice session owned by this thread (new identity each time). */
  startVoice(storeId: string): string | null {
    const record = this.threads.get(storeId);
    if (!record) return null;
    return this.voice.start(record.threadId);
  }

  private previousAnsweredUserTurn(record: ThreadRecord, current: ThreadEvent): string | null {
    const idx = record.events.indexOf(current);
    for (let i = idx - 1; i >= 0; i -= 1) {
      const e = record.events[i];
      if (e.role === "user" && e.status === "delivered" && e.turnId) return e.turnId;
    }
    return null;
  }

  private deriveForTurn(
    record: ThreadRecord,
    fixture: FixtureCase | null,
    userEvent: ThreadEvent,
    sha: string,
  ): DerivedItem[] {
    const derived = clone(record.derived);
    for (const d of fixture?.derivations ?? []) {
      const base = {
        itemId: this.nextId("item"),
        sourceEventId: userEvent.eventId,
        evidenceSha256: sha,
        origin: "fixture-resolver" as const,
        fixtureCaseId: fixture!.id,
        supersededByItemId: null,
      };
      if (d.kind === "restriction") {
        derived.push({ ...base, kind: "active-restriction", tag: d.add.join(","), text: d.add.join(", "), supersedesItemId: null, status: "effective" });
      } else if (d.kind === "user-correction") {
        const target = derived.find((x) => x.tag === d.supersedesTag && x.status === "effective");
        const item: DerivedItem = {
          ...base,
          kind: "user-correction",
          tag: d.tag,
          text: d.text,
          supersedesItemId: target ? target.itemId : null,
          status: target ? "effective" : "unanchored",
        };
        if (target) {
          target.status = "superseded";
          target.supersededByItemId = item.itemId;
        }
        derived.push(item);
      } else {
        derived.push({ ...base, kind: d.kind, tag: d.tag, text: d.text, supersedesItemId: null, status: "effective" });
      }
    }
    return derived;
  }

  // --- inspection ------------------------------------------------------------------

  inspect(storeId: string) {
    const record = this.threads.get(storeId);
    if (!record) return null;
    return {
      threadId: record.threadId,
      ownerFixture: record.ownerId,
      preferenceOn: record.preferenceOn,
      preferenceRevision: record.preferenceRevision,
      restrictions: [...record.restrictions],
      restrictionRevision: record.restrictionRevision,
      historyComplete: !record.historyGap,
      events: record.events.map((e) => ({ ...e })),
      derived: record.derived.map((d) => ({ ...d })),
      grants: this.issuer.forThread(record.threadId).map((g) => ({
        grantId: g.grantId,
        kind: g.kind,
        turnId: g.turnId,
        originalGrantId: g.originalGrantId,
        parentGrantId: g.parentGrantId,
        sources: g.sources.map((s) => s.sourceKey),
        revoked: this.issuer.isRevoked(g.grantId),
        committed: record.grantByTurn.get(g.turnId) === g.grantId,
      })),
      lastRequest: record.lastRequest,
      saved: record.saved
        ? { eventCount: record.saved.events.length, derivedCount: record.saved.derived.length }
        : null,
    };
  }

  /** Test/developer access to the issuer (forgery tests). */
  grantIssuer(): GrantIssuer {
    return this.issuer;
  }

  threadIdFor(storeId: string): string | null {
    return this.threads.get(storeId)?.threadId ?? null;
  }
}

export type ContextInspection = NonNullable<ReturnType<ConversationService["inspect"]>>;
