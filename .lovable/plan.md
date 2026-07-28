
# Beauty from Ashes — Therapeutic Architecture Plan (v2)

## 1. Current state (verified at checkpoint 5ab7d81)

Confirmed by reading the repo:
- Private, unpublished. No DB, accounts, analytics, payments.
- Content model: `src/content/days.ts` — seven `DayContent` entries (day, title, theme, arriveLine, coreReflection, scripture, listenPrompts, reconnectOptions, oneHonestStep, closingBlessing, optionalPrayer).
- Daily flow: `src/routes/day.$day.tsx`, eight steps — arrive → notice → name → listen → reflection → reconnect → step → close. Search param `?step=close` supported.
- Reflection experience: `src/routes/day.$day.reflection.tsx` (curated + live modes), backed by `src/lib/ai/{compute,live-pipeline,live-provider,safety-gate,schemas,select-day-01,system-policy,validator}.ts`. `LIVE_AI_ENABLED_DEFAULT = true`; validator + one retry + curated fallback.
- Practices: `src/content/practices.ts` (Pause and Ground, Start Where You Are, and others) served via `/practice/$id`.
- Shell routes: Today, Journey, Practices, Resources, Settings, Support. Onboarding with clickwrap + AI consent. Legal routes present.
- Live-AI pipeline is Day-1-scoped (`dayId: "day-01"`, content pack + `select-day-01.ts`).

## 2. Structural recommendation

**Adopt weekly modules. Free product ships Module 1 (Week 1) at full therapeutic strength: seven ~5–10 min daily touchpoints + one ~30–60 min guided deeper session. Later paid tiers add Modules 2–7 at identical depth.**

Trade-offs vs. alternatives:

| Option | Depth per user | Preserves current code | Founder promise fit | Verdict |
|---|---|---|---|---|
| A. Keep 7 single days, add one weekly deep session at Day 7 | Medium; week is thin outside session | High (minimal changes) | Partial — free product still feels like a taster if paid extends the same 7 days | Weakest |
| B. Recommended: 7 themes → 7 weekly modules; free = Module 1 full | High; free product complete on its own | Medium (day route repurposed as day-of-week within a module) | Best — free is full-strength; paid extends breadth, not depth | Recommended |
| C. Two-track (daily micro + separate deep library) | High but fragmented | Low (new route tree) | Weaker continuity; loses the walking-together arc | Not recommended |

Option B lets Week 1 (theme 1: "The Walk You've Been Avoiding") become a complete healing arc, and each later module a comparable arc on its theme.

## 3. Module 1 (free) — therapeutic movement

Theme: **The Walk You've Been Avoiding** — noticing and gently approaching a meaningful, avoided road with dignity, at one's own pace.

