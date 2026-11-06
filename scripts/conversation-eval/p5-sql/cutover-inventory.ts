/**
 * Offline P5 v2 privilege candidate, version 1. No client, environment access,
 * network, CLI, grants, migration or runtime registration is performed here.
 * A catalog pass is not host/Auth, source-body, routing or quiescence acceptance.
 */
export type P5CutoverCategory =
  | "legacy-enable"
  | "legacy-terminal"
  | "legacy-read"
  | "trusted-policy-admin"
  | "v2"
  | "private-helper";

export interface P5CutoverFunction {
  readonly schema: string;
  readonly name: string;
  readonly arguments: string;
  readonly argumentNames: readonly string[];
  readonly result: string;
  readonly securityDefiner: boolean;
  readonly category: P5CutoverCategory;
  readonly serviceExecute: boolean;
  readonly source: string;
}

// Exact signatures from the frozen SQL drafts, not name-prefix grant rules.
// Legacy reads are retained ONLY for trusted reconciliation. Policy execution
// is retained ONLY for separately trusted administration, never participants.
export const P5_V2_CUTOVER_FUNCTIONS: readonly P5CutoverFunction[] = Object.freeze([
  Object.freeze({
    schema: "bfa_p5_voice",
    name: "ms",
    arguments: "",
    argumentNames: Object.freeze([]),
    result: "bigint",
    securityDefiner: false,
    category: "private-helper",
    serviceExecute: false,
    source: "p5-voice-admission.sql",
  }),
  Object.freeze({
    schema: "bfa_p5_voice",
    name: "n",
    arguments: "jsonb",
    argumentNames: Object.freeze(["p_value"]),
    result: "bigint",
    securityDefiner: false,
    category: "private-helper",
    serviceExecute: false,
    source: "p5-voice-admission.sql",
  }),
  Object.freeze({
    schema: "bfa_p5_voice",
    name: "id",
    arguments: "jsonb",
    argumentNames: Object.freeze(["p_value"]),
    result: "uuid",
    securityDefiner: false,
    category: "private-helper",
    serviceExecute: false,
    source: "p5-voice-admission.sql",
  }),
  Object.freeze({
    schema: "bfa_p5_voice",
    name: "exact_keys",
    arguments: "jsonb,text[]",
    argumentNames: Object.freeze(["p_value", "p_keys"]),
    result: "boolean",
    securityDefiner: false,
    category: "private-helper",
    serviceExecute: false,
    source: "p5-voice-admission.sql",
  }),
  Object.freeze({
    schema: "bfa_p5_voice",
    name: "parse_claim",
    arguments: "jsonb",
    argumentNames: Object.freeze(["p_claim"]),
    result: "bfa_p5_voice.claim_key",
    securityDefiner: false,
    category: "private-helper",
    serviceExecute: false,
    source: "p5-voice-admission.sql",
  }),
  Object.freeze({
    schema: "bfa_p5_voice",
    name: "lock_owner",
    arguments: "uuid",
    argumentNames: Object.freeze(["p_owner"]),
    result: "void",
    securityDefiner: false,
    category: "private-helper",
    serviceExecute: false,
    source: "p5-voice-admission.sql",
  }),
  Object.freeze({
    schema: "bfa_p5_voice",
    name: "observe_now",
    arguments: "uuid",
    argumentNames: Object.freeze(["p_owner"]),
    result: "bigint",
    securityDefiner: false,
    category: "private-helper",
    serviceExecute: false,
    source: "p5-voice-admission.sql",
  }),
  Object.freeze({
    schema: "bfa_p5_voice",
    name: "fence_expiry",
    arguments: "uuid,uuid,bigint",
    argumentNames: Object.freeze(["p_claim_id", "p_owner", "p_now"]),
    result: "void",
    securityDefiner: false,
    category: "private-helper",
    serviceExecute: false,
    source: "p5-voice-admission.sql",
  }),
  Object.freeze({
    schema: "bfa_p5_voice",
    name: "ack",
    arguments: "jsonb,text",
    argumentNames: Object.freeze(["p_claim", "p_state"]),
    result: "jsonb",
    securityDefiner: false,
    category: "private-helper",
    serviceExecute: false,
    source: "p5-voice-admission.sql",
  }),
  Object.freeze({
    schema: "bfa_p5_voice",
    name: "eligible",
    arguments: "bfa_p5_voice.proofs",
    argumentNames: Object.freeze(["p"]),
    result: "boolean",
    securityDefiner: false,
    category: "private-helper",
    serviceExecute: false,
    source: "p5-voice-admission.sql",
  }),
  Object.freeze({
    schema: "public",
    name: "bfa_p5_voice_register_generation",
    arguments: "uuid,uuid",
    argumentNames: Object.freeze(["p_owner", "p_thread"]),
    result: "uuid",
    securityDefiner: true,
    category: "legacy-enable",
    serviceExecute: false,
    source: "p5-voice-admission.sql",
  }),
  Object.freeze({
    schema: "public",
    name: "bfa_p5_voice_register_issuance",
    arguments: "uuid,uuid,uuid,bigint,text,bigint,bigint",
    argumentNames: Object.freeze([
      "p_owner",
      "p_thread",
      "p_incarnation",
      "p_revision",
      "p_fingerprint",
      "p_issued_ms",
      "p_expires_ms",
    ]),
    result: "boolean",
    securityDefiner: true,
    category: "legacy-enable",
    serviceExecute: false,
    source: "p5-voice-admission.sql",
  }),
  Object.freeze({
    schema: "public",
    name: "bfa_p5_voice_register_cleanup",
    arguments: "uuid,jsonb",
    argumentNames: Object.freeze(["p_cleanup_id", "p_claim"]),
    result: "jsonb",
    securityDefiner: true,
    category: "legacy-enable",
    serviceExecute: false,
    source: "p5-voice-admission.sql",
  }),
  Object.freeze({
    schema: "public",
    name: "bfa_p5_voice_register_proof",
    arguments: "jsonb",
    argumentNames: Object.freeze(["p_proof"]),
    result: "jsonb",
    securityDefiner: true,
    category: "legacy-enable",
    serviceExecute: false,
    source: "p5-voice-admission.sql",
  }),
  Object.freeze({
    schema: "bfa_p5_voice",
    name: "use_proof",
    arguments: "uuid,jsonb,text",
    argumentNames: Object.freeze(["p_receipt_id", "p_claim", "p_operation"]),
    result: "jsonb",
    securityDefiner: false,
    category: "private-helper",
    serviceExecute: false,
    source: "p5-voice-admission.sql",
  }),
  Object.freeze({
    schema: "public",
    name: "bfa_p5_voice_claim",
    arguments: "uuid,jsonb",
    argumentNames: Object.freeze(["p_receipt_id", "p_claim"]),
    result: "jsonb",
    securityDefiner: true,
    category: "legacy-enable",
    serviceExecute: false,
    source: "p5-voice-admission.sql",
  }),
  Object.freeze({
    schema: "public",
    name: "bfa_p5_voice_inspect",
    arguments: "uuid,jsonb",
    argumentNames: Object.freeze(["p_receipt_id", "p_claim"]),
    result: "jsonb",
    securityDefiner: true,
    category: "legacy-enable",
    serviceExecute: false,
    source: "p5-voice-admission.sql",
  }),
  Object.freeze({
    schema: "public",
    name: "bfa_p5_voice_close",
    arguments: "uuid,jsonb",
    argumentNames: Object.freeze(["p_cleanup_id", "p_claim"]),
    result: "jsonb",
    securityDefiner: true,
    category: "legacy-terminal",
    serviceExecute: true,
    source: "p5-voice-admission.sql",
  }),
  Object.freeze({
    schema: "bfa_p5_capacity",
    name: "retire_if_fenced",
    arguments: "jsonb",
    argumentNames: Object.freeze(["p_claim"]),
    result: "void",
    securityDefiner: false,
    category: "private-helper",
    serviceExecute: false,
    source: "p5-voice-capacity.sql",
  }),
  Object.freeze({
    schema: "bfa_p5_capacity",
    name: "current",
    arguments: "bfa_p5_voice.proofs",
    argumentNames: Object.freeze(["p"]),
    result: "boolean",
    securityDefiner: false,
    category: "private-helper",
    serviceExecute: false,
    source: "p5-voice-capacity.sql",
  }),
  Object.freeze({
    schema: "bfa_p5_capacity",
    name: "take_proof",
    arguments: "uuid,jsonb,text",
    argumentNames: Object.freeze(["p_receipt_id", "p_claim", "p_operation"]),
    result: "bfa_p5_voice.proofs",
    securityDefiner: false,
    category: "private-helper",
    serviceExecute: false,
    source: "p5-voice-capacity.sql",
  }),
  Object.freeze({
    schema: "bfa_p5_capacity",
    name: "denied",
    arguments: "jsonb",
    argumentNames: Object.freeze(["p_claim"]),
    result: "jsonb",
    securityDefiner: false,
    category: "private-helper",
    serviceExecute: false,
    source: "p5-voice-capacity.sql",
  }),
  Object.freeze({
    schema: "public",
    name: "bfa_p5_capacity_claim",
    arguments: "uuid,jsonb",
    argumentNames: Object.freeze(["p_receipt_id", "p_claim"]),
    result: "jsonb",
    securityDefiner: true,
    category: "legacy-enable",
    serviceExecute: false,
    source: "p5-voice-capacity.sql",
  }),
  Object.freeze({
    schema: "public",
    name: "bfa_p5_capacity_mark",
    arguments: "uuid,jsonb,uuid,bigint",
    argumentNames: Object.freeze([
      "p_receipt_id",
      "p_claim",
      "p_operation_id",
      "p_expected_version",
    ]),
    result: "jsonb",
    securityDefiner: true,
    category: "legacy-enable",
    serviceExecute: false,
    source: "p5-voice-capacity.sql",
  }),
  Object.freeze({
    schema: "public",
    name: "bfa_p5_capacity_close",
    arguments: "uuid,jsonb",
    argumentNames: Object.freeze(["p_cleanup_id", "p_claim"]),
    result: "jsonb",
    securityDefiner: true,
    category: "legacy-terminal",
    serviceExecute: true,
    source: "p5-voice-capacity.sql",
  }),
  Object.freeze({
    schema: "bfa_p5_capacity",
    name: "conflict",
    arguments: "uuid,uuid,jsonb,text",
    argumentNames: Object.freeze(["p_pool", "p_evidence", "p_observation", "p_reason"]),
    result: "void",
    securityDefiner: false,
    category: "private-helper",
    serviceExecute: false,
    source: "p5-voice-capacity.sql",
  }),
  Object.freeze({
    schema: "public",
    name: "bfa_p5_capacity_reconcile",
    arguments: "uuid,jsonb,jsonb",
    argumentNames: Object.freeze(["p_cleanup_id", "p_claim", "p_observation"]),
    result: "jsonb",
    securityDefiner: true,
    category: "legacy-terminal",
    serviceExecute: true,
    source: "p5-voice-capacity.sql",
  }),
  Object.freeze({
    schema: "public",
    name: "bfa_p5_capacity_policy",
    arguments: "uuid,bigint,bigint,bigint,boolean",
    argumentNames: Object.freeze([
      "p_pool_id",
      "p_expected_version",
      "p_active_limit",
      "p_unit_limit",
      "p_enabled",
    ]),
    result: "boolean",
    securityDefiner: true,
    category: "trusted-policy-admin",
    serviceExecute: true,
    source: "p5-voice-capacity.sql",
  }),
  Object.freeze({
    schema: "public",
    name: "bfa_p5_voice_read_current_thread",
    arguments: "uuid,uuid",
    argumentNames: Object.freeze(["p_owner_id", "p_thread_id"]),
    result: "jsonb",
    securityDefiner: true,
    category: "legacy-read",
    serviceExecute: true,
    source: "p5-voice-preissue-read.sql",
  }),
  Object.freeze({
    schema: "public",
    name: "bfa_p5_voice_read_session_fence",
    arguments: "uuid,uuid",
    argumentNames: Object.freeze(["p_owner_id", "p_session_id"]),
    result: "jsonb",
    securityDefiner: true,
    category: "legacy-read",
    serviceExecute: true,
    source: "p5-voice-reads.sql",
  }),
  Object.freeze({
    schema: "public",
    name: "bfa_p5_voice_read_current",
    arguments: "uuid,uuid,uuid,text",
    argumentNames: Object.freeze([
      "p_owner_id",
      "p_thread_id",
      "p_attempt_id",
      "p_authority_fingerprint",
    ]),
    result: "jsonb",
    securityDefiner: true,
    category: "legacy-read",
    serviceExecute: true,
    source: "p5-voice-reads.sql",
  }),
  Object.freeze({
    schema: "public",
    name: "bfa_p5_voice_provision_session",
    arguments: "uuid,uuid,bigint,bigint",
    argumentNames: Object.freeze(["p_owner_id", "p_session_id", "p_verified_ms", "p_expires_ms"]),
    result: "jsonb",
    securityDefiner: true,
    category: "legacy-enable",
    serviceExecute: false,
    source: "p5-voice-session-provision.sql",
  }),
  Object.freeze({
    schema: "public",
    name: "bfa_p5_voice_revoke_session",
    arguments: "uuid,uuid",
    argumentNames: Object.freeze(["p_owner_id", "p_session_id"]),
    result: "jsonb",
    securityDefiner: true,
    category: "legacy-terminal",
    serviceExecute: true,
    source: "p5-voice-session-revoke.sql",
  }),
  Object.freeze({
    schema: "bfa_p5_voice_v2",
    name: "parse_capacity_proof",
    arguments: "jsonb,text",
    argumentNames: Object.freeze(["p_proof", "p_operation"]),
    result: "bfa_p5_voice.proofs",
    securityDefiner: false,
    category: "private-helper",
    serviceExecute: false,
    source: "p5-voice-v2-capacity.sql",
  }),
  Object.freeze({
    schema: "bfa_p5_voice_v2",
    name: "capacity_ack",
    arguments: "jsonb,text",
    argumentNames: Object.freeze(["p_proof", "p_status"]),
    result: "jsonb",
    securityDefiner: false,
    category: "private-helper",
    serviceExecute: false,
    source: "p5-voice-v2-capacity.sql",
  }),
  Object.freeze({
    schema: "bfa_p5_voice_v2",
    name: "take_proof",
    arguments: "bfa_p5_voice.proofs",
    argumentNames: Object.freeze(["candidate"]),
    result: "bfa_p5_voice.proofs",
    securityDefiner: false,
    category: "private-helper",
    serviceExecute: false,
    source: "p5-voice-v2-capacity.sql",
  }),
  Object.freeze({
    schema: "bfa_p5_voice_v2",
    name: "current",
    arguments: "bfa_p5_voice.proofs",
    argumentNames: Object.freeze(["p"]),
    result: "boolean",
    securityDefiner: false,
    category: "private-helper",
    serviceExecute: false,
    source: "p5-voice-v2-capacity.sql",
  }),
  Object.freeze({
    schema: "bfa_p5_voice_v2",
    name: "retire_if_fenced",
    arguments: "bfa_p5_voice.proofs",
    argumentNames: Object.freeze(["p"]),
    result: "void",
    securityDefiner: false,
    category: "private-helper",
    serviceExecute: false,
    source: "p5-voice-v2-capacity.sql",
  }),
  Object.freeze({
    schema: "bfa_p5_voice_v2",
    name: "capacity_denied",
    arguments: "jsonb,bfa_p5_voice.proofs",
    argumentNames: Object.freeze(["p_proof", "p"]),
    result: "jsonb",
    securityDefiner: false,
    category: "private-helper",
    serviceExecute: false,
    source: "p5-voice-v2-capacity.sql",
  }),
  Object.freeze({
    schema: "bfa_p5_voice_v2",
    name: "capacity_admit",
    arguments: "jsonb,text",
    argumentNames: Object.freeze(["p_proof", "p_operation"]),
    result: "jsonb",
    securityDefiner: false,
    category: "private-helper",
    serviceExecute: false,
    source: "p5-voice-v2-capacity.sql",
  }),
  Object.freeze({
    schema: "public",
    name: "bfa_p5_v2_capacity_claim",
    arguments: "jsonb",
    argumentNames: Object.freeze(["p_proof"]),
    result: "jsonb",
    securityDefiner: true,
    category: "v2",
    serviceExecute: true,
    source: "p5-voice-v2-capacity.sql",
  }),
  Object.freeze({
    schema: "public",
    name: "bfa_p5_v2_voice_inspect",
    arguments: "jsonb",
    argumentNames: Object.freeze(["p_proof"]),
    result: "jsonb",
    securityDefiner: true,
    category: "v2",
    serviceExecute: true,
    source: "p5-voice-v2-capacity.sql",
  }),
  Object.freeze({
    schema: "bfa_p5_voice_v2",
    name: "cleanup_observation",
    arguments: "bfa_p5_voice.cleanup_owners",
    argumentNames: Object.freeze(["k"]),
    result: "jsonb",
    securityDefiner: false,
    category: "private-helper",
    serviceExecute: false,
    source: "p5-voice-v2-cleanup.sql",
  }),
  Object.freeze({
    schema: "public",
    name: "bfa_p5_v2_register_cleanup",
    arguments: "uuid,jsonb,uuid,bigint,text,bigint,bigint",
    argumentNames: Object.freeze([
      "p_cleanup_id",
      "p_claim",
      "p_auth_session_id",
      "p_parent_version",
      "p_fingerprint",
      "p_verified_ms",
      "p_auth_expires_ms",
    ]),
    result: "jsonb",
    securityDefiner: true,
    category: "v2",
    serviceExecute: true,
    source: "p5-voice-v2-cleanup.sql",
  }),
  Object.freeze({
    schema: "public",
    name: "bfa_p5_v2_read_cleanup",
    arguments: "uuid,jsonb,uuid,bigint,text",
    argumentNames: Object.freeze([
      "p_cleanup_id",
      "p_claim",
      "p_auth_session_id",
      "p_parent_version",
      "p_fingerprint",
    ]),
    result: "jsonb",
    securityDefiner: true,
    category: "v2",
    serviceExecute: true,
    source: "p5-voice-v2-cleanup.sql",
  }),
  Object.freeze({
    schema: "public",
    name: "bfa_p5_v2_read_current",
    arguments: "jsonb",
    argumentNames: Object.freeze(["p_request"]),
    result: "jsonb",
    securityDefiner: true,
    category: "v2",
    serviceExecute: true,
    source: "p5-voice-v2-current.sql",
  }),
  Object.freeze({
    schema: "bfa_p5_voice_v2",
    name: "mark_ack",
    arguments: "jsonb,text",
    argumentNames: Object.freeze(["p_request", "p_status"]),
    result: "jsonb",
    securityDefiner: false,
    category: "private-helper",
    serviceExecute: false,
    source: "p5-voice-v2-mark.sql",
  }),
  Object.freeze({
    schema: "bfa_p5_voice_v2",
    name: "mark_denied",
    arguments: "jsonb,bfa_p5_voice.proofs",
    argumentNames: Object.freeze(["p_request", "p"]),
    result: "jsonb",
    securityDefiner: false,
    category: "private-helper",
    serviceExecute: false,
    source: "p5-voice-v2-mark.sql",
  }),
  Object.freeze({
    schema: "public",
    name: "bfa_p5_v2_capacity_mark",
    arguments: "jsonb",
    argumentNames: Object.freeze(["p_request"]),
    result: "jsonb",
    securityDefiner: true,
    category: "v2",
    serviceExecute: true,
    source: "p5-voice-v2-mark.sql",
  }),
  Object.freeze({
    schema: "bfa_p5_voice_v2",
    name: "parent_observation",
    arguments: "bfa_p5_voice_v2.auth_parents",
    argumentNames: Object.freeze(["p"]),
    result: "jsonb",
    securityDefiner: false,
    category: "private-helper",
    serviceExecute: false,
    source: "p5-voice-v2-parent-issuance.sql",
  }),
  Object.freeze({
    schema: "bfa_p5_voice_v2",
    name: "issuance_observation",
    arguments: "bfa_p5_voice.issuances,bfa_p5_voice_v2.issuance_auth_bindings",
    argumentNames: Object.freeze(["i", "b"]),
    result: "jsonb",
    securityDefiner: false,
    category: "private-helper",
    serviceExecute: false,
    source: "p5-voice-v2-parent-issuance.sql",
  }),
  Object.freeze({
    schema: "public",
    name: "bfa_p5_v2_observe_parent",
    arguments: "uuid,uuid,bigint,bigint",
    argumentNames: Object.freeze([
      "p_owner_id",
      "p_auth_session_id",
      "p_verified_ms",
      "p_auth_expires_ms",
    ]),
    result: "jsonb",
    securityDefiner: true,
    category: "v2",
    serviceExecute: true,
    source: "p5-voice-v2-parent-issuance.sql",
  }),
  Object.freeze({
    schema: "public",
    name: "bfa_p5_v2_revoke_parent",
    arguments: "uuid,uuid",
    argumentNames: Object.freeze(["p_owner_id", "p_auth_session_id"]),
    result: "jsonb",
    securityDefiner: true,
    category: "v2",
    serviceExecute: true,
    source: "p5-voice-v2-parent-issuance.sql",
  }),
  Object.freeze({
    schema: "public",
    name: "bfa_p5_v2_read_parent",
    arguments: "uuid,uuid",
    argumentNames: Object.freeze(["p_owner_id", "p_auth_session_id"]),
    result: "jsonb",
    securityDefiner: true,
    category: "v2",
    serviceExecute: true,
    source: "p5-voice-v2-parent-issuance.sql",
  }),
  Object.freeze({
    schema: "public",
    name: "bfa_p5_v2_register_issuance",
    arguments: "uuid,uuid,bigint,uuid,uuid,bigint,text,bigint,bigint,bigint,bigint",
    argumentNames: Object.freeze([
      "p_owner_id",
      "p_auth_session_id",
      "p_parent_version",
      "p_thread_id",
      "p_incarnation",
      "p_revision",
      "p_fingerprint",
      "p_verified_ms",
      "p_auth_expires_ms",
      "p_issued_ms",
      "p_expires_ms",
    ]),
    result: "jsonb",
    securityDefiner: true,
    category: "v2",
    serviceExecute: true,
    source: "p5-voice-v2-parent-issuance.sql",
  }),
  Object.freeze({
    schema: "public",
    name: "bfa_p5_v2_read_issuance",
    arguments: "uuid,uuid,bigint,text",
    argumentNames: Object.freeze([
      "p_owner_id",
      "p_auth_session_id",
      "p_parent_version",
      "p_fingerprint",
    ]),
    result: "jsonb",
    securityDefiner: true,
    category: "v2",
    serviceExecute: true,
    source: "p5-voice-v2-parent-issuance.sql",
  }),
  Object.freeze({
    schema: "public",
    name: "bfa_p5_v2_read_current_thread",
    arguments: "uuid,uuid,bigint,uuid,bigint,bigint",
    argumentNames: Object.freeze([
      "p_owner_id",
      "p_auth_session_id",
      "p_parent_version",
      "p_thread_id",
      "p_verified_ms",
      "p_auth_expires_ms",
    ]),
    result: "jsonb",
    securityDefiner: true,
    category: "v2",
    serviceExecute: true,
    source: "p5-voice-v2-preissue.sql",
  }),
  Object.freeze({
    schema: "public",
    name: "bfa_p5_v2_register_generation",
    arguments: "uuid,uuid,bigint,uuid,bigint,text,bigint,bigint",
    argumentNames: Object.freeze([
      "p_owner_id",
      "p_auth_session_id",
      "p_parent_version",
      "p_thread_id",
      "p_revision",
      "p_source_created_at",
      "p_verified_ms",
      "p_auth_expires_ms",
    ]),
    result: "jsonb",
    securityDefiner: true,
    category: "v2",
    serviceExecute: true,
    source: "p5-voice-v2-preissue.sql",
  }),
  Object.freeze({
    schema: "bfa_p5_voice_v2",
    name: "eligible",
    arguments: "bfa_p5_voice.proofs",
    argumentNames: Object.freeze(["p"]),
    result: "boolean",
    securityDefiner: false,
    category: "private-helper",
    serviceExecute: false,
    source: "p5-voice-v2-proof.sql",
  }),
  Object.freeze({
    schema: "public",
    name: "bfa_p5_v2_register_proof",
    arguments: "jsonb",
    argumentNames: Object.freeze(["p_proof"]),
    result: "jsonb",
    securityDefiner: true,
    category: "v2",
    serviceExecute: true,
    source: "p5-voice-v2-proof.sql",
  }),
]);

