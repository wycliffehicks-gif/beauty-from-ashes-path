import { FIRST_JOURNEY_DAYS } from "@/content/first-journey";
import { answerKeyFor } from "@/lib/journey/reflection-engine";
import { parseJourneyRequest } from "@/lib/ai/journey-contract";
import { prepareJourneyGeneration } from "@/lib/ai/journey-policy";

for (const day of FIRST_JOURNEY_DAYS) {
  const answers: string[] = [];
  const steps = [...day.questions, day.step];
  for (const q of steps) {
    const key = answerKeyFor(day, q.id);
    const opts = q.select === "many" ? q.options.filter(o => !o.exclusive) : [q.options[0]!];
    for (const o of opts) answers.push(`${key}:${o.id}`);
  }
  for (const sp of [false, true]) {
    const p = parseJourneyRequest({ day: day.day, answerMeaningVersion: day.answerMeaningVersion, answers, spiritual: sp });
    if (!p.ok) { console.log(day.day, sp, "FAIL", p.error, p.detail); continue; }
    const prep = prepareJourneyGeneration(p.request);
    console.log(day.day, sp, prep.policy.length + prep.groundedPayload.length);
  }
}