Weekly movement (rhythm, not stages the user sees named):
1. **Day 1 — Arrival & orientation** (short). Establish safety, pace, consent, name that avoidance is often protective.
2. **Day 2 — Noticing the road**. Gentle inventory of what's been set aside.
3. **Day 3 — Deeper Guided Session (30–60 min)** — the therapeutic-quality anchor of the week. Placed mid-week (not Day 1 — user isn't yet oriented; not Day 7 — user needs time to integrate afterwards).
4. **Day 4 — Integration & compassion for the divided self**. Working with what emerged in the session.
5. **Day 5 — Meaning-making**. Sacred reframing; the road as part of a becoming.
6. **Day 6 — Embodied/relational step**. Preparing (not performing) one honest step toward a safe person or self.
7. **Day 7 — Close & carry forward**. Naming what shifted (however small), lament for what didn't, blessing, invitation into continued accompaniment.

Rationale for placing the deep session on Day 3: Days 1–2 build the container (safety, pacing, consent, small wins) that a 30–60 min session needs; Days 4–7 provide the integration a real therapeutic encounter requires. This mirrors Sacred Reweaving Therapy's emphasis on integration over insight.

## 4. Daily touchpoint structure (5–10 min)

Every daily touchpoint (Days 1, 2, 4, 5, 6, 7) uses the same shape so users learn the rhythm:

```text
1. Arrive (30–60s)      Grounding line + permission to go slowly / pause / leave.
2. Teach (60–90s)       Founder-approved short teaching that frames today's move. NEW — this is the "accompaniment" the current app lacks.
3. Notice (60s)         One structured prompt with response chips + "not sure / prefer not to say".
4. Practice (2–4 min)   A curated micro-practice tied to the teaching (grounding, naming, lament, sacred reframing, letter-fragment, body scan, etc.).
5. One Honest Step (60s) Suggested + user-selected; preparation counts.
6. Close (30s)          Blessing / optional prayer / carry-forward line.
```

The critical addition is **Teach** — a 3–6 sentence founder-authored explanation of *how to work with what is emerging*, not just what to notice. This is what the current experience is missing.

## 5. Deeper Guided Session (Day 3, 30–60 min)

Single long, pauseable, resumable session. Stages the user experiences (labels internal, not shown verbatim):

1. **Arrival & safety** (3–5 min). Consent to length; explicit "you can stop at any moment"; grounding; region-aware Support link surfaced but not required; adult confirmation reconfirmed if stale.
2. **Noticing** (4–6 min). Guided body / emotion / energy / connection scan with response chips. No scoring.
3. **Naming** (4–6 min). Structured prompts with always-visible "I'm not sure", "not today", "prefer not to say". Optional ≤600-char private text (never saved, never sent unless user chose live AI in this session).
4. **Exploration** (6–10 min). Founder-authored teaching + reflective prompts about the specific theme (Week 1: the avoided road — why it's avoided, what avoidance has protected, what it may be asking now).
5. **Meaning-making** (5–8 min). Sacred reframing offered as options, not conclusions ("one way to hold this…", "another possibility…"). User picks what resonates or none.
6. **Compassionate interpretation / reframing** (4–6 min). Bounded AI step (see §6) OR fully curated path — user chooses at session start. Both paths equal quality.
7. **Optional spiritual / existential reconnection** (3–5 min). Scripture + short reflection + optional prayer, shown only if `showSpiritual`. Non-spiritual pathway substitutes an existential-meaning reflection of equal depth.
8. **Embodied / relational practice** (3–5 min). Choose one: grounding, lament fragment, letter to self, breath-and-blessing, or a "preparation for a safe conversation" script.
9. **Integration** (3–5 min). "What, if anything, is a little clearer?" with chips + optional short text. Framing that nothing needing to be clear is also valid.
10. **Next step** (2–3 min). One Honest Step, chosen from curated suggestions tuned to session responses, or user-authored.
11. **Safe close** (2–3 min). Blessing, reminder of Pause & Ground, Support, and Day 4 waiting when ready. Never auto-advances.

Session state is held in memory + `sessionStorage` only (resume within the day). Nothing free-text is persisted or transmitted unless the user is on the live-AI branch of stage 6, per existing pipeline.

## 6. Where bounded AI belongs, where it does not

**AI adds genuine attunement at exactly two points:**
- Stage 6 of the weekly deep session (compassionate reframing) — same architecture as today's `live-pipeline.ts`: deterministic safety gate → immutable policy + curated content pack → strict schema output → validator → one retry → curated fallback.
- The Day 1 personalised reflection card (already built) — retained, repositioned as an optional short attunement on the arrival day.

**Curated (fixed) content, never AI:**
- All teaching text, Scripture selection, prayers, sacred-reframing options, session stage prompts, session structure, one-honest-step libraries, closing blessings, crisis and support content.

**AI must never:**
- Run inside the safety gate, crisis screens, or support routing.
- Generate Scripture, prayer, or spiritual claims from scratch (only compose transitional prose around approved IDs).
- Persist, log, or echo free text.
- Run on Days 2, 4, 5, 6, 7 outside the two attunement points above.
- Interpret trauma, diagnose, or direct action toward specific people.

## 7. Branching for stuck, numb, uncertain, low-energy, not-ready, distressed

Every response set in daily touchpoints and in the deep session must include:
- "I'm not sure" — routes forward with a curated "not-sure" teaching fragment; no re-asking.
- "Prefer not to say" — advances without penalty; teaching frames the choice as valid.
- "Not today" — offers a 90-second alternative (grounding + blessing + close) and marks the day visited.
- "Very little energy" — swaps in the shortest micro-practice variant; One Honest Step becomes a preparation step (e.g., "notice you thought about it").
- "Numb" — routes to a curated teaching on numbness-as-protection + a low-arousal body practice, not a naming prompt.
- "Mixed" — presents a curated "both/and" teaching; skips forced disambiguation.
- **Rising distress** — the existing deterministic safety gate (`src/lib/ai/safety-gate.ts`) already covers explicit flag + regex triggers. Extend its surface: add a persistent "I need to pause" control on every session stage that routes to Pause & Ground with a one-tap return-to-here; if user selects "I'm not safe right now" at any stage, deterministic safety screen fires with region-aware resources — no AI, no summarisation.

## 8. Fate of existing Day 1 code and content

| Asset | Action |
|---|---|
| `src/content/days.ts` seven entries | Keep as Module 1 daily texts, expanded per §4. Add a `teach` field and per-day `practice` reference. Days 2–7 texts remain the seed for Days 2/4/5/6/7 of Module 1 and inform later modules. |
| `src/routes/day.$day.tsx` | Keep. Repurpose `$day` from 1–7 within Module 1. Add the Teach step between Arrive and Notice. Extend chip options for the branches in §7. |
| `src/routes/day.$day.reflection.tsx` + `select-day-01.ts` + content pack | Keep. Becomes the Day-1 optional attunement + is reused as the stage-6 engine of the Day-3 deep session (same schema, expanded content pack). |
| Live-AI pipeline (`live-pipeline`, `live-provider*`, `validator`, `system-policy`, `safety-gate`, `schemas`) | Keep unchanged in shape. Extend content pack; do not change safety architecture. |
| `crisis-registry.ts` | Keep; wire it into every deep-session stage header. |
| Practices | Keep and add: lament fragment, letter-to-self, preparation-for-a-safe-conversation, numbness-safe body scan. |
| Onboarding + clickwrap + AI consent | Keep; add a one-line note that Module 1 includes an optional longer weekly session. |
| Legal / support / important-information routes | Keep. |

Nothing is retired. Additive redesign.

## 9. Minimum route / component / state changes

Routes (added or lightly modified):
- Add `src/routes/session.week-01.tsx` (or `/session/$moduleId`) — the Day-3 deep session, single route with stage-scoped inner state.
- Extend `src/routes/day.$day.tsx` to render the new Teach step; on Day 3, show a "Begin this week's deeper session" card that links to the session route instead of running the normal 8-step flow (or in addition to a short arrival version).
- Optional: `src/routes/_shell.journey.tsx` gains a "This week's session" tile.

Content:
- Extend `DayContent` with `teach: string`, `practiceId: string`, `branches: { notSure, notToday, veryLittleEnergy, numb, mixed, preferNotToSay }` (each a short curated string), and `variant: "daily" | "session-anchor"` for Day 3.
- New `src/content/sessions/week-01.ts` describing the eleven stages, prompts, chip sets, curated reframings, spiritual + non-spiritual pathways, integration prompts, close.
- Expand `src/content/ai/day-01.ts` content pack IDs so the same engine can serve session-stage-6 attunement.

State:
- Extend `src/lib/prefs.ts` (local-only): `visitedSessionStages: string[]`, `lastSessionResumeAt: number`, `moduleId: "week-01"`. No free text stored.
- `sessionStorage` holds transient session responses so refresh/resume works within a day.

Components:
- New `SessionStageShell` (header with Pause / Support / progress dots, footer with Back / Continue / "I need to pause").
- New `ResponseChips` shared by daily flow and session (always includes the seven branch options where relevant).
- Reuse existing headers, LegalFooter, SplashGate.

## 10. Staged implementation — five-credit day blocks

Each block is scoped to fit ~5 credits and ends in a testable, private state. Do not proceed to the next block until the previous is verified.

- **Block 1 — Content model expansion (no UI).** Add `teach` and `branches` fields to `DayContent`, seed values for Day 1 only, extend types + tests. Keeps app visually unchanged.
- **Block 2 — Daily flow: Teach step + branches for Day 1.** Render the new step in `day.$day.tsx`, wire branches on Notice. Tests.
- **Block 3 — Roll Teach + branches to Days 2, 4, 5, 6, 7** using existing content re-shaped. No session yet.
- **Block 4 — Session route scaffold.** `/session/week-01`, header/footer shell, stages 1–3 (arrival, noticing, naming) with curated content. Pause / Support / resume via `sessionStorage`.
- **Block 5 — Session stages 4–5 (exploration, meaning-making)** with curated teachings and options.
- **Block 6 — Session stage 6 (attunement) wired to existing live-AI pipeline** using an expanded content pack; retain curated-only branch as equal-quality default.
- **Block 7 — Session stages 7–8 (spiritual/existential + embodied practice).**
- **Block 8 — Session stages 9–11 (integration, next step, close).**
- **Block 9 — Journey/Today surfacing:** show the Day-3 session card; add a "This week's session" tile on Journey. Copy pass.
- **Block 10 — Full first-time-user walkthrough at 360/390px** (Playwright), fixes, final test/build. No publish.

## 11. Unresolved founder decisions (only where truly needed)

1. Confirm Week 1 theme is "The Walk You've Been Avoiding" (recommended) vs. a different Module 1 entry point.
2. Approve the Day-3 placement of the deeper session (vs. Day 4).
3. Approve the addition of a "Teach" step (3–6 sentence founder-authored teaching) on each daily touchpoint — this is the single most important change and requires founder writing.
4. Approve extending the live-AI pipeline into session stage 6, or keep AI attunement only on the Day-1 card while making session stage 6 fully curated.
5. Confirm minimum viable Module 1 content for the deep session: teachings, sacred-reframing options, non-spiritual parallel, integration prompts, closing blessing. (Founder authorship required.)
6. Confirm whether Week-1-complete users see a "continued accompaniment" placeholder (no payments, no capture) or nothing at all.

## 12. Recommended next task (one five-credit day)

**Block 1 only: expand the daily content model and seed Day 1.**

Concretely:
- Extend `DayContent` in `src/content/days.ts` with `teach: string` and `branches: { notSure, notToday, veryLittleEnergy, numb, mixed, preferNotToSay }`.
- Add founder-approvable draft values for Day 1 (drafts marked `// DRAFT — founder to approve`).
- Update TypeScript types + a single unit test asserting the fields exist on Day 1.
- No route or UI changes. No AI changes. App remains visually identical, private, unpublished.

This unblocks Blocks 2–3 without committing UI or session work, keeps this credit block small, and produces a reviewable copy artefact for founder authorship of the remaining Teach and branch texts.