/**
 * SELECT only. The caller may execute this in an already-owned disposable
 * database; this module does not obtain a connection. The one row's `catalog`
 * is the evaluator input. PUBLIC default EXECUTE and inherited role execution
 * are inspected separately. All private functions and public P5 overloads are
 * included, including signatures absent from the manifest.
 */
export const P5_V2_CUTOVER_CATALOG_SQL = String.raw`
WITH app_roles(name) AS (
  VALUES ('anon'), ('authenticated'), ('service_role')
), schema_names(name) AS (
  VALUES ('public'), ('bfa_p5_voice'), ('bfa_p5_capacity'), ('bfa_p5_voice_v2')
), scoped_functions AS (
  SELECT p.*, n.nspname AS schema_name
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE (n.nspname='public' AND pg_catalog.left(p.proname::text,7)='bfa_p5_')
    OR n.nspname IN ('bfa_p5_voice','bfa_p5_capacity','bfa_p5_voice_v2')
), protected_owners AS (
  SELECT proowner AS owner_oid FROM scoped_functions
  UNION
  SELECT n.nspowner FROM pg_catalog.pg_namespace n
    WHERE n.nspname IN ('bfa_p5_voice','bfa_p5_capacity','bfa_p5_voice_v2')
), function_rows AS (
  SELECT p.schema_name,p.proname,
    pg_catalog.jsonb_build_object(
      'schema',p.schema_name,'name',p.proname,'kind',p.prokind,
      'returnsSet',p.proretset,'argumentNames',COALESCE(p.proargnames,ARRAY[]::text[]),
      'argumentModes',p.proargmodes,'defaultArguments',p.pronargdefaults,'variadic',p.provariadic<>0,
      'arguments',COALESCE((SELECT pg_catalog.string_agg(
        CASE WHEN tn.nspname='pg_catalog' THEN pg_catalog.format_type(t.oid,NULL)
        ELSE pg_catalog.quote_ident(tn.nspname)||'.'||pg_catalog.quote_ident(t.typname) END,
        ',' ORDER BY arg.ordinality)
        FROM pg_catalog.unnest(p.proargtypes) WITH ORDINALITY arg(type_oid,ordinality)
        JOIN pg_catalog.pg_type t ON t.oid=arg.type_oid
        JOIN pg_catalog.pg_namespace tn ON tn.oid=t.typnamespace),''),
      'result',CASE WHEN rn.nspname='pg_catalog' THEN pg_catalog.format_type(rt.oid,NULL)
        ELSE pg_catalog.quote_ident(rn.nspname)||'.'||pg_catalog.quote_ident(rt.typname) END,
      'securityDefiner',p.prosecdef,'config',p.proconfig,
      'owner',pg_catalog.pg_get_userbyid(p.proowner),
      'unexpectedExecuteGrantees',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.pg_get_userbyid(a.grantee) ORDER BY a.grantee),'[]'::jsonb)
        FROM pg_catalog.aclexplode(COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
        WHERE a.privilege_type='EXECUTE' AND a.grantee<>0 AND a.grantee<>p.proowner
        AND a.grantee IS DISTINCT FROM (SELECT r.oid FROM pg_catalog.pg_roles r WHERE r.rolname='service_role')),
      'serviceGrantOption',EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
        WHERE a.privilege_type='EXECUTE' AND a.is_grantable AND a.grantee=(SELECT r.oid FROM pg_catalog.pg_roles r WHERE r.rolname='service_role')),
      'publicExecute',EXISTS (SELECT 1 FROM pg_catalog.aclexplode(
        COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
        WHERE a.grantee=0 AND a.privilege_type='EXECUTE'),
      'anonExecute',(SELECT pg_catalog.has_function_privilege(r.oid,p.oid,'EXECUTE')
        FROM pg_catalog.pg_roles r WHERE r.rolname='anon'),
      'authenticatedExecute',(SELECT pg_catalog.has_function_privilege(r.oid,p.oid,'EXECUTE')
        FROM pg_catalog.pg_roles r WHERE r.rolname='authenticated'),
      'serviceExecute',(SELECT pg_catalog.has_function_privilege(r.oid,p.oid,'EXECUTE')
        FROM pg_catalog.pg_roles r WHERE r.rolname='service_role')
    ) AS value
  FROM scoped_functions p
  JOIN pg_catalog.pg_type rt ON rt.oid=p.prorettype
  JOIN pg_catalog.pg_namespace rn ON rn.oid=rt.typnamespace
), schema_rows AS (
  SELECT sn.name,pg_catalog.jsonb_build_object(
    'name',sn.name,'owner',pg_catalog.pg_get_userbyid(n.nspowner),
    'publicUsage',EXISTS (SELECT 1 FROM pg_catalog.aclexplode(
      COALESCE(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a
      WHERE a.grantee=0 AND a.privilege_type='USAGE'),
    'publicCreate',EXISTS (SELECT 1 FROM pg_catalog.aclexplode(
      COALESCE(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a
      WHERE a.grantee=0 AND a.privilege_type='CREATE'),
    'anonUsage',(SELECT pg_catalog.has_schema_privilege(r.oid,n.oid,'USAGE') FROM pg_catalog.pg_roles r WHERE r.rolname='anon'),
    'anonCreate',(SELECT pg_catalog.has_schema_privilege(r.oid,n.oid,'CREATE') FROM pg_catalog.pg_roles r WHERE r.rolname='anon'),
    'authenticatedUsage',(SELECT pg_catalog.has_schema_privilege(r.oid,n.oid,'USAGE') FROM pg_catalog.pg_roles r WHERE r.rolname='authenticated'),
    'authenticatedCreate',(SELECT pg_catalog.has_schema_privilege(r.oid,n.oid,'CREATE') FROM pg_catalog.pg_roles r WHERE r.rolname='authenticated'),
    'serviceUsage',(SELECT pg_catalog.has_schema_privilege(r.oid,n.oid,'USAGE') FROM pg_catalog.pg_roles r WHERE r.rolname='service_role'),
    'serviceCreate',(SELECT pg_catalog.has_schema_privilege(r.oid,n.oid,'CREATE') FROM pg_catalog.pg_roles r WHERE r.rolname='service_role')
  ) AS value
  FROM schema_names sn LEFT JOIN pg_catalog.pg_namespace n ON n.nspname=sn.name
), role_rows AS (
  SELECT ar.name,pg_catalog.jsonb_build_object(
    'name',ar.name,'superuser',r.rolsuper,'createRole',r.rolcreaterole,
    'otherMember',CASE WHEN r.oid IS NULL THEN NULL ELSE EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles target WHERE target.oid<>r.oid
        AND pg_catalog.pg_has_role(r.oid,target.oid,'MEMBER')
    ) END,
    'ownerMember',CASE WHEN r.oid IS NULL THEN NULL ELSE EXISTS (
      SELECT 1 FROM protected_owners o WHERE pg_catalog.pg_has_role(r.oid,o.owner_oid,'MEMBER')
    ) END
  ) AS value
  FROM app_roles ar LEFT JOIN pg_catalog.pg_roles r ON r.rolname=ar.name
)
SELECT pg_catalog.jsonb_build_object(
  'functions',(SELECT COALESCE(pg_catalog.jsonb_agg(value ORDER BY schema_name,proname,value->>'arguments'),'[]'::jsonb) FROM function_rows),
  'schemas',(SELECT pg_catalog.jsonb_agg(value ORDER BY name) FROM schema_rows),
  'roles',(SELECT pg_catalog.jsonb_agg(value ORDER BY name) FROM role_rows)
) AS catalog
`;

