# Visual & Interface Audit — Beauty from Ashes (UI only, no content changes)

Scope: how the app *looks and feels* — colour, type, spacing, graphics, motion, touch behaviour. No therapeutic copy, no clinical structure, no route changes. Benchmarks: Calm/Headspace tier, faith apps (Hallow, Lectio 365, Pray.com), journalling apps (Day One, Stoic, Reflectly), premium reading apps (Substack, Kindle, Readwise).

## What I looked at

Captured the live preview at 390px: Welcome/onboarding, Your Journey home, Day 1 Arrive, Settings, Support & Safety, plus the full 14-step Day 1 flow.

## Where it already matches the good apps

- Warm ivory paper with deep navy ink and a single restrained gold accent reads as considered and adult — closer to Lectio 365 and Kindle than to therapy-app pastel.
- IBM Plex Serif headings over Plex Sans body is exactly the editorial pairing premium reading apps use. Line length and line height on reading screens are comfortable.
- Restraint is real: no scores, no streaks, no stock photography, no clichéd kintsugi. The thin gold thread motif is distinctive and used sparingly.
- Day progress as thin segment ticks is quieter and more dignified than a percentage bar.

## Where it looks less finished than the benchmarks

1. **Screens read as one long scroll of similar cards.** On Your Journey and inside a day, nearly every block is the same cream card with the same border radius, same 1px hairline, same padding. Calm, Hallow and Day One vary card weight deliberately: one hero surface, everything else lighter or borderless. Right now nothing is visually primary.

2. **Vertical rhythm is loose and inconsistent.** Gaps between blocks vary without meaning, and there is a large dead zone above the fold on onboarding (headline starts roughly a third down). Premium apps hold a strict spacing scale (4/8/12/16/24/32/48) so the page feels composed rather than stacked.

3. **The day-flow header is thin for what it carries.** "DAY 1 · ARRIVE", the tick row, home and settings icons all sit in a narrow band with small icons. Hallow and Headspace give the step indicator more presence and pair it with a clear, generous back affordance.

4. **The journey list card is cramped and left-heavy.** The DAY/number chip, title, one-line summary and an all-caps meta string all compete; the meta line wraps to three lines and is the least important information on the card. Day One and Stoic put one strong title, one quiet subtitle and at most one small state marker.

5. **Icon language is generic.** The gear and home glyphs and the small chevrons are default-library shapes with no relationship to the gold-thread motif. Faith and wellbeing apps at this tier use a single consistent, slightly custom icon set.

6. **Touch targets and row affordances are inconsistent.** Settings link rows are tall and comfortable; chevrons on journey cards are tiny and visually detached from the tappable area. Everything tappable should feel like the same size class (min 44px) and give the same press feedback.

7. **Almost no motion.** Screen changes are instant. Calm/Hallow use a 200-300ms cross-fade and a small upward settle on content, plus a soft press-scale on primary buttons — nothing decorative, just continuity. Reduced-motion must stay honoured.

8. **The primary button is heavier than everything around it.** A full-width solid navy block against a very light page is the loudest element on the screen and repeats on every step. Premium apps soften this (slightly reduced width or lighter weight) so the reading surface stays the focus.

9. **Motif graphics are underused and inconsistent in scale.** The day motif appears once as a small band; several screens have no visual anchor at all. Distinct per-day motifs are one of the strongest brand assets here and currently carry too little weight.

10. **Empty and completed states are plain text.** "FINISHED" as all-caps meta is the weakest possible reward. It doesn't need a badge or a streak — a quiet gold seam or a filled thread node would be enough.

## Prioritised change list (for your approval, pass by pass)

**Tier 1 — biggest visible lift, lowest risk**
- Lock one spacing scale and apply it to all vertical rhythm; remove the above-fold dead zone on onboarding.
- Introduce surface hierarchy: one hero surface per screen, secondary blocks lighter/borderless.
- Rebuild the journey card layout: title, one quiet subtitle, one small state marker; demote the all-caps meta line.
- Normalise touch targets to 44px minimum with consistent press states.

**Tier 2 — polish and brand identity**
- Strengthen the day-flow header: clearer step indicator, generous back affordance, larger icons.
- Add restrained motion: 240ms cross-fade on step change, small content settle, press feedback; fully disabled under reduced-motion.
- Rebalance the primary button so it reads as confident, not dominant.

**Tier 3 — distinctiveness**
- Unify the icon set to one consistent, slightly custom family aligned to the gold-thread motif.
- Give day motifs more presence and consistent scale; add a quiet visual anchor to screens that lack one.
- Design quiet completed/current states using the gold thread rather than all-caps text.

**Tier 4 — verification**
- Re-audit at 360/390/430px and desktop, light and dark, spiritual off/on, 200% zoom, forced colours, reduced motion, and confirm contrast against WCAG 2.2 AA.

## Notes

- Every tier is presentation-only: tokens in `src/styles.css` plus layout/class changes in route and component files. No content, engine, storage, test-locked wording or route-tree changes.
- Existing protected files (`package.json`, `bun.lock`, `src/routeTree.gen.ts`) stay untouched.
- Founder visual acceptance and real-device checks still gate the pilot; this audit does not substitute for them.
