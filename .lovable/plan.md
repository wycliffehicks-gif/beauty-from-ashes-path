
# Beauty from Ashes — Beta Readiness Audit

Read-only assessment of the current implementation against the governing Project Knowledge. No code changes proposed here; a short follow-up fix list appears at the end for approval.

## 1. What is already strong and aligned

- **Product framing is intact.** Onboarding, Today, Journey, Practices, Resources, Support & Safety, and Settings all speak in the pastoral, non-clinical, invitational voice specified. "May", "perhaps", "you do not have to" language is used consistently.
- **Trauma-informed movement is honoured.** The Daily Flow uses ARRIVE → NOTICE → NAME → LISTEN → REFLECTION → RECONNECT → ONE HONEST STEP → CLOSE, with Skip/Back/Close-for-today, and "I need to go slowly" / "I'm not sure yet" options in Notice and Name.
- **No punitive mechanics.** No streaks, no locks, no scoring, no celebration animation. Journey copy explicitly says every day is open and revisitable.
- **Optional spirituality is a real toggle**, not a track split. Scripture + prayer are collapsible per day and controlled from Settings and Onboarding.
- **Local-storage discipline is correct.** Only `onboarded`, `showSpiritual`, `visitedDays`, `favourites` are stored. No free-text reflections are captured or persisted. `prefs.ts` gates on `typeof window` and hydrates through `useEffect`, matching TanStack SSR rules.
- **Splash is respectful.** One-per-session (`sessionStorage`), ~1.4s dwell reduced under `prefers-reduced-motion`, `aria-hidden`, text fallback on image error, coordinated with the shell's onboarding redirect so first-time users see the full launch before routing.
- **Brand alignment reads well.** Ivory canvas, deep navy structure, restrained gold accents, Playfair/Lato pairing, "Awaken | Rediscover | Hope" holding on one line at 360–390 px.
- **Content is source-grounded.** All seven days map cleanly onto the series arc (Jerusalem road, burdens, divided self, Bartimaeus, Zacchaeus, Gethsemane, Emmaus), and dream interpretation is correctly deferred.
- **Safety framing is honest.** Support page states plainly that the app is not monitored and cannot respond to emergencies.

## 2. Bugs, confusing flows, unfinished placeholders, missing links, weak copy

Roughly ordered by risk to trust.

1. **Onboarding redirect uses `window.location.replace`.** `src/routes/_shell.tsx` does a full page reload to `/onboarding` for unonboarded users. It works, but the momentary flash after the splash is jarring and defeats client-side routing. A `navigate({ to: "/onboarding", replace: true })` would be smoother.
2. **`favourites` is stored but never used.** `toggleFavourite` and the `favourites` array in `prefs.ts` have no UI surface anywhere. Either wire a "Save" affordance on days/practices or remove the field before beta to avoid dead code and privacy questions.
3. **Journey ordering claim is slightly overstated.** Today's copy says "Missed days don't count against you. You can revisit any day, in any order," but the Today CTA and Day-close CTA both funnel to the next unvisited day. That is fine as a default; the copy is honest. However, the Journey list has no explicit "start anywhere" affordance beyond the row tap. Minor.
4. **Resources page has three "Coming soon" cards and only one live link.** For a private beta this reads as unfinished. Either (a) hide the coming-soon cards behind a single "More coming" line, or (b) confirm the founder wants placeholder cards visible to testers with a short note about why.
5. **Support & Safety has only placeholder crisis lines.** This is the single biggest trust liability. Even a private beta invitation should include at least one verified Canadian line (e.g. 988 Suicide Crisis Helpline, Talk Suicide Canada, Kids Help Phone) before real people are invited. Current copy says "please use the resources you already know" — acceptable only if testers are told this in the invitation email; otherwise it needs verified numbers.
6. **No "Pause and Ground" quick-exit from inside the Daily Flow.** The header offers Close and Support, but not a one-tap grounding shortcut. Given the app's stated intent, a "Pause" link (routing to `/practice/pause-and-ground`) alongside Support would honour the promise made on Today.
7. **Reflection step's Scripture accent uses `var(--ember)`.** That token predates the palette refactor and doesn't appear in the Resurgence palette. Visually it currently renders as an off-palette hairline. Should be soft gold or deep navy.
8. **Bottom nav is `fixed` with `pb-32` on `<main>`.** Works on mobile. On desktop widths the fixed footer floats across the full viewport, which reads inconsistently with the branded contained-frame treatment elsewhere. Consider hiding the bottom nav ≥ md and showing top nav instead — or leave for post-beta.
9. **`markDayVisited` fires on Day route mount, not on completion.** Opening a day and closing it immediately still marks it visited. Not a bug, but be aware if testers ask "why is Day 3 marked visited when I only glanced?" — the honest answer is "opened counts as visited."
10. **Onboarding "Begin" button label vs. splash.** After splash, first-time users see Onboarding whose final CTA is "Begin". Then Today's primary CTA is "Begin One Honest Step". Two "Begins" in ten seconds. Minor copy tweak: onboarding could end with "Continue" or "Enter".
11. **`_shell.support.tsx` link back to Today** says "← Return to Today" but the main brand link in the header also returns to `/`. Redundant; harmless.
12. **No `robots` noindex on the shell routes.** Only Day pages set `robots: noindex`. Since this is a private beta and not published, low priority — but if the preview URL is shared, adding noindex globally on `__root` is cheap.
13. **Settings "Clear local data" uses `window.confirm`.** Functional but jarring against the calm visual system. Not urgent.
14. **Optional prayer visible on some days only.** Days 3 and 5 have no `optionalPrayer`; days 1, 2, 4, 6, 7 do. This is a content choice, not a bug — but worth confirming with the founder that the omission on Days 3 and 5 is intentional.

