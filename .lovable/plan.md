# Pre-Pilot Polish & Readability Pass

Small, presentation-only changes plus a verification sweep before you publish for pilot testers. No content, engine, storage, pricing, or route changes.

## First: one thing to confirm (not yet a fix)

On the running preview, entering **New Paths** at the access-code screen returned "That code doesn't match." That may simply be a difference between the sandbox environment and your live one, so before anything else I will read the configured access code value and confirm what testers should type. If it no longer matches "New Paths", the fix is a one-line settings correction — nothing in the app code.

Reason this is step one: if the code is wrong, every tester is locked out on day one.

## Graphics and readability changes I recommend

1. **Access-code screen composition.** On a phone the card sits low with a large empty band above it. Move it to a comfortable upper-third position, tighten the intro paragraph block, and give the error message a small warning marker so it reads as guidance rather than rejection.

2. **Reading measure on long text.** Reflection, teaching and legal pages currently run near the full container width at larger phone sizes. Cap body measure at roughly 60-66 characters so lines stop feeling long, and hold one consistent paragraph spacing value.

3. **Type scale tightening.** Body is 18px/19px which is good; the supporting/meta text and all-caps eyebrow labels are the weakest link for older eyes. Raise the smallest supporting size, reduce eyebrow letter-spacing slightly, and lift muted foreground contrast so every text pair clears WCAG 2.2 AA with margin rather than by a hair.

4. **Day-flow header presence.** Give the "DAY n · STAGE" band and its step ticks slightly more height and clearer separation from the reading surface, so the day marker feels like a chapter head rather than a toolbar.

5. **Primary button weight.** The full-width solid navy block is the loudest element on every step. Soften it (slightly narrower on wide phones, marginally lighter weight) so the reading surface stays primary, and make the pressed state unmistakable.

6. **Completed and current day states.** Replace the plain all-caps "FINISHED" marker with the quiet gold thread node treatment already in the design system, so progress reads as craft rather than a label.

7. **Quiet motion continuity.** A 200-240ms cross-fade on step change and a small settle on content arrival, fully disabled under reduced-motion. Nothing decorative.

## Verification sweep before publishing

- 360 / 390 / 430px and desktop, light and dark, spiritual OFF and ON.
- 200% zoom, forced colours, reduced motion, keyboard-only pass, screen reader labels on every icon control.
- Zero horizontal overflow; every tappable control at least 44px.
- Reload-resume mid-day, clear/restart data, access-code unlock and 30-day persistence.
- Full test suite, typecheck, production build.

## Technical notes

Work stays in `src/styles.css` tokens and utilities plus class-level edits in route and component files (`_shell.*`, `day.$day.tsx`, `JourneyScreen.tsx`, `PilotGate.tsx`, `LegalPage.tsx`). Existing source-level visual locks in `src/lib/__tests__/pilot-visual-polish.test.ts` will be updated only where a lock intentionally changes. Protected files (`package.json`, `bun.lock`, `src/routeTree.gen.ts`) stay untouched. Project stays private and unpublished until you say otherwise.

## Not included

No therapeutic wording changes, no day-content edits, no payment/analytics work, no live AI, no publish action.
