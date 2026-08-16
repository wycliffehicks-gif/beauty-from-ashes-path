// Pure resolution of a day's routed practice.
//
// A day may define `practise.route`, mapping one question's single choice to a
// specific nonreligious practice path (Day 9's private rehearsals). Everything
// here is a pure read: no content is mutated, no answer is written, no route is
// ever inferred, and no screen, question, token or completion effect exists.
//
// A mapped path is resolved ONLY when exactly one recognized option is selected
// on the route question AND that option carries a mapping. Unanswered, unknown,
// corrupt, multiple, and the deliberately open choices (unclear / none /
// private, which simply carry no mapping) all use the day's required
// `practise.reflection` fallback.

import type { JourneyDayContent, PracticePath } from "@/content/journey-types";
import { selectedOptionIds } from "@/lib/journey/reflection-engine";

export interface ResolvedPractice {
  reflection: PracticePath;
  spiritual: PracticePath;
  /** The option id that selected the path, when one did. Presentation only. */
  routedBy: string | null;
}

/** The single mapped option id for this day's route, or null. */
export function resolvedRouteOptionId(
  day: JourneyDayContent,
  answers: string[] | undefined,
): string | null {
  const route = day.practise.route;
  if (!route) return null;
  const selected = selectedOptionIds(day, route.from, answers);
  if (selected.length !== 1) return null;
  const id = selected[0]!;
  return Object.prototype.hasOwnProperty.call(route.reflectionByOption, id) ? id : null;
}

/**
 * The practice pair to present. Always returns the day's required paths when
 * nothing resolves, so a practice screen can never be left without one.
 */
export function resolvePractice(
  day: JourneyDayContent,
  answers: string[] | undefined,
): ResolvedPractice {
  const route = day.practise.route;
  const id = resolvedRouteOptionId(day, answers);
  if (!route || !id) {
    return {
      reflection: day.practise.reflection,
      spiritual: day.practise.spiritual,
      routedBy: null,
    };
  }
  return {
    reflection: route.reflectionByOption[id] ?? day.practise.reflection,
    // An option-specific Christian path is used only where one is explicitly
    // mapped; otherwise the day's single shared path is retained.
    spiritual: route.spiritualByOption?.[id] ?? day.practise.spiritual,
    routedBy: id,
  };
}
