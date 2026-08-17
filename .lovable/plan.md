# Functional and Business-Model Audit — Beauty from Ashes: The First Journey

No code changes are proposed in this document. It is an assessment plus a prioritised list you can approve, reject, or defer item by item.

## What exists today (verified in the source)

- Ten-day First Journey with distinct content per day, routed practices, deterministic personalised reflection, prior-days gathering on Day 10.
- Front door: splash, welcome, what you'll find, how it works, one-time agreement, Journey Home.
- Supporting surfaces: standalone practices, resources, Support & Safety, contact-support, Settings, Privacy, Terms, Important Information.
- One legacy weekly-session surface (`session.week-01`) still in the tree.
- Local-only persistence, versioned store with an answer-meaning firewall.
- No accounts, no database, no analytics, no payments code of any kind (confirmed: no Stripe/Paddle/checkout/pricing references anywhere in `src`).
- AI reflection is present but dormant/fail-closed.

## Functional audit — how it compares to successful comparables

**Where the app is already at or above market standard**
- Depth and clinical care of daily content exceeds Calm/Hallow-tier daily devotionals.
- Personalised end-of-day response is a genuine differentiator; most journalling apps only echo prompts back.
- Privacy posture (device-only, no accounts) is stronger than every comparable, and is a marketable trust asset.
- Safety architecture and international crisis routing exceed what most wellbeing apps ship.

**Functional gaps relative to comparables (UI/experience level, not content)**
1. **No re-entry loop after Day 10.** Comparables always have a “what now” surface: e.g., “Revisit any day,” “Try a practice now,” “Take a moment to notice what has shifted,” or “Save your reflections.” Currently the journey ends and Home has nothing that keeps a finished user oriented.
2. **No lightweight continuity signal.** Deliberately no streaks/scores — correct. But comparables give a soft "last visited / where you are" cue. Home has resume; a finished user has no equivalent.
3. **No reminder or return mechanism.** Every retention-successful comparable has a gentle daily nudge. A PWA-safe, opt-in, local-only reminder is the only version compatible with your privacy stance; anything push-based needs infrastructure you have deliberately avoided.
4. **Standalone practices are under-surfaced.** They are the most reusable asset in the product and currently sit behind a nav item with no contextual entry from a finished day or from Home.
5. **Legacy weekly-session surface** is reachable in the route tree and inconsistent with the ten-day model.
6. **No offline install affordance.** As a PWA sold as a private companion, "add to home screen" is both a functional and a trust win; it is not currently offered.
7. **No export of one's own reflections.** Journalling comparables all offer export. With device-only storage, a user-initiated plain-text export is the only safe form of durability and the only mitigation for the real risk that clearing a browser destroys ten days of work.
8. **No feedback route fit for a pilot.** Project knowledge requires one that excludes crisis/therapy/sensitive disclosure; contact-support exists but is not scoped for pilot feedback.

## Business-model audit

**Current state:** no monetisation surface exists. This is correct for the pilot, but it means every commercial decision is still open. A freemium split — Days 1–3 or 4 free, then a small one-time unlock for the rest — is one viable option and would preserve the user's felt sense of value before asking for payment.

**Model assessment**
- *Subscription (Calm/Hallow model)* — mismatched. A ten-day finite journey does not justify recurring billing, and recurring billing on a healing product invites churn resentment and refund friction.
- *One-time purchase of the First Journey* — strongest near-term fit. CAD 19–29 is credible for ten days of this depth. Simple tax/receipt story, no dunning, no cancellation flow, low support burden.
- *Free First Journey + paid later journeys* — strongest long-term fit and the safest ethically: full-strength free entry proves value, later journeys are the revenue. Also the best conversion structure, because purchase happens after felt benefit, not before.
- *Bundle with a physical journal* — high margin and brand-reinforcing, but adds shipping, inventory, and returns. Defer.
- *B2B / clinician or church licensing* — plausible later revenue with far better economics per unit, but requires an admin/seat model and therefore accounts and a database. Not for this phase.

**Recommended commercial shape (for later approval, not now)**
First Journey free and full-strength. Journey 2 onward as one-time purchases. Optional physical companion journal later. No subscription. No ads, ever. No analytics that touch answers.

**Prerequisites before any money changes hands** (each is a hard gate)
Ontario legal/privacy review; Terms of Sale; refund policy; tax and receipts; a support route with a stated response window; payment privacy separated from journey data; and pilot evidence of lived benefit.

**Model risks to name explicitly**
- Device-only storage plus paid content means a lost device is a lost purchase. Either accept and disclose it plainly, or accept accounts for entitlement only — which contradicts the current privacy promise. This tension must be decided before selling anything.
- Regulatory positioning: educational and reflective, never treatment. Paid status raises the bar on this claim language, not lowers it.

## Prioritised change list — awaiting your approval

**Tier A — pilot-blocking, small, no new infrastructure**
1. Post-Day-10 continuation surface on Journey Home (revisit, practices, close well) so a finished journey does not dead-end.
2. Retire or hide the legacy weekly-session surface.
3. User-initiated plain-text export of one's own reflections, plus a plain-language warning that clearing the browser erases everything.
4. Pilot feedback route, scoped to exclude crisis, therapy, and sensitive disclosure, with clear expectations about response.

**Tier B — retention and reuse, still local-only**
5. Contextual entries into standalone practices from a completed day and from Home.
6. Opt-in, local-only gentle reminder (no push infrastructure, no server).
7. PWA install affordance and offline reliability check.

**Tier C — commercial groundwork (decision work, not code)**
8. Written pricing and packaging decision on the free-First-Journey model.
9. Legal/commercial document set drafted for Ontario review.
10. Entitlement/storage tension resolved and documented before checkout is built.

**Tier D — post-pilot only**
11. Journey 2 scoping; checkout; receipts and refunds; support SLA.
12. Grounded live-AI validation, if enabled at all.

## Technical notes

Tier A items 1, 2 and 5 are presentation-only and touch `src/routes/_shell.index.tsx`, the route tree's legacy session file, and existing practice content — no store or engine changes. Item 3 reads the existing versioned store and serialises to a text blob client-side; it writes nothing new and adds no dependency. Item 6 is a local scheduled notification behind explicit permission, with no server and no identifiers. Nothing in Tier A–B requires a database, accounts, analytics, or live AI, so the protected checkpoint's guarantees hold. Protected files (`package.json`, `bun.lock`, `src/routeTree.gen.ts`) stay byte-for-byte unless item 2 legitimately alters the route tree, which would need your explicit sign-off.