## 3. Genuinely necessary before inviting beta users

Small list. Everything here is either a trust risk or a rough edge that will read as unfinished:

1. Add at least one verified Canadian crisis line to Support & Safety (or make the invitation email carry this responsibility explicitly).
2. Add a "Pause" shortcut in the Daily Flow header alongside "Support".
3. Replace `window.location.replace` in the shell's onboarding redirect with the router's `navigate({ replace: true })`.
4. Fix the off-palette `var(--ember)` accent on the Scripture blockquote.
5. Decide the Resources "Coming soon" treatment — either compress or annotate.
6. Confirm intentional omission of `optionalPrayer` on Days 3 and 5.
7. Remove or wire up the `favourites` field.

Estimated effort: under an hour of focused edits, no scope expansion, no schema changes.

## 4. Valuable but can wait until after beta

- Save/favourite affordance if the founder wants it.
- Desktop layout refinement (top nav vs. fixed bottom nav ≥ md).
- Softer in-app confirm dialog for "Clear local data".
- Copy pass to reduce the two adjacent "Begin" CTAs.
- Print/PDF export of a day's reflection.
- Real Resurgence Therapeutics website link, real journal URL, curated professional-support directory.
- Multi-language pass, install prompt for PWA, offline shell.
- Analytics — deliberately deferred; only add lightweight anonymous counters if the founder later requests them.

## 5. Should NOT be added (would conflict with product purpose)

- Streaks, badges, XP, unlockable days, day-locking, celebratory animation. Non-negotiable.
- AI chat, AI journal analysis, mood scoring, sentiment tracking, or any inference over the user's naming choices.
- Cloud sync of anything a user names, chooses, or reflects on.
- Accounts, sign-in, social features, community feed, comments.
- Push notifications framed as reminders or accountability.
- Deep trauma-exposure prompts, guided catharsis, "confront your abuser" scripts, or forced positivity reframes.
- Dream interpretation in v1 (already correctly deferred).
- Payments, upsells, in-app store, or subscription gating.
- Overt religious imagery, worship music, denominational language, or spiritual-bypass framings ("just trust God more").
- Diagnostic language ("your PTSD score", "your attachment style is…").

## 6. Readiness verdict

**Ready for private beta after minor fixes.**

The product is coherent, the safety posture is honest, the palette and content voice are aligned with Resurgence Therapeutics, and the technical constraints (no DB, no accounts, local-storage only) are correctly enforced. The gap between "ready" and "not ready" is small — it lives almost entirely in item 3 above. Once at least one verified crisis line, the Pause shortcut, and the small polish items land, the app is safe to share with a small trusted circle.

---

## Next step (awaiting founder approval)

If you approve, I can move to build mode and implement only items in section 3 as a single small change set — no scope expansion, no publish, no database. Say "proceed with the minor fixes" (or edit the list) and I'll execute.