export interface P5CutoverIssue {
  readonly code: string;
  readonly subject: string;
}
export interface P5CutoverReport {
  readonly inventoryVersion: 1;
  readonly catalogStatus: "pass" | "fail";
  readonly deployable: false;
  readonly issues: readonly P5CutoverIssue[];
  readonly limitations: readonly string[];
}

const LIMITATIONS = Object.freeze([
  "Offline candidate only; caller-supplied catalog data does not establish database provenance.",
  "Catalog privileges do not authenticate function bodies, routes, deployed source or trusted administration.",
  "Actual host/Auth ownership, effective policy and synchronous revocation remain unverified.",
  "Quiescence and drain of already-running legacy enabling transactions remain unverified.",
  "Native concurrency, real Auth, provider and device acceptance remain unrun; no activation permission.",
]);
const SCHEMAS = ["public", "bfa_p5_voice", "bfa_p5_capacity", "bfa_p5_voice_v2"];
const ROLES = ["anon", "authenticated", "service_role"];

function ownRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const names = Reflect.ownKeys(descriptors);
  if (
    names.length !== keys.length ||
    names.some((key) => typeof key !== "string" || !keys.includes(key))
  )
    return null;
  if (keys.some((key) => !Object.hasOwn(descriptors[key], "value"))) return null;
  return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.length <= 512;
}
function signature(value: Pick<P5CutoverFunction, "schema" | "name" | "arguments">): string {
  return `${value.schema}.${value.name}(${value.arguments})`;
}

