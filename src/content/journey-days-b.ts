// The First Journey — Days 6–10.
// PROVISIONAL copy. Founder content review required before any public use.

import type { JourneyDayContent } from "./journey-types";

export const DAYS_SIX_TO_TEN: JourneyDayContent[] = [
  {
    day: 6,
    answerMeaningVersion: "v1",
    title: "What It Is Costing Now",
    theme: "Present-day cost noticed without blame, forced choice or invented causes.",
    motif: "cost",
    shape: "notice-first",
    descriptor: "Noticing one present-day cost · about 12 minutes",
    arrive: {
      purpose:
        "A response, role or arrangement may still help you cope, function, meet real responsibilities or stay safe—and may also carry a cost. Holding both possibilities can make room to acknowledge one loss and consider what support or replacement any future easing would require.",
      lead: "Seeing a cost clearly is not the same as blaming yourself—or deciding to change.",
      body: [
        "Choose one familiar response, way of coping, role, or current arrangement to hold lightly today. It may be something you noticed in Days 4 or 5, or something else. If nothing comes to mind, you can read generally or leave any question unanswered.",
        "Today asks what strain or loss may be connected with it now, and what benefit, responsibility, constraint, or ongoing reality may help keep it in place. The aim is accuracy without guilt.",
      ],
      settle: [
        "Settle in any position that works for you.",
        "If it feels comfortable, notice one place where your body is supported. Otherwise, notice one neutral detail nearby using any sense that is available and comfortable.",
        "Nothing needs to change in your posture, breathing, or level of tension.",
      ],
    },
    understand: {
      label: "Listen",
      heading: "Something can help and cost you at the same time",
      body: [
        "A response, role or arrangement can help in one way and cost something in another. Cost means present strain or loss—less energy, closeness, choice, rest, meaning, dignity or hope. Cost is not blame, and it is not always avoidable.",
        "Respecting what keeps something in place matters. It may support functioning, safety, belonging or responsibility, or reflect illness, disability, caregiving, discrimination, financial pressure, limited resources or a lack of safe alternatives.",
        "Change does not happen safely through subtraction alone. If reliance on something were ever reduced, support, accommodation, safer conditions, another coping response or something life-giving may need to be present instead. Today asks only for an accurate map.",
      ],
      info: [
        {
          term: "What if the circumstances are still real?",
          explanation:
            "The task may be support, accommodation, resistance to something unjust, carrying differently, grieving what cannot be changed, or waiting for safer conditions—not simply letting go.",
        },
        {
          term: "Why look at cost at all?",
          explanation:
            "Noticing may help distinguish what is within your influence, what would require support or change around you, and what is not safe or possible to alter now. It does not require action.",
        },
      ],
    },
    questions: [
      {
        id: "cost",
        eyebrow: "Notice",
        prompt:
          "Thinking about that response, role, or situation, where—if anywhere—do you notice the clearest cost now?",
        hint: "Choose the closest fit. This is observation, not proof of cause.",
        select: "one",
        options: [
          {
            id: "body",
            label: "Physical well-being — sleep, appetite, tension, pain, or other strain",
          },
          { id: "energy", label: "Energy or capacity — less available after essential demands" },
          { id: "closeness", label: "Connection — less closeness or less room to be known" },
          {
            id: "patience",
            label: "My impact on others — less patience, presence, or availability than I want",
          },
          { id: "choices", label: "Room in my life — fewer choices or less space for what matters" },
          {
            id: "values",
            label: "Values or self-respect — tension between how I am living and what matters",
          },
          { id: "meaning", label: "Meaning or aliveness — things feel greyer or less engaging" },
          { id: "hope", label: "Hope or possibility — less expectation that change is possible" },
          { id: "none", label: "No clear cost stands out right now" },
          { id: "unclear", label: "I am not sure what is connected" },
          { id: "private", label: "I would rather keep this private today" },
        ],
        info: [
          {
            term: "A note about physical symptoms",
            explanation:
              "This reflection cannot tell you why a physical sensation is present. If a symptom is new, severe, worsening or concerning, pause and seek appropriate medical care.",
          },
        ],
        echo: {
          heading: "What you noticed",
          byOption: {
            body: "You noticed possible physical strain alongside this. This exercise cannot determine whether it is connected, partly connected, or unrelated.",
            energy:
              "You noticed reduced energy or capacity after essential demands. That limit deserves to be treated as real without assigning a cause.",
            closeness:
              "You noticed less closeness or less room to be known. That experience can matter without telling us why it developed.",
            patience:
              "You noticed less patience, presence, or availability than you want. Capacity may be relevant, and the effect on other people can still matter.",
            choices:
              "You noticed that your life or options feel narrower. How much comes from this response and how much from current circumstances remains open.",
            values:
              "You noticed tension between how you are living and something that matters to you. That deserves attention without becoming a verdict on your character.",
            meaning: "You noticed less meaning, colour, or engagement. Nothing here determines why.",
            hope: "You noticed less expectation that change is possible. Nothing is assumed about why, and hope does not have to be manufactured today.",
            none: "No clear cost stands out right now. You do not need to invent one.",
            unclear:
              "You are not sure what is connected. Uncertainty is an honest answer, and no cause will be assigned.",
            private:
              "You chose to keep the cost private. No particular cost or cause will be inferred from that choice.",
          },
          unanswered:
            "You continued without choosing a cost. No cost or cause will be assigned. You can still use today's practice with a general strain, or simply read it.",
          closing:
            "Naming one cost is not a promise to change, and it is not proof that one response caused it.",
        },
      },
      {
        id: "protects",
        eyebrow: "Balance",
        prompt: "What, if anything, may be helping this continue or making it difficult to change?",
        hint: "Choose the closest fit. A benefit, responsibility, constraint or ongoing reality may be present—and none has to be invented.",
        select: "one",
        options: [
          { id: "peace", label: "It helps reduce conflict or disruption" },
          { id: "functioning", label: "It supports day-to-day functioning" },
          { id: "safe", label: "It protects safety, privacy or stability" },
          { id: "others", label: "It helps me meet genuine responsibilities to others" },
          { id: "predictable", label: "It preserves predictability or familiarity" },
          { id: "little", label: "I do not notice much benefit or protection now" },
          { id: "belonging", label: "It preserves belonging, connection or a valued role" },
          {
            id: "limits",
            label: "Limits in health, energy, capacity, resources or support matter here",
          },
          {
            id: "ongoing",
            label: "Current circumstances or lack of a safe alternative make change difficult",
          },
          { id: "unclear", label: "I am not sure" },
          { id: "private", label: "I would rather keep this private today" },
        ],
      },
    ],
    practise: {
      heading: "Two ways to practise today",
      intro:
        "Both help you hold one possible cost beside what remains helpful, necessary, constrained or unresolved.",
      either:
        "Choose either, both or neither. You may read without doing, stop at any point, or continue.",
      reflection: {
        title:
          "Reflection Practice — recognize, respect, grieve and consider what would be needed instead",
        summary:
          "A contained map of one possible cost, what remains useful or necessary, one loss that deserves acknowledgment, and what would have to be present before anything changed.",
        steps: [
          "Orient outward to one neutral detail. Bring to mind one response, role or arrangement, or keep the exercise general.",
          "Recognize: complete privately, ‘One strain or cost I notice is…’ No proof of cause is required.",
          "Respect: add, ‘What this still does for me—or what makes it difficult to change—is…’ This may be safety, functioning, responsibility, belonging, limited capacity, current conditions or ‘I do not know.’",
          "Grieve: if workable, say once, ‘I wish this had not cost me…’ Stop after one phrase. No history or emotional intensification is needed.",
          "Consider replacement: ask, ‘If I ever relied on this even slightly less, what would need to be present instead?’ Possibilities include support, rest, safety, an accommodation, a boundary, practical resources, another response or changed conditions. ‘Nothing available now’ is valid.",
          "Distinguish what is within your influence, what requires support or change around you, and what is not safe or possible now. Reorient outward.",
        ],
        notRequired:
          "Gentler route: use only the cost and respect lines. Read-only route: read the four movements without applying them. No release, decision, disclosure, confrontation, forgiveness or change is required.",
      },
      spiritual: {
        title: "Scripture & Spiritual Reflection — rest without a slogan",
        summary:
          "A Christian practice for bringing both the cost and what remains real before Christ, without turning faith into a demand for instant release.",
        steps: [
          "Orient outward, then read the invitation if you wish.",
          "Name one possible cost, or keep it private.",
          "Name what remains useful, necessary, constrained or still unsafe.",
          "If workable, name one loss: ‘I wish this had not cost…’",
          "Ask what practical care, support, accommodation, safer condition or alternative response would need to accompany any easing. Prayer does not replace it.",
          "Return attention outward. No release, lighter feeling or answer is required.",
        ],
        notRequired:
          "This passage is not being used to tell you to remain in harm, carry everything alone, surrender a boundary or avoid practical support. This is not 'just give it to God.' No prayer, release, forgiveness or lighter feeling is required.",
        scripture: {
          reference: "Matthew 11:28 (World English Bible)",
          body: "Come to me, all you who labor and are heavily burdened, and I will give you rest.",
          note: "This is an invitation addressed to burdened people, not a command to remain in harm, carry alone, surrender a boundary or avoid practical help. It does not promise immediate relief or changed circumstances.",
        },
      },
    },
    step: {
      id: "step",
      eyebrow: "One Honest Step",
      prompt: "What is one safe, reversible way to respond to what you noticed—if anything?",
      hint: "Choose one. Nothing large, confrontational or irreversible.",
      select: "one",
      options: [
        { id: "rest", label: "Protect one brief piece of rest, if realistically possible" },
        {
          id: "ask",
          label:
            "Prepare one specific request for a safe person; nothing must be sent or said today",
          note: "Preparing counts. Consider only someone who has consistently respected your limits; this app cannot determine who is safe.",
        },
        {
          id: "return",
          label:
            "Identify one responsibility or situation that may need support, sharing, accommodation or another response; no action today",
        },
        {
          id: "notice",
          label: "Notice the cost and what keeps it in place once more, without acting",
        },
        {
          id: "support",
          label: "Identify one professional, community or trusted support I could consider",
          note: "If no person or service feels safe or available, choose another step.",
        },
        {
          id: "prepare",
          label:
            "Keep this inward: consider what may or may not be changeable, with nothing outward required",
        },
      ],
    },
    reflection: {
      intro:
        "This reflection stays close to what you chose\u2014or left open\u2014today. It is offered gently, without deciding what caused anything or what should change.",
      sections: [
        {
          id: "hearing",
          title: "What you noticed",
          from: "cost",
          lines: {
            body: "You noticed possible physical strain alongside this. This exercise cannot determine whether it is connected, partly connected, or unrelated.",
            energy:
              "You noticed reduced energy or capacity after essential demands. That limit deserves to be treated as real without assigning a cause.",
            closeness:
              "You noticed less closeness or less room to be known. That experience can matter without telling us why it developed.",
            patience:
              "You noticed less patience, presence, or availability than you want. Capacity may be relevant, and the effect on other people can still matter.",
            choices:
              "You noticed that your life or options feel narrower. How much comes from this response and how much from current circumstances remains open.",
            values:
              "You noticed tension between how you are living and something that matters to you. That deserves attention without becoming a verdict on your character.",
            meaning: "You noticed less meaning, colour, or engagement. Nothing here determines why.",
            hope: "You noticed less expectation that change is possible. Nothing is assumed about why, and hope does not have to be manufactured today.",
            none:
              "No clear cost stood out today. You are allowed to leave the question there without inventing an answer.",
            unclear:
              "You are not sure what is connected. That uncertainty deserves the same respect as a clearer answer, and no cause needs to be decided today.",
            private:
              "You kept the cost private. That boundary is respected; no cost or cause is being filled in for you.",
          },
          unanswered:
            "You left the question of cost unanswered. The fuller picture remains yours, without anything being added.",
        },
        {
          id: "protected",
          title: "What may be keeping it in place",
          from: "protects",
          lines: {
            peace: "Reducing conflict or disruption may matter, especially when conflict has consequences. This does not decide what to do.",
            functioning:
              "You named day-to-day functioning as something this supports. Any alternative may need enough stability and practical support for real life.",
            safe: "You named safety, privacy or stability. If a risk still matters, it deserves consideration rather than override.",
            others:
              "You named genuine responsibilities to other people. Their needs may matter, and so do yours; this day does not decide the balance.",
            predictable:
              "You named predictability or familiarity as something this provides. No past history is inferred from that.",
            little:
              "You do not notice much benefit or protection now. That recognition can remain unfinished and unhurried.",
            belonging:
              "You named belonging, connection or a valued role. Any future change may need to respect what is meaningful rather than dismiss it.",
            limits:
              "You named real limits in health, energy, capacity, resources or support. A limit is not a moral failure.",
            ongoing:
              "You named circumstances or a lack of safe alternatives that remain real. The response may not be the whole problem, and release may not be the right task.",
            unclear:
              "You are not sure what may be keeping this in place. You do not have to find a motive or benefit today.",
            private:
              "You kept this part private. That boundary is respected; the reason remains yours.",
          },
          unanswered:
            "You left this part open. No explanation is needed before your present reality can be taken seriously.",
        },
        {
          id: "care",
          title: "What may deserve care now",
          opening:
            "A possible cost and what may keep something in place can hold two truths: something may be straining life, and something may still be useful, necessary or constrained. When both are available, any future easing would need support or replacement rather than subtraction alone. One loss may also deserve grief without requiring change.",
          unanswered:
            "Whatever today held, the person living with this deserves gentleness without needing a complete explanation.",
        },
        {
          id: "next",
          title: "One honest next step",
          from: "step",
          lines: {
            rest: "Protecting a brief piece of rest, if possible, treats your capacity as real.",
            ask: "Preparing one specific request keeps the step reversible and gives you time to decide whether and with whom to share it.",
            return:
              "Identifying a responsibility that may need review, sharing, support or accommodation creates information without forcing action.",
            notice: "Noticing once more without acting keeps the pace yours.",
            support:
              "Identifying a professional, community or trusted support may help place this cost somewhere it does not have to be carried alone.",
            prepare:
              "You considered keeping this inward and leaving what may or may not be changeable open. No clarity, action or completed practice is being attributed to you.",
          },
          unanswered:
            "No next step was named. The question can remain open; nothing else is required today.",
        },
      ],
      closing:
        "What you noticed can be held without blame or a rushed conclusion. It may point toward choice, support, grief, safer conditions\u2014or simply more time, and your pace still matters.",
    },
    close: {
      heading: "Seen clearly, held gently",
      body: [
        "Today offered the question of a possible cost without turning it into a verdict. You may have answered, kept it private, read only, or moved through without engaging it.",
        "You did not have to blame yourself, dismiss what is still real or decide what to change. When you continue, Day 7 turns toward how you hold yourself while seeing what is true.",
      ],
      carryForward:
        "I can stay honest about what is clear and unclear without condemning myself or ignoring what is still real.",
    },
  },

  {
    day: 7,
    answerMeaningVersion: "v1",
    title: "A More Compassionate Way to Hold It",
    theme: "Truth, context, dignity and responsibility held together without self-attack.",
    motif: "compassion",
    shape: "standard",
    descriptor: "Holding truth without self-attack · about 12 minutes",
    arrive: {
      purpose:
        "Shame can turn pain or mistakes into a verdict about who you are. Separating what happened or what you did from your worth can support honesty, responsibility and dignity together.",
      lead: "Facing what is true does not require turning yourself into the enemy.",
      body: [
        "Today is not asking you to praise yourself or pretend everything is fine. It asks how you meet a difficulty, limit, need, response or mistake once you notice it.",
        "Here, compassion means holding truth, context, dignity and appropriate responsibility together. It may feel warm, neutral, practical, unfamiliar or difficult; no particular feeling is required.",
      ],
      settle: [
        "Settle in any position that works for you.",
        "If it feels comfortable, notice one place where you are supported. Otherwise, notice one neutral detail nearby using any sense that is available and comfortable.",
        "You do not need to touch your body, change your breathing, relax or feel settled.",
      ],
    },
    understand: {
      label: "Listen",
      heading: "Compassion can be honest without becoming cruel",
      body: [
        "A specific judgment concerns an action, impact, limit, need or circumstance. Shame turns that information into a whole-person verdict: ‘I made a mistake’ becomes ‘I am the mistake’; ‘I was hurt’ becomes ‘Something is wrong with me.’",
        "Compassion is not praise, innocence or exemption from consequences. It means facing the observable truth, adding relevant context, acknowledging only the responsibility actually within your influence, and refusing to make contempt the price of honesty.",
        "Dignity means that an action, wound, limitation or response is not the whole measure of a person. Accountability can still include changed behaviour, safe repair, boundaries or help. Self-punishment is not the same as repair.",
        "Some difficulties arise partly or mainly from grief, illness, disability, caregiving, discrimination, unsafe conditions or limited resources. Compassion does not assign blame for what was outside your control or erase impact where your choices mattered.",
      ],
      info: [
        {
          term: "What does “hold it” mean?",
          explanation:
            "It means how you relate to a feeling, response, need, limit, mistake or circumstance once you notice it — the stance you take toward it. It does not mean holding anything physically, approving of it, fixing it or solving it.",
        },
        {
          term: "What if compassion feels false or undeserved?",
          explanation:
            "Then start with accuracy and non-cruelty rather than warmth. “Something difficult is here” or “I can tell the truth without attacking myself” may be enough. No warmth is required, and nothing here asks you to declare that you have been doing your best.",
        },
        {
          term: "What if I have hurt someone?",
          explanation:
            "Compassion does not erase impact. It can sit alongside specific responsibility, safe repair, changed behaviour, clear boundaries or professional help, without treating self-punishment as the same thing as accountability or repair. No repair, contact or action is asked of you today.",
        },
      ],
    },
    questions: [
      {
        id: "tone",
        eyebrow: "Notice",
        prompt:
          "When something is difficult, or you believe you have fallen short, which inner response is most familiar?",
        hint: "Choose the closest fit. It may be words, pressure, images, withdrawal or blankness; you do not need to know where it came from.",
        select: "one",
        options: [
          { id: "harsh", label: "Harsh — I attack, insult or shame myself" },
          { id: "dismissive", label: "Dismissive — I minimise it or compare it away" },
          { id: "impatient", label: "Impatient — I pressure myself to be over it or do better" },
          { id: "anxious", label: "Anxious — I scan or rehearse what might go wrong" },
          {
            id: "silent",
            label: "More wordless — pressure, blankness or withdrawal rather than words",
          },
          { id: "mixed", label: "It changes — kind sometimes, harsh or distant at others" },
          { id: "kind", label: "Mostly fair or kind, even when things are difficult" },
          { id: "none", label: "No particular inner response stands out", exclusive: true },
          { id: "unclear", label: "I am not sure what happens inside", exclusive: true },
          { id: "private", label: "I would rather keep this private today", exclusive: true },
        ],
        echo: {
          heading: "What you noticed about the inner response",
          byOption: {
            harsh:
              "You described an inner response that runs harsh or shaming. That describes what happens; it says nothing about where it came from or what it is for.",
            dismissive:
              "You described minimising it or comparing it away. Other people's suffering does not make your experience unreal.",
            impatient:
              "You described pressure to be over it or to do better. No timeline is being set here.",
            anxious:
              "You described scanning or rehearsing what might go wrong. No motive, history or prediction is being read into that.",
            silent:
              "You described something more wordless — pressure, blankness or withdrawal rather than words. That is not proof of trauma, deprivation, a particular history or missing care.",
            mixed:
              "You described a response that changes. No single tone has to be treated as the whole picture.",
            kind: "You described a response that is mostly fair or kind. That is a real resource, and it does not have to be maintained perfectly.",
            none: "No particular inner response stands out today, and none needs to be invented.",
            unclear:
              "You are not sure what happens inside. That uncertainty can simply remain, and no hidden meaning will be assigned to it.",
            private:
              "You chose to keep this private today. Its content is not known or interpreted here, and no tone, cause, purpose or history will be inferred from it.",
          },
          unanswered:
            "You continued without naming an inner response. No tone, cause, purpose or history will be assigned.",
          closing:
            "An inner response is not the whole of you. Noticing it is one step; no correction is required today.",
        },
      },
      {
        id: "need",
        eyebrow: "Consider",
        prompt:
          "What would a more compassionate way of holding this look like today—if anything?",
        hint: "Choose the closest fit. Compassion may be practical, neutral or accountable; warmth is not required.",
        select: "one",
        options: [
          { id: "rest", label: "Treat rest, reduced demand or basic care as a real need—if possible" },
          {
            id: "acknowledged",
            label:
              "Acknowledge that this has genuinely been difficult without turning it into my identity",
          },
          {
            id: "notalone",
            label: "Respect that support may matter, without contacting anyone today",
          },
          {
            id: "permission",
            label: "Allow one feeling or reaction to be present without judging it",
          },
          { id: "patience", label: "Allow more time without treating delay as failure" },
          {
            id: "safety",
            label: "Respect safety, stability or practical support before pushing further",
          },
          {
            id: "forgiveness",
            label: "Separate accountability from self-punishment; no forgiveness is required",
          },
          { id: "unsure", label: "I am not sure what compassion would look like", exclusive: true },
          {
            id: "none",
            label: "No different way of holding this feels right today",
            exclusive: true,
          },
          { id: "private", label: "I would rather keep this private today", exclusive: true },
        ],
      },
    ],
    practise: {
      heading: "Two ways to practise today",
      intro:
        "Both paths hold truth, context, dignity and responsibility together, without denying any of them. One uses ordinary reflection; the other is an explicitly Christian path.",
      either:
        "Either, both or neither. You may read one through without doing it, and you may stop at any point.",
      reflection: {
        title: "Reflection Practice — truth without self-attack",
        summary:
          "One contained moment of facing something true, with context and any real responsibility included, and without adding self-attack.",
        steps: [
          "Orient outward to one neutral detail. Keep the exercise broad and private.",
          "Name the observable fact: ‘Something I notice is…’ Avoid a whole-person label.",
          "Add relevant context: ‘What was also true was…’ Context improves accuracy; it does not automatically excuse impact.",
          "Sort responsibility: ‘What is mine to acknowledge or address is…’ and, if useful, ‘What is not mine or was outside my control is…’ Do not invent either answer.",
          "Notice the possible shame verdict: ‘The whole-person story my mind may add is…’ If no words appear, leave this blank.",
          "Offer a fairer statement: ‘A more complete truth is…’ For example, ‘I made a mistake and may need to address it; I am not only this mistake,’ or ‘This affected me deeply; it is not proof that I lack worth.’",
          "Let the fairer statement remain for one brief pause without forcing belief, then reorient outward.",
        ],
        notRequired:
          "Gentler route: name only the observable fact and omit the verdict. Read-only route: read the sequence without applying it. No memory, confession, forgiveness, repair, disclosure, changed feeling or action is required.",
      },
      spiritual: {
        title: "Scripture & Spiritual Reflection — gentleness without abandoning truth",
        summary:
          "A Christian pathway in which gentleness toward what is vulnerable and a commitment to justice are held together, chosen only if it fits.",
        steps: [
          "Read the verse if you wish. Notice that gentleness and justice remain together.",
          "The image may feel comforting, difficult, distant or neutral. It may be set aside.",
          "Name one observable truth and any specific responsibility that is actually yours.",
          "If useful, pray: ‘Jesus, help me face what is true without contempt, keep what is just, and recognise the response that is mine.’",
          "Let prayer accompany practical accountability, boundaries and support rather than replace them. Reorient outward.",
        ],
        notRequired:
          "There is no requirement to confess, forgive, reconcile, surrender safety or boundaries, feel differently, pray at all, or find this passage comforting.",
        scripture: {
          reference: "Isaiah 42:3 (World English Bible)",
          body: "He won't break a bruised reed. He won't quench a dimly burning wick. He will faithfully bring justice.",
          note: "Christian readers may receive this as an image of gentleness toward what is vulnerable, held alongside justice. It does not say why suffering occurred, excuse harm or promise a feeling, and it is not a description of you as damaged. The image does not have to fit today.",
        },
      },
    },
    step: {
      id: "step",
      eyebrow: "One Honest Step",
      prompt: "What one contained step is possible today?",
      hint: "One choice. Each of these stays with you; nothing has to be said or sent.",
      select: "one",
      options: [
        { id: "sentence", label: "Use one fair, accurate sentence once" },
        { id: "catch", label: "Notice one harsh or dismissive response without arguing with it" },
        {
          id: "body",
          label: "Offer my body one ordinary form of care that is realistically available",
        },
        {
          id: "receive",
          label: "Let one fair sentence remain for a few seconds without forcing belief",
        },
        {
          id: "prepare",
          label:
            "Keep this inward: consider one less-punishing way of holding this, with nothing outward required",
        },
      ],
    },
    reflection: {
      intro:
        "This reflection stays close to what you chose\u2014or left open\u2014today. It offers no verdict\u2014only a gentler way of holding what may be true.",
      sections: [
        {
          id: "hearing",
          title: "The inner response",
          from: "tone",
          lines: {
            harsh: "The familiar inner response runs harsh or shaming. That is what is here; nothing is being said about its origin, purpose or meaning.",
            dismissive:
              "The familiar response minimises it or compares it away. That does not make what you are living with unreal.",
            impatient:
              "The familiar response presses you to be over it or to do better. No timeline follows from that.",
            anxious:
              "The familiar response scans or rehearses what might go wrong. No motive or history is being read into it.",
            silent:
              "The familiar response is more wordless — pressure, blankness or withdrawal. That is described, not interpreted.",
            mixed:
              "The response changes. Neither the kinder nor the harsher version has to stand for the whole.",
            kind:
              "The response you named is mostly fair or kind. It can be acknowledged without requiring it to stay that way all the time.",
            none: "No particular inner response stood out today. Nothing needs to be invented.",
            unclear:
              "What happens inside is not clear yet. Uncertainty can be met without judgement or explanation.",
            private:
              "You kept your inner response private. That boundary is respected, and the fuller experience remains yours.",
          },
          unanswered:
            "You left your inner response unnamed. You do not have to describe it for this reflection to meet you without judgement.",
        },
        {
          id: "care",
          title: "The way of holding you considered",
          from: "need",
          lines: {
            rest: "You considered treating rest, reduced demand or basic care as a real need. Whether any of it is available remains open.",
            acknowledged:
              "You considered acknowledging that this has genuinely been difficult without making it your identity. No acknowledgment or changed view is being claimed.",
            notalone:
              "You considered respecting that support may matter. No person, contact, disclosure or support is being attributed.",
            permission:
              "You considered allowing one feeling or reaction to be present without judging it. This does not say that you did so, approved of it or acted on it.",
            patience:
              "You considered allowing more time without treating delay as failure. No pace or decision is being attributed.",
            safety:
              "You considered respecting safety, stability or practical support before pushing further. No reason, action or changed condition is being assumed.",
            forgiveness:
              "You considered separating accountability from self-punishment. Nothing is excused, and no forgiveness or completed shift is being attributed.",
            unsure:
              "Compassion is not clear yet. You can begin with accuracy and non-cruelty without forcing warmth or an answer.",
            none:
              "No different way of holding this felt right today. That is a complete answer; you do not have to force words that feel false.",
            private: "You kept what might help private. That boundary is respected.",
          },
          unanswered:
            "You left this open. Nothing you did not name will be placed on you; the possibility of truth without self-attack can remain available.",
        },
        {
          id: "next",
          title: "One honest next step",
          from: "step",
          lines: {
            sentence:
              "You considered using one fair, accurate sentence once. No use, belief or result is being claimed.",
            catch:
              "You considered noticing one harsh or dismissive response without arguing with it. No noticing or change is being claimed.",
            body: "You considered one ordinary form of care for your body, if realistically available. No care or outcome is being attributed to you.",
            receive:
              "You considered letting one fair sentence remain briefly without forcing belief. No receiving or belief is being attributed to you.",
            prepare:
              "You considered a less-punishing way of holding this. No completed practice or changed feeling is being attributed to you.",
          },
          unanswered: "No next step was named. The day can end without one.",
        },
      ],
      closing:
        "Today offered a distinction between a whole-person verdict and an accountable stance. Whether or not you made selections, worth does not depend on attacking yourself; dignity and responsibility can remain in the same room.",
    },
    close: {
      heading: "Truth without contempt",
      body: [
        "Whether or not you named anything today, this question can remain: can what is true be held while some of the contempt, dismissal or pressure is left out?",
        "Compassion does not erase harm, consequence, grief, boundaries, limits or responsibility. It can mean accompanying yourself while you face what is yours, what is not, and what is still unclear.",
        "Day 8 explores what can happen when already-safe kindness, help, compassion or grace comes near—and how to receive only an amount that preserves discernment and boundaries.",
      ],
      carryForward: "I can face what is true without turning myself into the enemy.",
    },
  },

  {
    day: 8,
    answerMeaningVersion: "v2",
    title: "Let Something Good Reach You",
    theme: "Noticing how you respond to already-safe kindness, help, compassion or grace.",
    motif: "reconnect",
    shape: "practise-mid",
    descriptor: "Receiving one safe amount · about 12 minutes",
    arrive: {
      purpose:
        "Some people can face pain more easily than they can receive safe kindness, help, compassion or grace. Noticing your reaction can help you choose what feels safe enough to let in.",
      lead: "Receiving is not the same as trusting everyone, owing access or lowering a needed guard.",
      body: [
        "Some people are more familiar with bracing, helping, performing or coping than with receiving. When kindness or help appears, they may soften, tense, dismiss it, become suspicious, feel undeserving, or notice nothing.",
        "Today uses only something already judged safe enough, an impersonal source of comfort or beauty, a fair sentence offered to yourself, or a prewritten sentence on this screen. No person has to be contacted or remembered.",
        "The aim is not to prove trust. It is to notice the reflex, check safety, and—only if workable—allow one small amount of care to remain without immediately pushing it away.",
        "Boundaries remain intact. You may decide that the safe amount is none.",
      ],
      settle: [
        "If it helps, take a moment before reading on. Any of these is optional, and none of them requires a particular feeling.",
        "You might rest your attention on one thing you can see, or one sound you can hear, or the surface under your hand — whichever is available to you.",
        "You might instead hold one ordinary thought: the day, the room, the time of year.",
        "Or you can simply read on. Reading on is a complete way to begin.",
      ],
    },
    understand: {
      heading: "Receiving care without giving up discernment",
      body: [
        "Receiving means allowing one safe kindness, comfort, help, fair sentence or moment of grace to register. It does not mean trusting the source in every way, becoming vulnerable, accepting a debt or agreeing to future contact.",
        "‘Already safe enough’ means safe for this small amount: no known coercion, retaliation, manipulation, required disclosure or use of your vulnerability against you. The app cannot assess a person or relationship. If uncertain, use a self-directed, impersonal or read-only route.",
        "Pulling away may be an automatic protective response, simple preference, unfamiliarity, current context or something unclear. No history, attachment style or trauma is inferred.",
        "A brief receiving practice may provide information about what fits. It does not create a therapeutic relationship, prove safety or promise transformation.",
      ],
      info: [
        {
          term: "What does “safe enough” mean here?",
          explanation:
            "Safe enough for this amount of contact — not safe in every way, and not permanently. Someone who respects a no or a limit, who does not require you to disclose anything, and who is not known to use your vulnerability against you. This app cannot decide whether a particular person is safe. You may know things about this person or situation that the app cannot know. If safety is uncertain, no contact is required, and another route can be chosen instead.",
        },
        {
          term: "What does “let it land” mean?",
          explanation:
            "Pause long enough to notice a safe word, gesture, comfort or offer instead of immediately dismissing it. It does not require belief, gratitude, trust, contact, obligation or a particular feeling.",
        },
      ],
    },
    questions: [
      {
        id: "route",
        eyebrow: "Choose",
        prompt:
          "What source of already-safe kindness, care or grace—if any—would you be willing to consider today?",
        hint: "One source only. If safety is uncertain, choose an impersonal, self-directed, unclear or no-contact route.",
        select: "one",
        options: [
          { id: "self", label: "One fair or caring sentence I can offer myself" },
          {
            id: "body",
            label: "One ordinary comfort or form of physical care already available",
          },
          { id: "reality", label: "One neutral or pleasant part of the present I do not have to earn" },
          { id: "values", label: "One fair truth about dignity, worth or what matters" },
          {
            id: "creativity",
            label: "Beauty, music, words, learning or nature already within reach",
          },
          {
            id: "person",
            label: "Kindness or help already offered by a person I judge safe enough",
          },
          {
            id: "community",
            label: "Support from a community, culture or tradition that does not require performing",
          },
          {
            id: "god",
            label: "Grace or welcome from God, within the optional Christian path",
            spiritualOnly: true,
          },
          { id: "other", label: "Another already-safe source of care or goodness" },
          { id: "unclear", label: "I am not sure what source feels safe enough" },
          { id: "none", label: "Nothing feels safe or available to receive today" },
          { id: "private", label: "I would rather keep the source private" },
        ],
        echo: {
          heading: "Room for what is clear — and what is not",
          byOption: {
            self: "You chose a fair or caring sentence offered by you. It does not have to feel warm or fully believable.",
            body: "You chose an ordinary physical comfort or form of care already available. No bodily response or improvement is expected.",
            reality:
              "You chose one neutral or pleasant part of the present. Noticing it does not deny pain or require gratitude.",
            values:
              "You chose one fair truth about dignity, worth or what matters. It may remain a possibility rather than a belief.",
            creativity:
              "You chose beauty, music, words, learning or nature already within reach. Receiving may mean noticing rather than doing.",
            person:
              "You chose kindness or help already offered by someone you judge safe enough. No contact, disclosure, expanded trust or acceptance is required.",
            community:
              "You chose support from a community, culture or tradition that does not require performing. Participation is not required.",
            god: "You chose grace or welcome from God within the Christian path. No prayer, certainty or felt closeness is assumed.",
            other:
              "You chose another source of care or goodness. It can remain private and undefined.",
            unclear:
              "No source feels clearly safe enough. Nothing will be selected or interpreted for you.",
            none: "Nothing feels safe or available to receive today. That limit is respected.",
            private:
              "You kept the source private. Its content and safety remain yours to judge.",
          },
          unanswered:
            "You continued without making a selection, and nothing will be chosen on your behalf. Today's screens still hold without one.",
          closing:
            "Receiving one thing never creates a debt, opens every boundary or requires receiving more.",
        },
      },
      {
        id: "size",
        eyebrow: "Amount",
        prompt: "What amount, if any, feels safe enough to receive today?",
        hint: "One choice, for today as it actually is.",
        select: "one",
        options: [
          { id: "tiny", label: "Name or notice it only" },
          { id: "small", label: "Let one sentence, comfort or moment remain briefly" },
          {
            id: "moderate",
            label: "Accept one small offer or form of care, only if it is already safe",
          },
          { id: "rehearse", label: "Keep receiving inward or symbolic today" },
          { id: "unclear", label: "I am not sure what amount fits" },
          { id: "none", label: "No amount feels available today" },
          { id: "private", label: "I would rather keep the amount private" },
        ],
      },
    ],
    practise: {
      heading: "Two ways to practise today",
      intro:
        "Both are written to work whether or not a direction was selected, and whether or not one is clear. Nothing in either path asks you to name anything you would rather keep private.",
      either:
        "Either, both, or neither. Reading only is complete, and stopping at any point is complete.",
      reflection: {
        title:
          "Reflection Practice — notice, name, check safety, choose an amount and receive",
        summary:
          "A brief practice for noticing the reflex around something already safe enough and receiving only an amount that preserves choice and boundaries.",
        steps: [
          "Choose the source named earlier, or use this sentence: ‘Care and boundaries can coexist.’ Reading only is available.",
          "Notice: what is the first reaction—softening, tension, dismissal, suspicion, a sense of debt, feeling undeserving, numbness, nothing noticeable or something else? No cause is inferred.",
          "Name: say privately, ‘When something good comes near, I notice…’ ‘I do not know’ is complete.",
          "Check safety: is this source already safe enough for this amount, without pressure, debt, disclosure or expanded access? If uncertain, do not proceed; use the sentence, an impersonal source or read-only.",
          "Choose the amount before going further: noticing or naming only; one sentence, comfort or moment for one brief pause; an inward rehearsal; or none. If the amount is unclear, stop here or use the read-only route.",
          "Stay and receive—only if workable: let the safe word, comfort or offer remain within that amount before dismissing it. This may mean reading one sentence twice, noticing a comfort, privately rehearsing ‘Thank you,’ ‘I can accept this much,’ or ‘Not yet,’ or imagining accepting only help already offered. No real contact is required.",
          "Reorient outward. Any reaction remains information, not proof of healing or readiness.",
        ],
        notRequired:
          "Gentler route: Notice and Name only. Read-only route: read the sequence without trying it. No trust, gratitude, vulnerability, contact, help acceptance, spiritual feeling or change is required.",
      },
      spiritual: {
        title: "Scripture & Spiritual Reflection — grace before performance",
        summary:
          "A Christian path from Zacchaeus’s story, where welcome comes before public change.",
        steps: [
          "Orient outward, then read the verses if you wish.",
          "Notice that Jesus sees, names and approaches Zacchaeus before Zacchaeus proves change.",
          "This story is not an instruction to ‘come down,’ trust a person, disclose, lower a boundary or remain in a religious setting that is harmful.",
          "Notice your response to the idea of unearned grace—comfort, tension, suspicion, anger, distance, longing, numbness or something else.",
          "If useful, pray: ‘Jesus, help me receive only what is loving, true and safe, without abandoning discernment.’ No feeling or answer is required.",
          "Reorient outward. Grace is not gullibility, obligation or the absence of accountability.",
        ],
        notRequired:
          "No prayer, no certainty, no disclosure, no outward step and no felt sense of accompaniment is required. Uncertainty about God does not exclude you, and you may leave this path entirely.",
        scripture: {
          reference: "Luke 19:5–6 (World English Bible)",
          body: "When Jesus came to the place, he looked up and saw him, and said to him, ‘Zacchaeus, hurry and come down, for today I must stay at your house.’ He hurried, came down, and received him joyfully.",
          note: "This describes one Gospel encounter in which welcome precedes public change. It is not a command to expose yourself, trust quickly, accept unsafe closeness or feel joyful.",
        },
      },
    },
    step: {
      id: "step",
      eyebrow: "One Honest Step",
      prompt: "What, if anything, feels like one honest step from today?",
      hint: "One choice if one fits. Small, reversible, and yours to change.",
      select: "one",
      options: [
        {
          id: "act",
          label: "Receive one small already-safe kindness, comfort or help—or offer myself one",
        },
        {
          id: "message",
          label: "Draft a brief acceptance or thank-you for help already offered; sending is optional",
          note: "Only where the offer is already safe enough. Sending nothing is complete.",
        },
        {
          id: "outside",
          label:
            "Let one accessible sound, object, view, word or piece of beauty register briefly",
        },
        { id: "own", label: "Give myself a few minutes of care not tied to duty or performance" },
        {
          id: "rehearse",
          label: "Privately rehearse: ‘Thank you,’ ‘I can accept this much,’ or ‘Not yet’",
        },
        { id: "unclear", label: "I am not sure what step fits" },
        { id: "none", label: "No step feels available, and I will not force one" },
        { id: "private", label: "I will keep the step private" },
      ],
    },
    reflection: {
      intro:
        "This stays with the source and amount you selected—or left open. It does not decide whether a person is safe, whether care was received or what your reaction means.",
      sections: [
        {
          id: "hearing",
          title: "The source you considered",
          from: "route",
          lines: {
            self: "You considered one fair or caring sentence from yourself. It may remain a possibility rather than something felt or believed.",
            body: "You considered one ordinary comfort or form of physical care. Whether it is available or helpful remains open.",
            reality:
              "You considered one neutral or pleasant part of the present. Noticing it would not deny what is painful or require gratitude.",
            values:
              "You considered one fair truth about dignity, worth or what matters. It does not have to feel fully believable.",
            creativity:
              "You considered beauty, music, words, learning or nature as a possible source of care. Receiving could mean noticing only; no response is expected.",
            person:
              "You considered kindness or help from a person you judge safe enough. This app cannot assess that judgment, and no contact, acceptance or expanded trust is implied.",
            community:
              "You considered support from a community, culture or tradition. Participation, disclosure, belonging or freedom from pressure is not being assumed.",
            god: "You considered grace or welcome from God within the Christian path. No prayer, certainty, trust or felt closeness is being attributed to you.",
            other:
              "You considered another possible source of care or goodness. It can remain private and undefined.",
            unclear:
              "No source felt clearly safe enough to name. Nothing will be selected or interpreted for you.",
            none: "You indicated that nothing feels safe or available to receive today. That limit is respected without explanation or pressure.",
            private:
              "You kept the possible source private. Its content, safety and meaning remain yours.",
          },
          unanswered:
            "You left the source open. No source, reaction or readiness to receive will be assumed.",
        },
        {
          id: "care",
          title: "Your pace and amount",
          from: "size",
          lines: {
            tiny: "You indicated naming or noticing only as the amount that might fit. This does not establish that it occurred.",
            small:
              "You considered letting one sentence, comfort or moment remain briefly. Nothing here says it landed or changed anything.",
            moderate:
              "You considered one small acceptance of care, only if already safe. No acceptance, contact or action is being attributed to you.",
            rehearse:
              "You considered keeping receiving inward or symbolic. No rehearsal, belief or emotional response is being assumed.",
            unclear: "You were not sure what amount might fit. Your pace remains undecided.",
            none: "You indicated that no amount feels available today. Nothing asks you to override that limit.",
            private:
              "You kept the possible amount private. No amount or action will be inferred.",
          },
          unanswered:
            "You left the amount open. No willingness, contact or receiving is being assumed.",
        },
        {
          id: "next",
          title: "One honest next step",
          from: "step",
          lines: {
            act: "You considered receiving one small already-safe kindness, comfort or help—or offering yourself one. No act is being claimed.",
            message:
              "You considered drafting a brief acceptance or thank-you for help already offered. Nothing is assumed to have been written or sent.",
            outside:
              "You considered letting one accessible sound, object, view, word or piece of beauty register briefly. No noticing or response is being claimed.",
            own: "You considered a few minutes of care not tied to duty or performance. Whether that time is available or used remains open.",
            rehearse:
              "You considered privately rehearsing ‘Thank you,’ ‘I can accept this much,’ or ‘Not yet.’ No rehearsal or future use is being attributed.",
            unclear: "You were not sure what step might fit. Nothing will be chosen for you.",
            none: "No step felt available or appropriate today. That is a complete way to leave the question.",
            private:
              "You kept the possible step private. Its content and whether anything occurred are not known.",
          },
          unanswered:
            "You left the step open. No practice, action or future intention is being assumed.",
        },
      ],
      closing:
        "Receiving one safe amount does not require receiving more. A protective reflex can be noticed without being judged or overridden. Care, discernment, accountability and boundaries can remain together.",
    },
    close: {
      heading: "Care without surrendering discernment",
      body: [
        "Today offered the question of whether one already-safe kindness, comfort, help or grace could remain for a small amount of time. Nothing here assumes that you trusted, received, contacted anyone or felt anything.",
        "Day 9 turns toward privately rehearsing one response that fits the route you choose.",
      ],
      carryForward: "I can receive only what is safe, true and mine to choose.",
    },
  },

  {
    day: 9,
    answerMeaningVersion: "v1",
    title: "Practise a Different Response",
    theme: "Trying one possible response privately, with safety and choice intact.",
    motif: "practise",
    shape: "standard",
    descriptor: "A small private rehearsal · about 12 minutes",
    arrive: {
      purpose:
        "Insight becomes more usable when a new response is practised before it is needed. Private rehearsal can reveal what fits, what needs changing and what support would make it safer.",
      lead: "A different response can be tried privately before you decide whether it belongs in real life.",
      body: [
        "A different response might be an outward pause, delaying an answer, a brief first-person sentence, preparing a limit or a request, orienting through whichever sense is available to you, speaking to yourself less harshly, naming grief privately, or preparing something without acting on it.",
        "Trying one of these privately does not mean the familiar response was defective, and it does not mean anything has to be used in real life. Nothing today asks for a conversation, a message, a disclosure, or any outward action.",
      ],
      settle: [
        "Settle in whatever position works for you, including standing, lying down, moving, or staying exactly as you are.",
        "If it helps, notice one neutral outward detail or point of orientation through any sense available to you — something seen, heard, touched, or simply known to be nearby.",
        "Attention to body or breath can be left alone entirely. No stillness, calm, sensation, movement, or settled feeling is required.",
        "You may simply read, and you may stop at any point. No particular feeling or response is required.",
      ],
    },
    understand: {
      label: "Listen",
      heading: "Rehearsal is a possibility, not a promise",
      body: [
        "A response is what someone does, says, delays, prepares, or chooses not to do when a familiar moment appears. Rehearsal means privately trying only the opening of one possible response — in silent words, in writing you will not send, or as a simple outline — without involving another person and without committing to use it.",
        "Rehearsing may clarify whether an option fits, how it might be worded, what conditions would matter, or what support would be needed. It cannot control what happens under pressure, and it does not prove readiness.",
        "Illness, disability, fatigue, dependence, caregiving, discrimination, coercion, differences in power, limited money or time, and real consequences may restrict what is safe or available. Preparation alone, or no outward action at all, can be the whole of this.",
      ],
      info: [
        {
          term: "What is a boundary, in plain terms?",
          explanation:
            "A boundary is a limit, decision, or action within your own control — not control over another person. It can include delaying an answer, declining, ending or leaving a situation only if that is safe and available to you, asking someone else to carry a message, requesting an accommodation, or deciding what you will take part in. Communicating or holding a boundary may require support, and it may not be safe in every context.",
        },
        {
          term: "What if no situation feels manageable?",
          explanation:
            "Reading, keeping everything general, or leaving it open is available. Please do not use the most dangerous, traumatic, overwhelming, or high-consequence moment in your life for this. A small, ordinary moment is enough, and none at all is also enough.",
        },
        {
          term: "What if safety or consequences are uncertain?",
          explanation:
            "This app cannot assess your particular situation. No outward practice is required here. Preparation, an accommodation, or help from a professional or trusted support may be wiser, and doing nothing outward may be wisest. If there is danger now, that belongs with real-world help — Support & Safety lists where to look.",
        },
      ],
    },
    questions: [
      {
        id: "practice",
        eyebrow: "Choose",
        prompt: "What, if anything, would you like to rehearse in a private, contained way?",
        hint: "One choice if one fits. The shared practice can also simply be read, without choosing anything.",
        select: "one",
        options: [
          { id: "grounding", label: "A pause, and orienting outward before responding" },
          { id: "unsent", label: "Putting private words to what I feel or need" },
          { id: "boundary", label: "Rehearsing a limit, or a delay before answering" },
          { id: "support", label: "Rehearsing asking for one kind of support" },
          { id: "lament", label: "Naming grief, anger, disappointment, or longing privately" },
          { id: "prepare", label: "Preparing something without deciding to act" },
          { id: "loosen", label: "Trying a very small variation in a familiar response" },
          { id: "unclear", label: "I am not sure what I would practise" },
          { id: "none", label: "No different response feels available today" },
          { id: "private", label: "I have one in mind and prefer to keep it private" },
        ],
        echo: {
          heading: "Room for what is clear — and what is not",
          byOption: {
            grounding:
              "A pause and orienting outward was selected. That says nothing about whether escalation is present, what would happen if you paused, or whether pausing will be available when it matters.",
            unsent:
              "Putting private words to what you feel or need was selected. Nothing here establishes what those words are, that they have needed saying, or that they will ever be shared.",
            boundary:
              "Rehearsing a limit or a delay was selected. This does not establish whether a limit is overdue, safe, available, or ready for use in real life.",
            support:
              "Rehearsing asking for one kind of support was selected. No person, disclosure, or request is identified here, and none is required.",
            lament:
              "Naming grief, anger, disappointment, or longing privately was selected. No history, cause, or required emotional release is assumed.",
            prepare:
              "Preparing without deciding to act was selected. Preparation is complete in itself, and no decision follows from it here.",
            loosen:
              "A very small variation in a familiar response was selected. No old pattern, reason, or outcome is inferred from that.",
            unclear:
              "Not being sure what you would practise was selected, and that uncertainty is left as it is. Nothing will be chosen on your behalf.",
            none:
              "That no different response feels available today was selected, and that absence is left intact. No explanation or pressure is added.",
            private:
              "A private choice was selected. What it refers to stays with you and is not collected here.",
          },
          unanswered:
            "No response was selected here. The shared practice ahead does not depend on a choice and may simply be read; nothing will be chosen or inferred on your behalf.",
          closing:
            "Anything here can stay private, be revised later, be set aside, or never be used at all.",
        },
      },
      {
        id: "where",
        eyebrow: "Locate",
        prompt: "Which setting or settings, if any, came to mind?",
        hint: "Choose any that fit. The practice can also stay general, or stay private.",
        select: "many",
        options: [
          { id: "home", label: "At home" },
          { id: "work", label: "At work" },
          { id: "family", label: "With family" },
          { id: "friend", label: "With a friend or partner" },
          { id: "self", label: "In how I speak to myself" },
          { id: "faith", label: "In my faith or spiritual life" },
          { id: "private", label: "I would rather not specify", exclusive: true },
          { id: "other", label: "Somewhere else, not listed here" },
          { id: "unclear", label: "I am not sure", exclusive: true },
          { id: "none", label: "No particular setting", exclusive: true },
        ],
      },
    ],
    practise: {
      heading: "Two ways to rehearse without committing to act",
      intro:
        "You do not need a clear response or setting to read or use either path. Everything may stay general, private, unclear, or unanswered.",
      either:
        "You may use either path, both paths, or neither. You may simply read, stop at any point, or leave the exercise unfinished.",
      /**
       * Routed practice: the substantive Reflection Practice shown on Day 9 follows
       * the single rehearsal the person chose on q.practice. Unclear, none, private,
       * unanswered, unknown or multiple selections use the base fallback path below.
       * The Christian path is shared and remains opt-in.
       */
      route: {
        from: "practice",
        reflectionByOption: {
          grounding: {
              title: "Private Rehearsal — pause and orient outward",
              summary:
                "A brief rehearsal of making one moment of space before responding, without relying on breath or body awareness and without deciding to use it in real life.",
              steps: [
                "Orient outward to one neutral detail available through any comfortable sense. Reading only is available.",
                "Use one manageable, ordinary moment, or keep the situation general. Do not use a dangerous, traumatic, overwhelming or high-consequence situation.",
                "If it is clear, name the familiar first impulse in a few words—answer quickly, agree, withdraw, go blank, become harsh, or something else. No cause is needed.",
                "Privately rehearse one opening: ‘I do not have to answer this second,’ or ‘I can pause before I respond.’ If pausing could increase risk, keep this private or set it aside.",
                "Choose one outward cue that could mark the pause: a colour, sound, object, written word or known point in the room. No calm or bodily change is required.",
                "Try only that opening once in silent words or unsent writing. Do not replay the scene or imagine another person’s response.",
                "Call the possibility usable, incomplete, unclear, unavailable or unwise; name any condition that would matter, then reorient outward.",
              ],
              notRequired:
                "No real-world pause, confrontation, disclosure, contact, breath change, calm, successful use, changed feeling or outcome is required. If pausing may be unsafe, do not test it.",
            },
          unsent: {
              title: "Private Rehearsal — put one feeling or need into words",
              summary:
                "One or two private sentences that name what may be present, without explaining the history or preparing a disclosure.",
              steps: [
                "Orient outward to one neutral detail. Reading only is available.",
                "Use one manageable feeling or need from an ordinary moment, or keep everything general. No event, person, history or identifying detail is needed.",
                "Choose one broad word if one fits—sad, angry, afraid, ashamed, lonely, tired, relieved, hopeful, unsure—or keep the word private.",
                "Privately complete one line: ‘I feel…’ or ‘Something in me feels…’ ‘I do not know’ is complete.",
                "Only if useful, add one line: ‘What I need or hope for is…’ The answer may be rest, time, information, support, a limit, practical help, acknowledgment, or ‘unclear.’",
                "Let the line remain private. It does not need to sound polished, fair to everyone, shareable or complete.",
                "Call the wording usable, incomplete, unclear, unavailable or unwise, then reorient outward. It may be revised or discarded.",
              ],
              notRequired:
                "No detailed story, emotional intensification, journalling, saving, disclosure, message, conversation, explanation, resolution, relief or action is required.",
            },
          boundary: {
              title: "Private Rehearsal — a limit or a delay",
              summary:
                "A private opening sentence for a limit within your control, with consequences, power and safety left fully in view.",
              steps: [
                "Orient outward to one neutral detail. Reading only is available.",
                "Use a manageable, lower-consequence situation or keep it general. Do not use a situation involving likely retaliation, coercion, violence or immediate danger.",
                "Choose only a limit within your control: delaying your answer, declining, limiting what you will do, requesting an accommodation, or ending a conversation only if that is safe and available.",
                "Choose or adapt one opening: ‘I need time before I answer.’ ‘I am not available for that.’ ‘I can do X, not Y.’ ‘I can continue only if this stays respectful.’",
                "If no sentence fits, leave it blank or use: ‘I need more time to decide what is possible.’",
                "Read the opening once silently or in unsent writing. Do not rehearse the other person’s reply or a whole confrontation.",
                "Call it usable, incomplete, unclear, unavailable or unwise; name any support, safer condition or ability to stop that would matter, then reorient outward.",
              ],
              notRequired:
                "No communication, confrontation, refusal, departure, disclosure, contact, enforcement, forgiveness, reconciliation, real-world test or decision is required. This app cannot decide whether a boundary is safe.",
            },
          support: {
              title: "Private Rehearsal — one specific request for support",
              summary:
                "A private draft of one bounded request, without deciding who is safe, making contact or assuming help is available.",
              steps: [
                "Orient outward to one neutral detail. Reading only is available.",
                "Choose one manageable practical or emotional need, or keep it general. Do not use the highest-risk or most urgent situation for this rehearsal.",
                "If a person comes to mind, consider only someone who has consistently respected your limits. This app cannot assess that person. ‘No one safe or available’ is a valid answer.",
                "Privately begin: ‘Would you be willing to…?’ or ‘Could you help by…?’",
                "Make the possible request specific and bounded: one check-in, one task, one piece of information, one appointment, one period of company, or one kind of practical help.",
                "Read the sentence once silently or keep it as unsent writing. Nothing must be sent, said or promised.",
                "Call it usable, incomplete, unclear, unavailable or unwise; name another kind of support or condition if needed, then reorient outward.",
              ],
              notRequired:
                "No person, disclosure, request, contact, trust, acceptance of help, gratitude, reply, availability or outcome is required. Difficulty finding support is not a personal failure.",
            },
          lament: {
              title: "Private Rehearsal — one plain line of lament",
              summary:
                "A contained way to give grief, anger, disappointment or longing one honest line, without telling the whole story or forcing release.",
              steps: [
                "Orient outward to one neutral detail. Reading only is available.",
                "Stay with one manageable edge of what is present, or keep it general. Do not enter the most overwhelming event, loss or history.",
                "Choose one broad feeling or form of pain if one fits—grief, anger, disappointment, longing, hurt, confusion—or leave it unnamed.",
                "Privately use one line only: ‘This hurts.’ ‘I am grieving…’ ‘I am angry about…’ ‘I wish…’ or ‘What I need is…’",
                "Only if it remains workable, add one second line: ‘What I wish were different is…’ or ‘What I need today is…’ ‘I do not know’ is complete.",
                "Stop there. Do not search for a lesson, gratitude, forgiveness, a reason, a complete account or a hopeful ending.",
                "If you feel more stirred, stop and orient outward. Otherwise call the line usable, incomplete, unclear, unavailable or unwise, then reorient outward.",
              ],
              notRequired:
                "No detailed memory, explanation, tears, emotional release, forgiveness, gratitude, hope, spiritual meaning, sharing, saving or resolution is required. Anger may be named without being acted on.",
            },
          prepare: {
              title: "Private Rehearsal — prepare without deciding",
              summary:
                "A short private outline that separates preparation from commitment, scheduling, contact or action.",
              steps: [
                "Orient outward to one neutral detail. Reading only is available.",
                "Choose one manageable possibility to prepare for, or keep it general. No name, date, place or identifying detail is needed.",
                "Privately complete: ‘One response I may want available is…’ This is a possibility, not a decision.",
                "Make a three-line outline: ‘My opening might be…’ ‘Before this, I would need…’ ‘I would stop or pause if…’",
                "Name one practical condition that could matter: time, privacy, information, support, an accommodation, another person carrying a message, the ability to leave, or safer circumstances.",
                "Read the outline once. Call it usable, incomplete, unclear, unavailable or unwise. Do not schedule, send or test it.",
                "Keep it private, revise it, discard it or leave it unfinished, then reorient outward.",
              ],
              notRequired:
                "No decision, deadline, plan completion, contact, disclosure, conversation, commitment, real-world test, readiness, confidence or action is required.",
            },
          loosen: {
              title: "Private Rehearsal — a five-percent variation",
              summary:
                "A very small, reversible variation in a familiar response, practised only as an opening and without treating the familiar response as defective.",
              steps: [
                "Orient outward to one neutral detail. Reading only is available.",
                "Use one ordinary, lower-consequence moment or keep it general. Do not use a dangerous, traumatic, overwhelming or high-consequence situation.",
                "If clear, name the familiar response in a few words without judging it or explaining its origin. If unclear, leave it unnamed.",
                "Choose a variation small enough to remain reversible: answer later, use one fairer sentence, ask for clarification, say one need privately, reduce one task, or do nothing outward.",
                "Privately rehearse only the opening once—in silent words, unsent writing or a simple outline. Do not replay a whole scene.",
                "Ask whether the variation seems usable, incomplete, unclear, unavailable or unwise—not whether it is better, braver or more healed.",
                "Name any condition that would make it safer or more realistic, then reorient outward. The variation may be revised or discarded.",
              ],
              notRequired:
                "No interruption of an old pattern, real-world experiment, risk, disclosure, contact, successful use, changed feeling, progress or outcome is required.",
            },
        },
      },
      reflection: {
        title: "Reflection Practice — leave the route open",
        summary:
          "A read-only safety frame that keeps an unclear, unavailable or private response from being chosen or interpreted by the app.",
        steps: [
          "Orient outward to one neutral detail, or simply read.",
          "Your route may remain unclear, unavailable, private or unanswered. Nothing will be chosen on your behalf.",
          "If you already have a private possibility, you do not need to reveal it. Keep only its opening in mind, or leave it entirely alone.",
          "Any possible rehearsal should concern a manageable ordinary moment, remain within your control, involve no real contact, and stop before a whole scene develops.",
          "If safety, consequences or fit are uncertain, read only or stop.",
          "If useful, call the possibility usable, incomplete, unclear, unavailable or unwise. No answer is required.",
          "Reorient outward. Nothing needs to follow.",
        ],
        notRequired:
          "No route, private content, rehearsal, decision, disclosure, contact, explanation, insight, readiness or outcome is required.",
      },
      spiritual: {
        title: "Scripture & Spiritual Reflection — honesty before God without a promise",
        summary:
          "A Christian path for holding one manageable concern and one possible response before God, without treating Scripture or prayer as a command, prediction or plan.",
        steps: [
          "Orient outward in any accessible way. Reading only is available.",
          "Read Psalm 62:8 below only if you wish. Its language of trust and refuge is not a demand to feel trust or safety.",
          "Bring one manageable concern, keep it general, or bring nothing in particular. Leave aside anything dangerous, traumatic, overwhelming or high-risk.",
          "If words fit, use one plain line: ‘God, this is what is true right now…’ Silence, uncertainty, anger, grief, numbness or no prayer are also allowed.",
          "Name one possible response only as a possibility: a pause, private words, a prepared limit or request, lament, preparation, a small variation, or nothing outward.",
          "If useful, ask for wisdom about safety, timing, support, accommodation and what is or is not yours to do. Prayer does not replace practical care or planning.",
          "Reorient outward. No response becomes a vow, divine direction or proof of faith, and no relief, trust, closeness or action is required.",
        ],
        notRequired:
          "No prayer, trust on command, confession, forgiveness, reconciliation, disclosure, contact, real-world test, spiritual feeling, answer, relief, decision or action is required. You may leave this path entirely.",
        scripture: {
          reference: "Psalm 62:8 (World English Bible)",
          body: "Trust in him at all times, you people. Pour out your heart before him. God is a refuge for us. Selah.",
          note: "This is the psalmist’s invitation to speak honestly. It does not explain suffering, declare a person or situation safe, require trust on command, promise that refuge will be felt, or turn a possible response into divine direction.",
        },
      },
    },
    step: {
      id: "step",
      eyebrow: "One Honest Step",
      prompt: "How, if at all, would you like to leave this practice?",
      hint: "You may choose one if it fits, simply read, or leave this open.",
      select: "one",
      options: [
        { id: "again", label: "Read one possible response, or try its opening once, privately" },
        { id: "sentence", label: "Shorten or revise one possible sentence until it sounds like me" },
        { id: "use", label: "Name what would have to be true before any real-world use" },
        { id: "ground", label: "Keep one accessible outward-orienting cue" },
        {
          id: "support",
          label:
            "Identify support I might want before any real-world action — no contact or disclosure today",
        },
        { id: "prepare", label: "Leave the exercise here, with nothing more required" },
        { id: "unclear", label: "I am not sure" },
        { id: "none", label: "No step feels right today" },
        { id: "private", label: "I have one in mind and prefer to keep it private" },
      ],
    },
    reflection: {
      intro:
        "This reflection stays close to what you chose\u2014or left open\u2014today. It holds the practice as a possibility, never a promise or an instruction to use it.",
      sections: [
        {
          id: "hearing",
          title: "A possible response",
          from: "practice",
          lines: {
            grounding:
              "You considered pausing and orienting outward. Whether that cue is reachable under pressure remains open.",
            unsent:
              "You considered putting private words to what you feel or need. The words stay private, and nothing has to be shared.",
            boundary:
              "You considered rehearsing a limit or delay. This reflection cannot decide whether using it would be safe or available in real life, and no use is required.",
            support:
              "You considered rehearsing one request for support. No person, disclosure, or action is required.",
            lament:
              "You considered privately naming grief, anger, disappointment, or longing. The feeling does not need to be explained, released, or resolved.",
            prepare:
              "You considered preparing without deciding to act. Preparation can remain complete in itself.",
            loosen:
              "You considered one very small variation in a familiar response. It remains a possibility, with no outcome promised.",
            unclear:
              "You are not sure what to practise. The possibility can remain open without a response being chosen for you.",
            none:
              "No different response felt available today. That is not a failure, and nothing asks you to manufacture one.",
            private: "You kept the response private. That boundary is respected.",
          },
          unanswered:
            "You left the response open. No rehearsal or need is being presumed.",
        },
        {
          id: "underneath",
          title: "The setting, if any",
          from: "where",
          lines: {
            home:
              "Home was the setting that came to mind. The people and circumstances involved remain private.",
            work:
              "Work came to mind. Power, consequences, accommodation, and safety remain real considerations that this reflection cannot decide.",
            family:
              "Family came to mind. No closeness, conflict, safety, or history is presumed.",
            friend:
              "A friend or partner came to mind. No closeness, conflict, safety, or history is presumed.",
            self:
              "How you speak to yourself came to mind. It can be noticed without assigning a cause or label.",
            faith:
              "Faith or spiritual life came to mind. Belief, practice, community, struggle, and whether honesty feels welcome all remain open.",
            private: "You kept the setting private. That boundary is respected.",
            other:
              "A setting outside the list came to mind. You do not need to identify it here.",
            unclear: "The setting is not clear. It can remain unclear.",
            none: "No particular setting came to mind. The rehearsal can stay general.",
          },
          unanswered:
            "You left the setting open. No person, relationship, risk, or context is being filled in.",
        },
        {
          id: "care",
          title: "Before anything leaves the page",
          opening:
            "The possibilities on this page are private possibilities, not a plan. This app does not store whether any practice was attempted, so this reflection does not claim that you rehearsed anything. Safety, access under pressure, consequences and needed support remain open.",
          unanswered:
            "Whatever this page held, it remains a private possibility rather than a plan, and nothing is being attributed to you.",
        },
        {
          id: "next",
          title: "How the practice was left",
          from: "step",
          lines: {
            again:
              "You considered reading or privately trying the opening of one response. Nothing outward has to follow.",
            sentence:
              "You considered shortening or revising one sentence. It never has to be spoken.",
            use: "You considered what would need to be true before any real-world use. Naming conditions does not commit you to action.",
            ground:
              "You considered keeping one accessible outward cue. Whether you use it later remains entirely yours.",
            support:
              "You considered identifying support before any real-world action. No contact or disclosure is required.",
            prepare:
              "You chose to leave the exercise here. Nothing more is required.",
            unclear: "You are not sure what step fits. It can remain undecided.",
            none: "No step felt right today. That is a complete way to leave the practice.",
            private: "You kept the step private. It remains yours.",
          },
          unanswered:
            "You left the step open. No rehearsal, action, or future response is being assumed.",
        },

      ],
      closing:
        "A rehearsal is a possibility, not a contract. It does not explain how a familiar response began, make another response safe, or promise access under pressure. Whether you tried something, kept it private, or left it open, you remain free to revise it, seek support, or set it down.",
    },
    close: {
      heading: "Possibility, not a promise",
      body: [
        "Whether you rehearsed a response, read the practice, kept your response private, or left everything open, no real-world action was required, and none is required now.",
        "A private rehearsal may make one option feel more familiar, may show that it needs revising or needs support, or may leave it unavailable for now. It does not guarantee access under pressure, and it does not make a situation safe.",
        "Day 10 gathers what may be worth keeping, what remains unfinished, and what support or next step, if any, fits your actual life.",
      ],
      carryForward: "I can rehearse a possibility without promising to use it.",
    },
  },

  {
    day: 10,
    answerMeaningVersion: "v1",
    title: "Carry It Forward",
    theme:
      "Integration and a complete stopping place without manufactured progress, forced closure, or required action.",
    motif: "carry",
    shape: "notice-first",
    descriptor: "Gathering the journey · about 15 minutes",
    arrive: {
      purpose:
        "Looking back can reveal a thread: what you noticed, what protected you, what it cost, what matters now and what step may come next. Integration does not mean everything is resolved.",
      lead: "This is the last day of the First Journey. It completes a ten-day container without claiming that your healing is complete.",
      body: [
        "You may have moved through every day or only some, mainly read, kept things private, left questions unanswered, or arrived here directly. No one path is treated here as more complete than another.",
        "You may feel changed, unchanged, unsettled, clearer, uncertain, or nothing in particular. Today does not decide what this journey means for you, and no clear meaning is required.",
        "Today offers room to gather one thread if there is one, to leave one unfinished place acknowledged if that is useful, and to choose how much—if anything—to carry beyond the page.",
        "Reaching this page does not have to prove healing, readiness, insight, attention, courage, or progress.",
      ],
      settle: [
        "Any position that works is fine, including continuing to move as you are.",
        "If you would like to, let your attention rest on one neutral detail nearby through any sense that is comfortable and available to you. Simply reading is complete.",
        "Nothing about sitting, seeing, touching, inward bodily attention, posture, or breathing needs to change, and no relaxation, calm, gratitude, emotional response, or sense of closure is required.",
      ],
    },
    understand: {
      label: "Listen",
      heading: "A journey can be complete while healing remains unfinished",
      body: [
        "Integration means allowing pieces of experience to sit in a more workable relationship: named, grieved, supported, bounded, responded to where safe, or left open. It does not require a clear insight, feeling or result.",
        "New life here does not mean returning to an untouched earlier self or calling harm good. It may mean relating to the same story, loss, question or circumstance with more truth, care, support, boundaries, grief or room for hope.",
        "Some things may change; some may involve specific responsibility, support, accommodation, advocacy, resistance, mourning, safer conditions or time; some may remain unresolved. Illness, disability, caregiving, discrimination, financial pressure, differences in power, limited resources and other people’s choices are not undone by an app. Carrying forward can also mean waiting or leaving the journey here.",
      ],
      info: [

        {
          term: "What if nothing changed?",
          explanation:
            "No change or insight has to be manufactured. This remains a complete stopping place exactly as it is.",
        },
        {
          term: "What if I feel more unsettled?",
          explanation:
            "This app cannot determine why distress increased, and worsening is not treated here as a necessary phase of healing. You may stop or step away. If distress persists, worsens, disrupts daily life, or raises safety concerns, consider seeking appropriate real-world care. For urgent or immediate safety concerns, Support & Safety lists available options.",
        },
        {
          term: "Do I have to continue after this?",
          explanation:
            "No. The First Journey is complete here. Returning to a day, or continuing anything elsewhere, is entirely optional. This remains a complete stopping place whether or not you return.",
        },
      ],
    },
    questions: [
      {
        id: "different",
        eyebrow: "Gather",
        prompt: "Which idea from this journey, if any, feels worth keeping near?",
        hint: "You may choose as many as fit, one, or none. You may also note that nothing feels settled, choose uncertainty or privacy, or continue without answering.",
        select: "many",
        options: [
          {
            id: "protective",
            label:
              "A familiar response may have helped me cope, even if I do not know why",
          },
          {
            id: "named",
            label: "Putting words to something may change how I relate to it",
          },
          { id: "twopulls", label: "More than one pull or truth can be present at once" },
          {
            id: "cost",
            label: "Noticing a possible cost is not the same as blaming myself",
          },
          { id: "harsh", label: "Truth and responsibility do not require self-attack" },
          {
            id: "small",
            label: "A small or preparatory response can matter without proving progress",
          },
          {
            id: "notalone",
            label:
              "Some things may need support or safer conditions, not more effort from me",
          },
          {
            id: "nothing",
            label: "Nothing feels settled or complete, even if an idea resonates",
          },
          {
            id: "unclear",
            label: "I am not sure what, if anything, I want to carry forward",
            exclusive: true,
          },
          {
            id: "private",
            label: "I would rather keep this private today",
            exclusive: true,
          },
        ],
        echo: {
          heading: "What may be worth keeping — or leaving here",
          byOption: {
            protective:
              "You kept near the possibility that a familiar response may have helped you cope. Nothing here tells us where it came from, what it protected, or whether it still helps.",
            named:
              "One idea you chose to keep near is that putting words to something may change how you relate to it. That does not establish that anything has become lighter or easier.",
            twopulls:
              "You kept near the idea that more than one pull or truth can be present at once. This cannot tell us that any particular conflict is alive in you now.",
            cost:
              "You kept near the idea that noticing a possible cost is not the same as blaming yourself. Nothing here tells us what any cost is, what caused it, or where blame belongs.",
            harsh:
              "You kept near the idea that truth and responsibility do not require self-attack. That does not establish how you speak to yourself, and honest accountability remains possible.",
            small:
              "One idea you chose to keep near is that a small or preparatory response can matter without proving progress. This cannot tell us that any step has happened.",
            notalone:
              "You kept near the idea that some things may need support or safer conditions rather than more effort from you. Nothing here tells us what support exists, who is safe, or what you can reach.",
            nothing:
              "You noted that nothing feels settled or complete right now, even if an idea resonates. An idea may resonate without becoming a finished outcome, a commitment, or a clear thing to carry forward, and that can sit beside anything else you kept near.",
            unclear:
              "You noted that you are not sure what, if anything, you want to carry forward. Uncertainty stays uncertainty here, with no hidden meaning read into it.",
            private:
              "You chose to keep this private. What you held privately remains yours, and its content is not known or interpreted here.",
          },
          unanswered:
            "You continued without selecting a thread. Nothing will be chosen, interpreted, or summarised on your behalf.",
          closing:
            "A thread may be kept, revised, set down, or left unclear. None becomes a promise or proof of change.",
        },
      },
      {
        id: "unfinished",
        eyebrow: "Name",
        prompt: "What, if anything, remains open or may deserve care beyond today?",
        hint: "You may choose as many as fit, one, or none. Naming something does not require resolving it, and you may leave it unclear, outside your control, private, or unanswered.",
        select: "many",
        options: [
          { id: "grief", label: "Grief, loss, or mourning that may need more room or support" },
          {
            id: "relationship",
            label:
              "Something relational that remains unresolved; no contact or reconciliation is required",
          },
          {
            id: "limit",
            label:
              "A limit, boundary, or condition I may need to consider—only if safe and available",
          },
          {
            id: "support",
            label:
              "Support, accommodation, advocacy, or practical care that is not yet in place",
          },
          { id: "self", label: "How I relate to myself when things are difficult" },
          { id: "faith", label: "Questions about faith, God, meaning, or belonging" },
          {
            id: "rest",
            label:
              "Rest, reduced demand, or recovery time that may not be available enough",
          },
          {
            id: "unclear",
            label: "Something remains open, but I cannot or do not want to name it",
            exclusive: true,
          },
          {
            id: "outside",
            label: "What remains is mostly outside my control or influence",
            exclusive: true,
          },
          {
            id: "none",
            label: "Nothing in particular feels unfinished today",
            exclusive: true,
          },
          {
            id: "private",
            label: "I would rather keep this private today",
            exclusive: true,
          },
        ],
      },
    ],
    practise: {
      heading: "Two ways to gather without forcing closure",
      intro:
        "You can use either path without repeating or explaining anything you chose. Uncertainty, privacy, or no selection can remain.",
      either:
        "You may use either path, both paths, or neither. You may simply read, stop at any point, or leave the practice unfinished.",
      reflection: {
        title:
          "Integration Practice — what to keep, what to leave open, and what may support you",
        summary:
          "A plain, unhurried way to gather one possible thread, leave one place unfinished, and notice what might support the pace—without deciding anything.",
        steps: [
          "Let your attention rest, if you would like to, on one neutral detail available through any sense that is comfortable for you. No touch, posture change, breathing change, bodily sensation, visualisation, or calm is required.",
          "Look back only as broadly as is workable today. You might use an idea you selected, something you held privately, uncertainty, or nothing in particular. You may stop after reading this step.",
          "Privately complete, or simply consider, this line: “One thing I may want to keep near is…” “Nothing clear” is a complete response.",
          "Then, if it is useful: “One thing I can let remain unfinished is…” It may stay unnamed, or it may be something outside your influence.",
          "Then, if it is useful: “What may help protect the pace is…” Possibilities may include time, grief, rest, support, accommodation, advocacy, a boundary, safer conditions, waiting, or no action at all. There is no need to invent something that is not available to you.",
          "If any line becomes pressuring, unsafe, false, or unavailable, revise it, cross it out mentally or in writing, or set it down. No line has to be kept.",
          "If you would like to, name one possible return point—a day, a sentence, a practice, a question, or a possible source of support—without scheduling it, promising it, or acting on it. Then let your attention return outward. No closure or particular feeling is required.",
        ],
        notRequired:
          "Not required: writing, saving, disclosure, contact, conversation, reconciliation, forgiveness, action, a schedule, a commitment, a daily practice, insight, emotional release, hope, relief, progress, or any outcome. If distress grows, you may stop, reorient outward, or seek support.",
      },
      spiritual: {
        title: "Scripture & Spiritual Reflection — companionship on an unfinished road",
        summary:
          "A Christian path from the road to Emmaus, where questioning and companionship are present before recognition or resolution.",
        steps: [
          "Orient outward in any accessible way. Reading only is available.",
          "Read Luke 24:15 below only if you wish.",
          "Notice that the walkers are still talking and questioning; the road is unfinished, and recognition or explanation has not yet arrived.",
          "If useful, name one unfinished question, grief or responsibility privately or keep it general. No full story or conclusion is needed.",
          "If prayer fits, you might pray: ‘Jesus, meet what is unfinished with truth, care and wisdom. Give me wisdom about what is mine, what may need safe or practical support, and what can remain unfinished.’ No response, answer or feeling is required.",
          "If useful, consider practical care, support, accommodation, advocacy, a boundary, mourning, waiting or no action. Prayer does not replace practical care or planning.",
          "Reorient outward. The verse may remain words on a page; no recognition, meaning, closure, peace or felt presence is required.",
        ],
        notRequired:
          "No prayer, profession of faith, certainty, disclosure, surrender of safety or boundaries, forgiveness, reconciliation, contact, action, spiritual experience, changed circumstances, recognition, meaning, relief, peace, closure or continuation is required. You may leave this path entirely.",
        scripture: {
          reference: "Luke 24:15 (World English Bible)",
          body: "While they talked and questioned together, Jesus himself came near, and went with them.",
          note: "This verse depicts Jesus joining two people amid their questions, before they recognise him or reach an explanation. It is not a promise of felt nearness, recognition, meaning, closure, peace or continuation.",
        },
      },

    },
    step: {
      id: "step",
      eyebrow: "One Honest Step",
      prompt: "How, if at all, would you like to leave this First Journey?",
      hint: "Choose one if one fits, simply read, or leave this open. No outward action is required.",
      select: "one",
      options: [
        {
          id: "support",
          label:
            "Identify one kind of support, accommodation, advocacy, or practical care I might consider; no contact required",
          note: "Support that is unavailable or hard to access is not a personal failure.",
        },
        {
          id: "conversation",
          label:
            "Prepare one sentence I might share with someone reasonably safe; nothing must be sent or said",
          note: "This app cannot decide whether anyone is safe. If you are uncertain, keeping it private or choosing another option is reasonable.",
        },
        {
          id: "limit",
          label: "Name one limit or condition I may want to consider; no action is required",
        },
        {
          id: "rest",
          label: "Identify one realistic form of rest or reduced demand—if available",
        },
        {
          id: "kind",
          label: "Keep one fair sentence for a difficult moment, without a daily promise",
        },
        {
          id: "revisit",
          label: "Choose one day or practice I may return to; nothing needs to be scheduled",
        },
        {
          id: "prepare",
          label: "Let the journey end here with nothing outward required",
        },
        {
          id: "unavailable",
          label: "A step may matter, but none feels safe or available now",
          exclusive: true,
        },
        {
          id: "unclear",
          label: "I am not sure how I want to leave this",
          exclusive: true,
        },
        {
          id: "none",
          label: "No next step feels right or needed today",
          exclusive: true,
        },
        {
          id: "private",
          label: "I would rather keep this private today",
          exclusive: true,
        },
      ],
    },
    reflection: {
      intro:
        "This reflection stays with what you chose\u2014or left open\u2014today. It offers a gentle gathering, not a verdict on what the journey meant or whether anything changed.",
      sections: [
        {
          id: "hearing",
          title: "What you may carry",
          from: "different",
          lines: {
            protective:
              "You kept near the possibility that a familiar response may have helped you cope. Its beginnings, what it protected, and whether it still helps remain open; no danger or history is being assumed.",
            named:
              "You kept near the idea that putting words to something can change how you relate to it. No relief or clarity has to be claimed for that idea to matter to you.",
            twopulls:
              "You kept near the idea that more than one pull or truth can be present at once. It can remain useful without defining any particular conflict in you.",
            cost:
              "You kept near the idea that noticing a possible cost is not the same as blaming yourself. Cause, choice, responsibility, and blame can remain specific, complex, or unclear.",
            harsh:
              "You kept near the idea that truth and responsibility do not require self-attack. Accountability remains possible without turning your whole self into the problem.",
            small:
              "You kept near the idea that a small or preparatory response can matter without proving progress. The idea can remain meaningful without this app claiming that a step happened.",
            notalone:
              "You kept near the idea that some things may need support or safer conditions rather than more effort from you. What support is safe or reachable remains an honest practical question\u2014not a measure of your worth.",
            nothing:
              "You noted that nothing feels settled or complete, even if an idea resonates. Resonance does not have to become an outcome, commitment, or promise.",
            unclear:
              "You are not sure what, if anything, you want to carry forward. Uncertainty is a complete way to arrive at this ending.",
            private:
              "You kept what you may carry private. That boundary is respected; it remains yours.",
          },
          unanswered:
            "You left this open. Nothing needs to be chosen for the journey to have a complete stopping place.",
        },
        {
          id: "care",
          title: "What can remain unfinished",
          from: "unfinished",
          lines: {
            grief:
              "You named grief, loss, or mourning as still open. It can deserve care without being explained or turned into an assignment.",
            relationship:
              "You named something relational that remains unresolved. Nothing here requires contact, reconciliation, forgiveness, or action; this reflection cannot decide whether contact would be safe.",
            limit:
              "You named a limit, boundary, or condition that may need consideration. Whether it is safe, available, or within your control can remain open.",
            support:
              "You named support, accommodation, advocacy, or practical care that is not yet in place. Difficulty reaching care is not a personal failure.",
            self:
              "You named how you relate to yourself in difficulty as still open. It can be met with care without requiring a particular compassionate feeling or outcome.",
            faith:
              "You named questions about faith, God, meaning, or belonging as still open. They are allowed to remain questions; no prayer or spiritual resolution is required.",
            rest:
              "You named rest, reduced demand, or recovery time as something still open. Rest may not be available to you, and that is not a fault of yours.",
            unclear:
              "Something remains open that you cannot or do not want to name. It can remain private and unfinished without pressure to surface later.",
            outside:
              "You noted that what remains is mostly outside your control or influence. That limit is respected here, and responsibility is not handed back to you.",
            none:
              "Nothing in particular feels unfinished today. That answer is complete as it is.",
            private:
              "You kept the unfinished place private. That boundary is respected.",
          },
          unanswered: "You left this open. Nothing needs to be added.",
        },
        {
          id: "next",
          title: "How you are leaving the journey",
          from: "step",
          lines: {
            support:
              "You considered identifying one kind of support, accommodation, advocacy or practical care. No kind of support, contact or availability is being attributed to you.",
            conversation:
              "You considered preparing one sentence you might share. Nothing is assumed to have been prepared, sent or said, and this reflection cannot decide whether sharing would be safe.",
            limit:
              "You considered naming one limit or condition. No limit, action, safety or availability is being attributed to you.",
            rest:
              "You considered one realistic form of rest or reduced demand, if available. No rest or availability is being assumed.",
            kind:
              "You considered keeping one fair sentence available for a difficult moment. No sentence, practice or future use is being attributed to you.",
            revisit:
              "You considered returning to one day or practice. Nothing is assumed to have been chosen, scheduled or owed.",
            prepare:
              "You considered letting the journey end here with nothing outward required. No action or feeling is being attributed.",

            unavailable:
              "A step may matter, but none feels safe or available now. That limit is respected; you are not being asked to override it.",
            unclear:
              "You are not sure how you want to leave this. The journey can still end gently without an answer.",
            none:
              "No next step feels right or needed today. The journey can be complete without one.",
            private:
              "You kept how you are leaving private. That boundary is respected.",
          },
          unanswered:
            "You did not choose a next step. The journey can end here without one.",
        },
      ],
      closing:
        "Whatever you chose—or left open—does not have to prove progress, readiness, safety, or what comes next. Whatever you could name—or could not name—matters. You deserve to be met with care without having to prove that it is serious enough.",

    },
    close: {
      heading: "A complete stopping place",
      body: [
        "You may have answered, kept things private, simply read, or left everything open. None of those paths has to prove healing, progress, readiness, or meaning.",
        "The First Journey is complete here. A complete journey does not require a neat outcome. Grief, questions, limits, responsibilities, harm, faith struggle, illness and circumstances may remain. Unfinished is not the same as failed.",
        "Every day remains open if returning is useful; you owe the app no repetition or continuation. If something needs care beyond an app, consider appropriate professional, medical, community, spiritual or trusted support. For immediate safety concerns, use Support & Safety.",
      ],
      carryForward:
        "I can let this journey be complete without forcing myself to be finished.",
    },
  },
];
