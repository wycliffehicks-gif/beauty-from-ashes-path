# Front Door, Landing Page and Pilot Access

Answers and a build proposal for six questions: a better landing page/front door, gentle payment after Day 3, icon and per-day visual language, life after Day 10, a public page people can load the app from, and how your pilot testers actually get in.

Nothing here changes Days 1–10 content, the reflection engine, or the protected checkpoint.

## 1. A better front door

Today the very first thing a new person meets is the splash, then four explanatory screens, then the agreement. That is a good *onboarding* flow but it is not a *front door*: there is no single page that says what this is, who made it, and why it can be trusted, before the person commits to reading four screens.

Recommendation: add one public landing page, and make it what `/` shows to anyone who has not yet accepted.

```text
/  (public landing)  ->  Begin the journey  ->  /onboarding  ->  Your Journey
/  (already accepted) ->  Your Journey (unchanged)
```

Landing page sections, in this order:
1. Quiet hero: title, subtitle, one sentence of who it is for, single primary action "Begin the journey".
2. What the ten days are — the day names as a calm list, not a sales grid.
3. What a day actually looks like — teaching, a practice, an optional Christian path, one honest step.
4. What this is not — plainly: not therapy, not diagnosis, not crisis care, with the Support & Safety link.
5. Privacy in one short block — no account, no database, nothing leaves the device.
6. Who is behind it — Resurgence Therapeutics, Carl Wycliffe Hicks Jr.
7. Footer: Terms, Privacy, Important Information, Support & Safety.

This is the page that later becomes the link from your Wix site, and it is also the page an app-store-style "install" prompt belongs on.

## 2. Payment gently requested after Day 3

The boundary already exists and currently sits after Day 4 (`FREE_DAYS = 4`) with local pilot unlocking and no payment. Moving it is a one-constant change plus copy.

Sequence after your pilot:
1. You bring back a price and the pilot's value signal.
2. Set `FREE_DAYS = 3`, so the boundary appears when Day 4 is opened.
3. Boundary copy shifts from "nothing to pay" to a single, unhurried offer: one price, one-time, keeps working offline, no subscription, refund sentence, and an equally visible "Not now — return to Your Journey".
4. Checkout only after the Ontario legal/privacy review, because taking money adds Terms of Sale, tax/receipts, refunds and payment privacy.

Guardrails I would hold to: no countdown, no scarcity, no "unlock your healing" language, Days 1–3 remain full strength and permanently revisitable, and Support & Safety stays free and reachable from every screen.

## 3. Icon language and per-day distinction

Two separate problems.

Icons: the app currently borrows a generic icon set. Proposal — reduce icons to a small, owned set drawn from the gold-thread motif: a single line that opens (Journey), a line that pauses (Practices), a line that steadies (Support), a line that closes into a loop (Settings). Same stroke weight, same terminal shape, same optical size, no filled variants. Fewer icons, consistently drawn, reads as more premium than more icons drawn generically.

Per-day distinction: keep one motif system, vary three parameters per day so Day 1 and Day 10 feel visibly different without new artwork:
- thread position (edge → centre as the days progress),
- thread continuity (broken → gathered),
- accent temperature within the existing mineral range.

Day 1 a single thread near the margin; Day 5 two threads pulling apart; Day 10 the threads gathered but not tied. That last point matters clinically: Day 10 must not look repaired.

## 4. Life after Day 10

Comparables always have a next rhythm. Options, from lightest to heaviest, all of which respect "completion, not arrival":
1. **Repeatable weekly rhythm** (lightest, recommended first): one guided session a week drawing on your own saved answers. Nothing new to author.
2. **A returning day**: revisit any day with a "what is different this time" prompt, saved alongside the original without overwriting it.
3. **Practice library with a gentle rotation**: a short practice suggested each time you return, never scored.
4. **Journey 2 as a paid arc** — worth doing, but only after the pilot says Journey 1 helped.

I would not build any of these until your pilot report lands.

## 5. A page people can go to and load the app from

The landing page in section 1 is that page. To make it loadable and installable:
- The app already ships a manifest and service worker, so on a phone the landing page can offer "Add to Home Screen" with short iPhone and Android instructions.
- Publishing gives you a Lovable URL you can hand out today; later your Wix site links to that same URL. Nothing needs rebuilding when Wix goes live.
- Publishing is your decision, not mine — the project is deliberately private, so I will not publish without you asking.

## 6. How your pilot testers get in

There is no account system, so access is simply the URL. Recommended pilot setup:
- Publish once with a private-feeling slug you choose (for example `beauty-from-ashes-pilot`).
- Send each tester that one link, plus three lines: this is a private draft, everything stays on your own phone, and here is the Support & Safety link if the material stirs something up.
- Add a small "Private pilot" line on the landing page and a Pilot Feedback link, so testers always know where to report.
- Because storage is per-device and per-browser, tell testers to use the same phone and browser throughout, and not to use private/incognito mode.
- Optional: a light gate — a shared passphrase on the landing page before "Begin the journey". It keeps casual visitors out without accounts or a database. Say the word if you want it.

## Technical notes

- New public route (`src/routes/index.tsx` equivalent inside the existing shell structure) added to `PUBLIC_PATHS` in `src/lib/agreement.ts`, so it renders before acceptance and writes no journey state.
- `AgreementGate` changes from "redirect unaccepted users to `/onboarding`" to "show the landing page at `/`, redirect elsewhere as today". Journey Home moves behind the accepted state; its route and metadata stay intact.
- Landing page gets its own `head()` — title, description, og/twitter text. It is the only route that should be indexable, and only when you decide to be public.
- Boundary move is `FREE_DAYS` plus copy in `src/components/ContinueJourneyBoundary.tsx`. No checkout code in this pass.
- Icon and per-day motif work is CSS and `src/components/VisualMotifs.tsx` only; no content or engine files touched.
- Protected files (`package.json`, `bun.lock`) untouched; `src/routeTree.gen.ts` regenerates only because a route is added.

## What I would build in this pass

Landing page and front-door rewiring, the owned icon set, and the per-day motif variation. Held back until you return from the pilot: moving the boundary to Day 3, price and checkout copy, and the after-Day-10 arc.