/**
 * Read-only evaluation with an explicit, externally reviewed function/schema
 * owner. There is deliberately no "postgres" or service-role owner default.
 * A pass means only that this catalog snapshot matches this offline candidate.
 */
export function evaluateP5V2CutoverCatalog(
  catalog: unknown,
  options: { readonly trustedOwnerRole: string },
): P5CutoverReport {
  const issues: P5CutoverIssue[] = [];
  const issue = (code: string, subject: string) => issues.push(Object.freeze({ code, subject }));
  try {
    const config = ownRecord(options, ["trustedOwnerRole"]);
    if (
      !config ||
      !text(config.trustedOwnerRole) ||
      !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(config.trustedOwnerRole) ||
      ROLES.includes(config.trustedOwnerRole)
    ) {
      issue("invalid-trusted-owner", "options");
    } else {
      const root = ownRecord(catalog, ["functions", "schemas", "roles"]);
      if (
        !root ||
        !Array.isArray(root.functions) ||
        !Array.isArray(root.schemas) ||
        !Array.isArray(root.roles) ||
        root.functions.length > 512 ||
        root.schemas.length > 32 ||
        root.roles.length > 32
      ) {
        issue("malformed-catalog", "catalog");
      } else {
        const expected = new Map(P5_V2_CUTOVER_FUNCTIONS.map((entry) => [signature(entry), entry]));
        const seen = new Set<string>();
        for (const [index, candidate] of root.functions.entries()) {
          const row = ownRecord(candidate, [
            "schema",
            "name",
            "arguments",
            "result",
            "kind",
            "returnsSet",
            "argumentNames",
            "argumentModes",
            "defaultArguments",
            "variadic",
            "unexpectedExecuteGrantees",
            "serviceGrantOption",
            "securityDefiner",
            "config",
            "owner",
            "publicExecute",
            "anonExecute",
            "authenticatedExecute",
            "serviceExecute",
          ]);
          if (
            !row ||
            !["schema", "name", "arguments", "result", "kind", "owner"].every((key) =>
              text(row[key]),
            ) ||
            ![
              "securityDefiner",
              "returnsSet",
              "variadic",
              "serviceGrantOption",
              "publicExecute",
              "anonExecute",
              "authenticatedExecute",
              "serviceExecute",
            ].every((key) => typeof row[key] === "boolean")
          ) {
            issue("malformed-function", `function[${index}]`);
            continue;
          }
          const key = `${row.schema}.${row.name}(${row.arguments})`;
          const entry = expected.get(key);
          if (!entry) {
            issue("unexpected-function", key);
            continue;
          }
          if (seen.has(key)) issue("duplicate-function", key);
          seen.add(key);
          if (
            row.kind !== "f" ||
            row.result !== entry.result ||
            row.returnsSet !== false ||
            row.variadic !== false ||
            row.defaultArguments !== 0 ||
            row.argumentModes !== null ||
            !Array.isArray(row.argumentNames) ||
            row.argumentNames.length !== entry.argumentNames.length ||
            row.argumentNames.some((name, index) => name !== entry.argumentNames[index])
          )
            issue("function-shape", key);
          if (
            !Array.isArray(row.unexpectedExecuteGrantees) ||
            row.unexpectedExecuteGrantees.length !== 0
          )
            issue("unexpected-execute-grantee", key);
          if (row.serviceGrantOption !== false) issue("service-grant-option", key);
          if (row.securityDefiner !== entry.securityDefiner) issue("function-security", key);
          if (row.owner !== config.trustedOwnerRole) issue("function-owner", key);
          if (
            !Array.isArray(row.config) ||
            row.config.length !== 1 ||
            typeof row.config[0] !== "string" ||
            row.config[0].replace(/\s/g, "") !== "search_path=pg_catalog,pg_temp"
          )
            issue("function-search-path", key);
          if (row.publicExecute !== false) issue("public-execute", key);
          if (row.anonExecute !== false) issue("anon-execute", key);
          if (row.authenticatedExecute !== false) issue("authenticated-execute", key);
          if (row.serviceExecute !== entry.serviceExecute) issue("service-execute", key);
        }
        for (const key of expected.keys()) if (!seen.has(key)) issue("missing-function", key);
        const seenSchemas = new Set<string>();
        for (const [index, candidate] of root.schemas.entries()) {
          const privileges = [
            "publicUsage",
            "publicCreate",
            "anonUsage",
            "anonCreate",
            "authenticatedUsage",
            "authenticatedCreate",
            "serviceUsage",
            "serviceCreate",
          ];
          const row = ownRecord(candidate, ["name", "owner", ...privileges]);
          if (
            !row ||
            !text(row.name) ||
            !text(row.owner) ||
            !privileges.every((key) => typeof row[key] === "boolean")
          ) {
            issue("malformed-schema", `schema[${index}]`);
            continue;
          }
          if (!SCHEMAS.includes(row.name)) {
            issue("unexpected-schema", row.name);
            continue;
          }
          if (seenSchemas.has(row.name)) issue("duplicate-schema", row.name);
          seenSchemas.add(row.name);
          if (row.name !== "public" && row.owner !== config.trustedOwnerRole)
            issue("schema-owner", row.name);
          for (const key of privileges) {
            const wanted = row.name === "public" && key.endsWith("Usage");
            if (row[key] !== wanted) issue("schema-privilege", `${row.name}.${key}`);
          }
        }
        for (const name of SCHEMAS) if (!seenSchemas.has(name)) issue("missing-schema", name);
        const seenRoles = new Set<string>();
        for (const [index, candidate] of root.roles.entries()) {
          const row = ownRecord(candidate, [
            "name",
            "superuser",
            "createRole",
            "ownerMember",
            "otherMember",
          ]);
          if (
            !row ||
            !text(row.name) ||
            !["superuser", "createRole", "ownerMember", "otherMember"].every(
              (key) => typeof row[key] === "boolean",
            )
          ) {
            issue("malformed-role", `role[${index}]`);
            continue;
          }
          if (!ROLES.includes(row.name)) {
            issue("unexpected-role", row.name);
            continue;
          }
          if (seenRoles.has(row.name)) issue("duplicate-role", row.name);
          seenRoles.add(row.name);
          if (row.superuser || row.createRole || row.ownerMember || row.otherMember)
            issue("unsafe-role", row.name);
        }
        for (const name of ROLES) if (!seenRoles.has(name)) issue("missing-role", name);
      }
    }
  } catch {
    issue("unreadable-catalog", "catalog-or-options");
  }
  return Object.freeze({
    inventoryVersion: 1,
    catalogStatus: issues.length === 0 ? "pass" : "fail",
    deployable: false,
    issues: Object.freeze(issues),
    limitations: LIMITATIONS,
  });
}
