// Fictional normalized observations only. These IDs/booleans are not authority.
export const policy = (overrides = {}) => ({
  poolId: 'fictional-pool', version: 1, activeLimit: 1, totalUnitLimit: 8,
  unitsPerAttempt: 2, enabled: true, ...overrides,
});
export const claim = (label = 'a', overrides = {}) => ({
  claimId: `claim-${label}`, expiresAt: 1000,
  binding: { ownerId: 'owner-a', threadId: `thread-${label}`, threadIncarnation: `generation-${label}`,
    threadRevision: 0, attemptId: `attempt-${label}`, approvalId: `approval-${label}`,
    approvalDigest: 'a'.repeat(64), scope: 'developer-voice-session' },
  ...overrides,
});
export const reserve = (c, overrides = {}) => ({
  type: 'reserve', claim: c, policyVersion: 1, now: 10, freshEligibility: true, ...overrides,
});
export const mark = (c, overrides = {}) => ({
  type: 'mark-create', claim: c, operationId: `operation-${c.claimId}`, policyVersion: 1,
  now: 20, freshEligibility: true, ...overrides,
});
export const close = (c) => ({ type: 'close', claim: c });
export const observation = (c, kind, overrides = {}) => ({
  type: 'observe', claim: c, operationId: `operation-${c.claimId}`,
  evidenceId: `evidence-${c.claimId}-${kind}`, kind,
  sessionId: ['created', 'ended'].includes(kind) ? `session-${c.claimId}` : null,
  ...overrides,
});
export const occupied = (s) => Object.values(s.claims).filter((c) => c.slot === 'held').length;
