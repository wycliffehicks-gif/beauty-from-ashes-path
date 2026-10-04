# Permanent ten-day visual rollout plan

## Scope
- Change only the five approved presentation files:
  - `src/components/VisualMotifs.tsx`
  - `src/styles.css`
  - `src/components/SplashGate.tsx`
  - `src/routes/_shell.index.tsx`
  - `src/routes/day.$day.tsx`
- Keep all journey content, therapeutic wording, storage, navigation, AI, privacy, route behavior, dependencies, settings and publication state unchanged.
- Keep the pilot light-theme only.

## Implementation
1. Replace prototype visual naming with permanent semantic naming.
2. Rework `VisualMotifs` into a shared inline-SVG grammar for the ten existing motif keys, with decorative SVGs hidden from assistive tech.
3. Update shared Day screen presentation only:
   - arrival motif header for every day;
   - quieter teaching, question, echo, practice, reflection and close surfaces;
   - accessible choice states with preserved selection logic and labels;
   - balanced close actions without celebration styling.
4. Update Journey Home presentation only:
   - continuous gold thread through marker centres;
   - opaque row faces and markers;
   - natural theme wrapping;
   - slightly larger/readable state line.
5. Update Splash presentation only:
   - remove remote logo/image dependency;
   - use typographic Resurgence line and secondary phrase;
   - keep session-only timing with shorter motion and reduced-motion handling;
   - make the underlying app inert while splash is visible.

## Verification
- Run focused/full tests available in the project, TypeScript check, and production build.
- Verify the final diff contains only the five approved files.
- Programmatically confirm protected content files are unchanged.
- Use browser checks for splash, Journey Home, representative day flows, motifs, responsive sizes, keyboard/focus, reduced motion, and absence of console/page errors where feasible.

## Route tree note
The request asks to restore `src/routeTree.gen.ts` from a historical base after build. I will first inspect whether this file differs in the current workspace. I will not edit generator/config files.
