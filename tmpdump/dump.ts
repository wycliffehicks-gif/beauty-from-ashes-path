import { FIRST_JOURNEY_DAYS } from "@/content/first-journey";
for (const d of FIRST_JOURNEY_DAYS) {
  if (![3,5,10].includes(d.day)) continue;
  console.log("=== DAY", d.day, d.title, "|", d.theme, "| amv", d.answerMeaningVersion);
  for (const q of [...d.questions, d.step]) {
    console.log(" Q", q.id, "select", q.select, "|", q.prompt);
    for (const o of q.options) console.log("   -", o.id, o.spiritualOnly ? "[spiritualOnly]" : "", "|", o.label);
  }
  console.log(" practise.reflection:", d.practise.reflection.title, "| route from:", d.practise.route?.from, Object.keys(d.practise.route?.reflectionByOption ?? {}));
  console.log(" spiritual:", d.practise.spiritual.title);
}
