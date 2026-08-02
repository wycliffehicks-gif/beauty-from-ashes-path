// The First Journey — Days 6–10.
// PROVISIONAL copy. Founder content review required before any public use.

import type { JourneyDayContent } from "./journey-types";

export const DAYS_SIX_TO_TEN: JourneyDayContent[] = [
  {
    day: 6,
    title: "What It Is Costing Now",
    theme: "Present-day cost noticed without blame, forced choice or invented causes.",
    motif: "cost",
    shape: "notice-first",
    descriptor: "Noticing one present-day cost · about 12 minutes",
    arrive: {
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
        "By cost, we mean present-day strain, loss or narrowing that may be connected with a way of coping, a role or a difficult arrangement—such as less energy, closeness, choice, rest, meaning or hope. Cost is not blame, and it is not always avoidable.",
        "A response may help you function, reduce conflict, meet responsibilities or remain safer and may also add to the strain. What helped you get through before may not help in the same way now—but it may still be needed, or it may not be the main problem.",
        "Sometimes the cost comes mainly from illness, disability, caregiving, discrimination, financial pressure, unsafe conditions, limited support or another reality you did not choose. Noticing does not create choices that are unavailable or make the situation your fault.",
        "Nothing today asks you to confront anyone, end anything, forgive, surrender a necessary boundary or make a major decision.",
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
        title: "Reflection Practice — what it costs and what keeps it in place",
        summary:
          "A focused practice for acknowledging one possible cost, respecting what is still true, and noticing what kind of support or safer alternative may be needed.",
        steps: [
          "Orient outward first. Notice one neutral detail nearby, then bring to mind one possible cost or strain. If no clear cost came to mind, let that remain true. You may hold a general strain without linking it to this response, or simply keep reading.",
          "Complete one sentence privately: 'One strain I notice is…' Keep it broad; no names, identifying details or proof are needed.",
          "Complete a second sentence if it fits: 'What is also true is…' This may name a benefit, responsibility, limit, ongoing danger or difficult circumstance. 'I do not know' is a complete answer.",
          "Ask three different questions: What is within my influence? What would require support, accommodation, resources, safer conditions or change around me? What is not safe or possible to change now?",
          "If there is a loss here, you may acknowledge it once: 'I wish this had not cost me…' You do not need to intensify, relive or explain it.",
          "If one small easing is safe and realistic, name it. If none is, naming that limit is the practice. Finish by returning your attention to one neutral detail nearby.",
        ],
        notRequired:
          "No confrontation, disclosure, decision, forgiveness, surrender of necessary safety or attempt to 'let go' is required. If the practice becomes too much, stop and reorient to the room or leave it here.",
      },
      spiritual: {
        title: "Scripture & Spiritual Reflection — rest without a slogan",
        summary:
          "A Christian practice for bringing both the cost and what remains real before Christ, without turning faith into a demand for instant release.",
        steps: [
          "Orient outward first, then read the passage slowly if you wish. Notice that burdened people are invited; they are not scolded for being burdened.",
          "In prayer or silence, name one possible cost—or keep it private: 'Jesus, one thing this may be costing me is…'",
          "Name what remains real: a responsibility, illness, grief, need for safety, injustice, limited resource or difficult circumstance. You may also say, 'I do not know what keeps this here.'",
          "Let both truths remain before God without making either cancel the other. If you wish, pray: 'Jesus, help me see truthfully what I am carrying, what may still matter, and what support I may need. Meet me with gentleness and give me an honest pace.'",
          "Notice one practical form of care that may matter: rest, help from a safe person, professional care, community support, advocacy, accommodation, a boundary or a safer way of carrying. Prayer may accompany practical support; it does not replace it.",
          "Return attention to one neutral detail nearby. If you feel no relief or clarity, nothing has gone wrong.",
        ],
        notRequired:
          "This passage is not being used to tell you to remain in harm, carry everything alone, surrender a boundary or avoid practical support. This is not 'just give it to God.' No prayer, release, forgiveness or lighter feeling is required.",
        scripture: {
          reference: "Matthew 11:28–30 (World English Bible)",
          body: "Come to me, all you who labor and are heavily burdened, and I will give you rest. Take my yoke upon you and learn from me, for I am gentle and humble in heart; and you will find rest for your souls. For my yoke is easy, and my burden is light.",
          note: "Jesus addresses people who are already burdened and describes himself as gentle and humble. This is not a promise that every circumstance will immediately feel easy or change.",
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
          note: "Choose someone reasonably safe. No identifying details are needed here.",
        },
        {
          id: "return",
          label:
            "Identify one responsibility that may need review, sharing, support or accommodation; no action today",
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
          label: "Nothing outward — seeing what is and is not changeable was the step",
        },
      ],
    },
    reflection: {
      intro: "Drawn only from today's selections, and offered tentatively.",
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
            none: "No clear cost stands out right now. You do not need to invent one.",
            unclear:
              "You are not sure what is connected. Uncertainty is an honest answer, and no cause will be assigned.",
            private:
              "You chose to keep the cost private. No particular cost or cause will be inferred from that choice.",
          },
          unanswered:
            "You did not choose a cost today. No cost, cause or hidden meaning will be assigned.",
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
              "You are not sure what keeps this in place. No motive or hidden benefit will be assigned.",
            private: "You chose to keep this private. No reason will be inferred from that choice.",
          },
          unanswered:
            "No benefit, protection, responsibility or constraint was named. Nothing about why this remains will be guessed.",
        },
        {
          id: "care",
          title: "What may deserve care now",
          opening:
            "Some costs can be eased through your own choices; some require support, accommodation, resources, safer conditions or change from others; some may need to be grieved or carried differently for now. Noticing that difference is information, not failure.",
          unanswered:
            "However today went, the person living with this may deserve some gentleness now.",
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
              "Seeing what is and is not changeable was the step. Clarity can coexist with unfinishedness.",
          },
          unanswered:
            "No step was chosen. The honest attention you gave the question can stand on its own.",
        },
      ],
      closing:
        "No conclusion has been reached about what caused the cost or what to change. What you noticed may point toward choice, support, grief, a safer condition or simply more time.",
    },
    close: {
      heading: "Seen clearly, held gently",
      body: [
        "Whether or not you named a cost, you spent some time near the question without turning it into a verdict.",
        "You did not have to blame yourself, dismiss what is still real or decide what to change. When you continue, Day 7 turns toward how you hold yourself while seeing what is true.",
      ],
      carryForward:
        "I can stay honest about what is clear and unclear without condemning myself or ignoring what is still real.",
    },
  },

  {
    day: 7,
    title: "A More Compassionate Way to Hold It",
    theme: "Truth, context, dignity and responsibility held together without self-attack.",
    motif: "compassion",
    shape: "standard",
    descriptor: "Holding truth without self-attack · about 12 minutes",
    arrive: {
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
        "An inner response is whatever happens inside when something is difficult. It may be words, a tone, images, pressure, comparison, blankness, withdrawal or simply a general attitude toward yourself. Some people have no verbal inner voice at all, and that is ordinary.",
        "Accurate compassion does not flatter you, excuse harm or declare every choice acceptable. It acknowledges that something is genuinely difficult, includes relevant context and limits, includes impact on others where that applies, and holds only the responsibility actually within your influence.",
        "Harshness may feel like honesty, discipline, protection or accountability. It may also add shame, hiding, exhaustion or pressure. Neither possibility tells us why your inner response developed, and a more compassionate response does not guarantee that anything will change.",
        "Some difficulties are shaped by choices; others arise partly or largely from circumstances—such as grief, illness, disability, caregiving demands, discrimination, unsafe conditions or limited resources—that may not be chosen or within your control. Compassion neither erases consequences nor assigns blame for what was outside your control.",
        "Nothing today requires forgiveness, confession, disclosure, repair, confrontation, changed behaviour, a changed feeling or a decision. The practice here is contained: one moment of truth without added self-attack.",
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
              "You chose to keep this private today. Your choice is saved on this device, and no tone, cause, purpose or history will be inferred from it.",
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
          { id: "acknowledged", label: "Acknowledge that this has genuinely been difficult" },
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
          "Orient outward first. Notice one neutral detail nearby, or one accessible point of support. No touch, posture, breathing, relaxation or bodily sensation is required.",
          "Bring to mind one difficulty, limit, need, response or mistake. Keep it broad and private — no names and no identifying details.",
          "Separate observation from verdict. Try “Something I notice is…” rather than a whole-person label such as “I am a failure.”",
          "Add context: “What was also true was…” Context may include a limit, a need, an impact, a choice or a circumstance. It adds accuracy; it does not automatically excuse harm.",
          "If responsibility is clear, make it specific: “What is mine to acknowledge or address is…” If nothing is clear, or nothing is within your influence, do not invent responsibility.",
          "Offer one accurate, less-punishing response. For example: “This is difficult, and I do not need to attack myself to face it.” Or “I can be accountable without making this my whole identity.” Or “I do not know yet; I can leave the question open without contempt.” If words do not fit, choose a brief wordless act of non-hostility or ordinary care that is realistically available to you. No outcome is required.",
          "Reorient outward — one detail nearby again. If no warmth, relief or clarity appeared, nothing failed.",
        ],
        notRequired:
          "Nothing has to be written, spoken, believed or forgiven. No disclosure, contact, repair, action or improved feeling is required, and you may stop if distress grows.",
      },
      spiritual: {
        title: "Scripture & Spiritual Reflection — gentleness without abandoning truth",
        summary:
          "A Christian pathway in which gentleness toward what is vulnerable and a commitment to justice are held together, chosen only if it fits.",
        steps: [
          "Read the passage slowly if you wish, and notice that gentleness and justice are held together rather than traded against each other.",
          "Notice whether the image feels comforting, distant, difficult or neutral. Any of those responses may simply remain, and the passage may be set aside.",
          "If it fits, bring one difficulty, limit, need, response or mistake before Christ — or keep it private. No explanation is required.",
          "If it fits, name one truth and one mercy. If responsibility is yours, name only what is specific and within your influence.",
          "Optional prayer: “Jesus, help me face what is true without contempt, receive care without pretending, and recognise any honest response that is mine.”",
          "Let prayer remain alongside practical care, accountability, boundaries or support rather than replacing them. Then reorient outward. No relief or clarity is required.",
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
          label: "Nothing outward — considering a less-punishing hold was the step",
        },
      ],
    },
    reflection: {
      intro: "From what you chose today, tentatively and without conclusion.",
      sections: [
        {
          id: "hearing",
          title: "The inner response you named",
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
            kind: "The response is mostly fair or kind. That is a resource already present, without any need to keep it perfect.",
            none: "No particular inner response stood out, and none will be invented here.",
            unclear:
              "What happens inside is not clear to you. That uncertainty stays as it is, with no hidden meaning attached.",
            private:
              "You chose to keep this private. That structured choice is saved on this device, and no tone, cause or history is inferred from it.",
          },
          unanswered:
            "No inner response was selected, and none will be inferred. No tone, cause, purpose or history is being assigned to you from this day.",
        },
        {
          id: "care",
          title: "The way of holding you considered",
          from: "need",
          lines: {
            rest: "Rest, reduced demand or basic care was named as a real need. Whether it is available to you is a separate question, and nothing here assumes it is.",
            acknowledged:
              "Acknowledging that this has genuinely been difficult was what you chose. That is an accurate thing to say, not a conclusion about anything else.",
            notalone:
              "You chose to respect that support may matter. No person, contact or disclosure is being suggested here.",
            permission:
              "You chose to let one feeling or reaction be present without judging it. That does not require approving of the feeling or acting on it.",
            patience:
              "You chose to allow more time without treating delay as failure. No pace is being set for you.",
            safety:
              "You chose to respect safety, stability or practical support before pushing further. No reason for that is being assumed.",
            forgiveness:
              "You chose to separate accountability from self-punishment. That excuses nothing, and no forgiveness of yourself or anyone else is required.",
            unsure:
              "What compassion would look like is not clear yet. That can remain unclear, and no underlying need will be guessed at.",
            none: "No different way of holding this felt right today. That absence stays as it is, and no explanation or hidden meaning will be assigned.",
            private:
              "You chose to keep this private. That structured choice is saved on this device, and no need or response is inferred from it.",
          },
          unanswered:
            "No more compassionate way of holding this was selected, and none will be inferred. Nothing here concludes that you need something you did not name.",
        },
        {
          id: "next",
          title: "One honest next step",
          from: "step",
          lines: {
            sentence:
              "One fair, accurate sentence, used once. Whether anything follows from it is not something this can tell you.",
            catch: "Noticing one harsh or dismissive response without arguing with it. That is a small act of attention, with no claim about what it achieves.",
            body: "One ordinary form of care for your body, if it is realistically available. No outcome is attached to it.",
            receive:
              "Letting one fair sentence remain for a few seconds, without forcing belief in it. Belief is not the measure.",
            prepare:
              "Nothing outward. Considering a less-punishing way of holding this was the step, and it stands as one.",
          },
          unanswered:
            "No step was selected, and none will be assumed. Reading through the day without choosing anything is a complete way to have spent it.",
        },
      ],
      closing:
        "Today's selections do not establish why this inner response exists, what it says about your worth, or what will change. They point only to one way honesty and dignity might remain in the same room.",
    },
    close: {
      heading: "Truth without contempt",
      body: [
        "Whether or not you named anything today, this question can remain: can what is true be held while some of the contempt, dismissal or pressure is left out?",
        "Compassion does not erase harm, consequence, grief, boundaries, limits or responsibility. It can mean accompanying yourself while you face what is yours, what is not, and what is still unclear.",
        "Day 8 explores one small, safe reconnection with what matters, chosen by you.",
      ],
      carryForward: "I can face what is true without turning myself into the enemy.",
    },
  },

  {
    day: 8,
    title: "Reconnect With What Matters",
    theme: "One small reconnection, chosen by you and safe for you.",
    motif: "reconnect",
    shape: "practise-mid",
    descriptor: "Choosing a reconnection · about 12 minutes",
    arrive: {
      lead: "Reconnection does not mean going back to anything unsafe.",
      body: [
        "Long difficulty tends to narrow life: fewer people, fewer places, less of what once mattered.",
        "Today is about one small reconnection — with yourself, your body, your values, a safe person, or God — chosen entirely by you.",
      ],
      settle: [
        "Look up and let your eyes travel to the furthest point in the room.",
        "Notice one thing that is genuinely fine right now, however small.",
        "Let your breathing settle for a moment before choosing anything.",
      ],
    },
    understand: {
      heading: "Small and real beats large and imagined",
      body: [
        "Reconnection rarely begins with a conversation or a decision. It usually begins with something almost unnoticeable: standing outside for two minutes, replying to one message, picking up something you used to make.",
        "It is worth saying plainly: nothing here suggests reconnecting with anyone who has harmed you. Distance from unsafe people is not a failure of this practice; it can be part of it.",
        "You choose the direction. There is no correct one, and God is one option among several rather than the expected answer.",
      ],
      info: [
        {
          term: "What counts as a “safe person”?",
          explanation:
            "Someone who can hear you without using it against you later, who does not need you to be fine, and who respects a limit when you set one. If nobody comes to mind, that is important information rather than a personal failing — and a professional can be that person.",
        },
      ],
    },
    questions: [
      {
        id: "route",
        eyebrow: "Choose",
        prompt: "Where would a small reconnection feel possible?",
        hint: "One choice for today. The others remain available another time.",
        select: "one",
        options: [
          { id: "self", label: "Myself — something that is mine and not a duty" },
          { id: "body", label: "My body — movement, rest, food, air" },
          { id: "reality", label: "The present — the ordinary world in front of me" },
          { id: "values", label: "What I believe in — living one degree closer to it" },
          { id: "creativity", label: "Making or noticing something — music, words, nature" },
          { id: "person", label: "One safe person" },
          { id: "community", label: "A group or place where I am not required to perform" },
          { id: "god", label: "God" },
        ],
        echo: {
          heading: "How that might begin",
          byOption: {
            self: "Reconnecting with yourself often starts with ten minutes that serve no purpose at all.",
            body: "Reconnecting with the body can be as small as standing outside, or eating something properly.",
            reality: "Reconnecting with the present usually means noticing the ordinary world rather than the one in your head.",
            values: "Living one degree closer to what you believe is often a very small, unglamorous act.",
            creativity: "Making or noticing something reopens a channel that difficulty tends to close first.",
            person: "One safe person, one honest sentence, is usually enough to begin with.",
            community: "A place where nothing is required of you can restore more than a conversation would.",
            god: "Reconnection here may be a sentence, a silence, or simply turning your attention that way for a moment.",
          },
          unanswered:
            "You continued without choosing a direction, and today still holds. Sometimes the honest position is that no route feels available yet, and that deserves respect rather than a nudge.",
          closing: "Whatever you chose, small is the point. Nothing today needs to be visible to anyone else.",
        },
      },
      {
        id: "size",
        eyebrow: "Scale",
        prompt: "How much is realistically available today?",
        hint: "Answer for today's version of you, not your best week.",
        select: "one",
        options: [
          { id: "tiny", label: "Something almost invisible" },
          { id: "small", label: "A few minutes, privately" },
          { id: "moderate", label: "One real thing involving someone else" },
          { id: "rehearse", label: "Nothing outward — I would rather rehearse it inwardly" },
        ],
      },
    ],
    practise: {
      heading: "Two ways to practise today",
      intro:
        "Both take the direction you chose and turn it into something concrete or rehearsed.",
      either: "Either or both. Rehearsal counts fully as practice.",
      reflection: {
        title: "Reflection Practice — one tiny concrete act",
        summary:
          "Turning a chosen direction into something specific enough to actually happen.",
        steps: [
          "Take the direction you chose and shrink it until it is almost too small to matter.",
          "Make it specific: not “get outside more”, but “stand at the door for two minutes after this”.",
          "Decide when. A vague time usually means it will not happen; “after I close this” usually does.",
          "If it involves another person, decide the first sentence only. Not the conversation — the first sentence.",
          "If doing it today is not realistic, rehearse it instead: picture the moment, the words, and the ending. Rehearsal is a real practice, not a substitute for one.",
          "Afterwards, notice what happened in your body. Both relief and resistance are useful information.",
        ],
        notRequired:
          "You do not have to contact anyone, explain yourself, or do anything visible. Nobody is checking.",
      },
      spiritual: {
        title: "Scripture & Spiritual Reflection — accompaniment before answers",
        summary:
          "A Christian pathway about company on the road, offered only if you choose it.",
        steps: [
          "Read the line. Notice what happens first: not an explanation, but company.",
          "Notice that in the wider story the two walkers do not recognise him for some time, and are not reprimanded for it.",
          "Choose how you want to hold this today: read the passage only; reflect on it without praying; or say a brief prayer in your own words.",
          "If none of those fit, sit with the image of being accompanied for a few breaths. That is a complete way to do this.",
        ],
        notRequired:
          "No prayer is required, no words are required, and uncertainty about God does not exclude you from this. You may also leave this path entirely.",
        scripture: {
          reference: "Luke 24:15 (World English Bible)",
          body: "Jesus himself came near, and went with them.",
          note: "Company arrives before understanding does. Nothing in the passage requires the walkers to have worked anything out first.",
        },
      },
    },
    step: {
      id: "step",
      eyebrow: "One Honest Step",
      prompt: "What is the one small reconnection you will take from today?",
      hint: "One choice. Small, safe and specific.",
      select: "one",
      options: [
        { id: "act", label: "Do the tiny concrete act I identified" },
        { id: "message", label: "Send one short message to a safe person" },
        { id: "outside", label: "Get outside, or to a window, for a few minutes" },
        { id: "own", label: "Give myself ten minutes that serve no purpose" },
        { id: "rehearse", label: "Rehearse it inwardly and leave the doing for later" },
      ],
    },
    reflection: {
      intro: "From what you chose today, and nothing beyond it.",
      sections: [
        {
          id: "hearing",
          title: "What I'm hearing",
          from: "route",
          opening: "You chose a direction:",
          lines: {
            self: "You turned toward yourself, which is often the direction people postpone longest.",
            body: "You turned toward your body, which tends to be where reconnection is most immediately felt.",
            reality: "You turned toward the present, which can be steadying when the mind is elsewhere.",
            values: "You turned toward what you believe in, which suggests it has not gone anywhere.",
            creativity: "You turned toward making or noticing, which is often the first thing difficulty shuts down.",
            person: "You turned toward one safe person, which takes more courage than it is usually given credit for.",
            community: "You turned toward a place where nothing is demanded of you, which can restore a great deal.",
            god: "You turned toward God, in whatever form that took today.",
          },
          unanswered:
            "No direction was chosen, and none will be assigned. It is worth noting that considering reconnection at all is where it usually begins.",
        },
        {
          id: "care",
          title: "What may deserve care now",
          from: "size",
          opening: "You were honest about what is available:",
          lines: {
            tiny: "Almost invisible is the right size when reserves are low, and it still counts.",
            small: "A few private minutes is a realistic and respectable amount.",
            moderate: "Something involving another person asks more of you, so it may deserve a little preparation.",
            rehearse: "Rehearsing inwardly is a legitimate form of practice, not a lesser one.",
          },
          unanswered:
            "You did not set a scale, which is fine. Whatever is available today is the right amount.",
        },
        {
          id: "next",
          title: "One honest next step",
          from: "step",
          lines: {
            act: "A specific tiny act is more likely to happen than a general intention.",
            message: "One short message is a small opening, and openings are how this usually starts.",
            outside: "A few minutes outside or at a window changes the input, which often changes the state.",
            own: "Ten purposeless minutes is a way of remembering you are a person, not only a function.",
            rehearse: "Rehearsal prepares the ground. Preparation counts as movement.",
          },
          unanswered:
            "No step was chosen. The direction you considered stays available whenever it becomes possible.",
        },
      ],
      closing:
        "Nothing here suggests moving toward anyone unsafe, and no reconnection is owed to anybody.",
    },
    close: {
      heading: "One thread picked up",
      body: [
        "You chose a direction and made it small enough to be real. That is how narrowed lives usually widen — a little at a time.",
        "Tomorrow practises a different response, with step-by-step guidance and nothing required of you in public.",
      ],
      carryForward:
        "Carry forward one sentence: small and safe is not a compromise — it is the method.",
    },
  },

  {
    day: 9,
    title: "Practise a Different Response",
    theme: "Rehearsing something new, privately and without risk.",
    motif: "practise",
    shape: "standard",
    descriptor: "Rehearsal and practice · about 12 minutes",
    arrive: {
      lead: "New responses are practised long before they are performed.",
      body: [
        "Today you choose one practice and are guided through it step by step.",
        "Nothing here requires a conversation, a confrontation or a disclosure. Everything can be done privately.",
      ],
      settle: [
        "Sit somewhere you will not be interrupted for a few minutes, if that is possible.",
        "Let your hands be still and your feet be flat.",
        "Notice, without changing it, how you are breathing.",
      ],
    },
    understand: {
      heading: "Why rehearsal works",
      body: [
        "Under pressure, people do what they have practised, not what they intended. That is why a new response usually fails in the moment: it has never been tried anywhere safe.",
        "Rehearsal changes that. Saying a sentence in an empty room, writing something you will never send, or planning a limit in advance all make the real version more possible later.",
        "None of this requires the other person's participation, or even their knowledge.",
      ],
      info: [
        {
          term: "What is a boundary, in plain terms?",
          explanation:
            "A boundary is a statement about what you will do, not a demand about what someone else must do. “I won't be able to talk about this tonight” is a boundary. It does not require permission, an argument, or an explanation.",
        },
      ],
    },
    questions: [
      {
        id: "practice",
        eyebrow: "Choose",
        prompt: "Which practice would be most useful today?",
        hint: "One choice. You will be guided through it in the practice screen.",
        select: "one",
        options: [
          { id: "grounding", label: "Grounding — settling when things escalate" },
          { id: "unsent", label: "The unsent sentence — saying it where it is safe" },
          { id: "boundary", label: "Rehearsing a limit I need to set" },
          { id: "support", label: "Rehearsing asking someone for support" },
          { id: "lament", label: "Lament — saying the hard thing plainly" },
          { id: "prepare", label: "Prepare, don't perform — planning without acting" },
          { id: "loosen", label: "Five percent — loosening one held pattern slightly" },
        ],
        echo: {
          heading: "What this practice is for",
          byOption: {
            grounding: "Grounding gives your body a task when it is escalating, which is more reliable than telling yourself to calm down.",
            unsent: "The unsent sentence lets something be said in full without any of the consequences of sending it.",
            boundary: "Rehearsing a limit makes the real one shorter, calmer and far more likely to be said at all.",
            support: "Rehearsing a request removes most of the improvisation from a moment that is already difficult.",
            lament: "Lament gives grief and anger a form, so they do not have to leak out sideways.",
            prepare: "Preparing without acting is a complete practice, and it keeps the timing yours.",
            loosen: "A five percent change, in one safe moment, is small enough to survive and real enough to count.",
          },
          unanswered:
            "You continued without choosing, and the practice screen still offers a complete option. Nothing is missed by not deciding.",
          closing: "Whatever you chose, nothing in it requires anyone else's involvement today.",
        },
      },
      {
        id: "where",
        eyebrow: "Locate",
        prompt: "Where would a different response matter most at the moment?",
        hint: "Choose any that fit. This shapes nothing but your own thinking.",
        select: "many",
        options: [
          { id: "home", label: "At home" },
          { id: "work", label: "At work" },
          { id: "family", label: "With family" },
          { id: "friend", label: "With a friend or partner" },
          { id: "self", label: "In how I treat myself" },
          { id: "faith", label: "In my faith or spiritual life" },
          { id: "private", label: "I would rather not specify" },
        ],
      },
    ],
    practise: {
      heading: "Two ways to practise today",
      intro:
        "The first is a general rehearsal structure that fits whichever practice you chose. The second is a spiritual pathway of equal substance.",
      either: "Either or both, and neither requires anyone else.",
      reflection: {
        title: "Reflection Practice — guided rehearsal",
        summary:
          "A step-by-step structure for practising a new response somewhere safe.",
        steps: [
          "Name the situation in one line, silently: who is there, and what usually happens.",
          "Decide the one thing you would do differently. One thing only — a sentence, a pause, a limit, or leaving earlier.",
          "If it is a sentence, make it short and about you: “I need to stop here”, “I can't take that on”, “That hurt me”.",
          "Say it once, silently. Then say it once more, slower, and notice what your body does. Tightening is expected.",
          "Now rehearse the part people forget: what you will do if it does not go well. Usually the answer is simply “I will end the conversation and leave”.",
          "Finish by naming what is explicitly not required: you do not have to send it, say it, win it, or do it at all.",
          "If grounding is what you chose, use this instead: name five things you can see, four you can hear, three you can touch, two you can smell, one slow breath.",
        ],
        notRequired:
          "No confrontation, no disclosure, no message sent, no decision made. Rehearsal is the whole of it.",
      },
      spiritual: {
        title: "Scripture & Spiritual Reflection — pouring it out",
        summary:
          "A Christian pathway for saying the unedited thing, offered only if you choose it.",
        steps: [
          "Read the line. Notice the instruction is to pour out, not to tidy up first.",
          "Choose a form: silent words, spoken words, or writing something you will not keep.",
          "Say the unedited version — including anger, doubt or the sentence you would not say aloud to anyone.",
          "Stop when you are finished rather than when it sounds finished. There is no required ending.",
          "Sit for a few breaths afterwards, and let the silence be part of it.",
        ],
        notRequired:
          "Nothing needs to be resolved, forgiven or believed by the end. You may read the line and go no further.",
        scripture: {
          reference: "Psalm 62:8 (World English Bible)",
          body: "Trust in him at all times, you people. Pour out your heart before him.",
          note: "The instruction assumes there is something difficult to pour out, and does not ask for it to be edited first.",
        },
      },
    },
    step: {
      id: "step",
      eyebrow: "One Honest Step",
      prompt: "What will you take from the rehearsal?",
      hint: "One choice, and rehearsing again counts.",
      select: "one",
      options: [
        { id: "again", label: "Rehearse it once more later this week" },
        { id: "sentence", label: "Keep the one sentence ready, in case it is needed" },
        { id: "use", label: "Use it once, in a low-risk moment" },
        { id: "ground", label: "Use the grounding sequence next time things escalate" },
        { id: "support", label: "Take it to a professional or trusted person" },
        { id: "prepare", label: "Nothing outward — the rehearsal was the step" },
      ],
    },
    reflection: {
      intro: "Drawn only from today's choices.",
      sections: [
        {
          id: "hearing",
          title: "What I'm hearing",
          from: "practice",
          opening: "You chose a practice:",
          lines: {
            grounding: "You chose grounding, which suggests escalation is part of what you are managing.",
            unsent: "You chose the unsent sentence, which suggests something has needed saying for a while.",
            boundary: "You chose to rehearse a limit, which usually means one is overdue rather than sudden.",
            support: "You chose to rehearse asking for support, which is often harder than continuing alone.",
            lament: "You chose lament, which gives weight to something that has had to stay quiet.",
            prepare: "You chose to prepare rather than act, which keeps the timing in your hands.",
            loosen: "You chose a five percent loosening, which is a realistic size for a real change.",
          },
          unanswered:
            "No practice was chosen, and the general rehearsal structure stands on its own. Nothing was missed.",
        },
        {
          id: "underneath",
          title: "Where it may matter",
          from: "where",
          opening: "You located where a different response would matter:",
          lines: {
            home: "At home, where responses are most habitual and hardest to change mid-flow.",
            work: "At work, where the cost of a limit can feel higher than it usually is.",
            family: "With family, where old roles reassert themselves quickly.",
            friend: "With a friend or partner, where closeness raises the stakes of honesty.",
            self: "In how you treat yourself, which is the setting most people practise last.",
            faith: "In your faith or spiritual life, where honesty is sometimes assumed to be unwelcome.",
            private: "You kept the setting to yourself, which changes nothing about the practice.",
          },
          unanswered:
            "You did not specify a setting, and none is needed. A rehearsed response tends to travel.",
        },
        {
          id: "next",
          title: "One honest next step",
          from: "step",
          lines: {
            again: "Rehearsing again is how something moves from possible to available.",
            sentence: "Keeping one sentence ready means you are not improvising under pressure.",
            use: "Using it once in a low-risk moment is the safest way to test it.",
            ground: "Having a grounding sequence ready gives your body somewhere to go.",
            support: "Taking it to a professional or trusted person is a sound and unremarkable next move.",
            prepare: "The rehearsal was the step, and rehearsal is where new responses come from.",
          },
          unanswered:
            "Nothing was chosen. Practising at all already changes what is available to you later.",
        },
      ],
      closing:
        "Nothing here asks you to confront anyone, disclose anything, or act before you are ready.",
    },
    close: {
      heading: "Practised, not performed",
      body: [
        "You rehearsed something new without having to risk anything. That is exactly the right order.",
        "Tomorrow is the last day of this first journey: integration, what remains unfinished, and one honest step forward.",
      ],
      carryForward:
        "Carry forward one sentence: I can practise a response long before I need it.",
    },
  },

  {
    day: 10,
    title: "Carry It Forward",
    theme: "Integration, unfinishedness, and one honest step.",
    motif: "carry",
    shape: "notice-first",
    descriptor: "Gathering the journey · about 15 minutes",
    arrive: {
      lead: "This is the last day of the First Journey, and it does not tie anything up.",
      body: [
        "You have spent ten days looking at difficult things without being asked to perform, disclose or resolve.",
        "Today gathers what may be worth keeping, names what is still unfinished, and settles on one honest step.",
      ],
      settle: [
        "Sit for a moment before starting, as you might before leaving a room you have spent time in.",
        "Notice that you are the same person who opened Day 1, with a little more information.",
        "Let one breath out slowly.",
      ],
    },
    understand: {
      heading: "Unfinished is the normal condition",
      body: [
        "Nothing here promises healing, recovery or a resolved life, and it would be dishonest to imply that ten days could deliver one.",
        "What a journey like this can do is smaller and more durable: make something visible, give it a name, and make one small movement possible.",
        "Some of what you have looked at will need more than an app — time, people, and in many cases a qualified professional. That is not a shortfall of yours.",
      ],
      info: [
        {
          term: "What if I feel worse than when I started?",
          explanation:
            "Looking directly at something long avoided can feel heavier before it feels lighter. If distress persists or grows, that is a signal to involve real-world support rather than to continue alone. Support & Safety is always in Settings.",
        },
      ],
    },
    questions: [
      {
        id: "different",
        eyebrow: "Gather",
        prompt: "What, if anything, do you understand a little differently now?",
        hint: "Choose any that fit. “Nothing yet” is an honest and acceptable answer.",
        select: "many",
        options: [
          { id: "protective", label: "That how I cope was protective, not a defect" },
          { id: "named", label: "That naming something makes it more manageable" },
          { id: "twopulls", label: "That wanting change and wanting safety can coexist" },
          { id: "cost", label: "That this is costing me something real" },
          { id: "harsh", label: "That I speak to myself more harshly than I realised" },
          { id: "small", label: "That small steps are the actual method" },
          { id: "notalone", label: "That I do not have to do this entirely alone" },
          { id: "nothing", label: "Nothing yet — and that is honest" },
        ],
        echo: {
          heading: "Holding that lightly",
          byOption: {
            protective: "Seeing coping as protective rather than defective changes what you can do with it.",
            named: "Naming makes things locatable, which is usually the first practical relief.",
            twopulls: "Holding two pulls at once removes a great deal of unnecessary self-blame.",
            cost: "Knowing the cost puts the choice back in your hands, even if nothing changes yet.",
            harsh: "Hearing your own tone is often the single most useful thing to come out of ten days.",
            small: "Small steps are not a lesser method. For most people they are the only one that holds.",
            notalone: "Knowing you do not have to do it alone is worth more than most insights.",
            nothing: "Nothing yet is a real answer, and it is more useful than a manufactured one.",
          },
          unanswered:
            "You continued without gathering anything, and the journey still happened. Understanding sometimes arrives weeks later, in an ordinary moment.",
        },
      },
      {
        id: "unfinished",
        eyebrow: "Name",
        prompt: "What is still unfinished?",
        hint: "Naming it is not a commitment to resolving it. Choose any that fit.",
        select: "many",
        options: [
          { id: "grief", label: "Grief that needs more room" },
          { id: "relationship", label: "Something unresolved with another person" },
          { id: "limit", label: "A limit I still need to set" },
          { id: "support", label: "Support I have not yet arranged" },
          { id: "self", label: "How I treat myself" },
          { id: "faith", label: "Questions about faith or meaning" },
          { id: "rest", label: "Rest I keep postponing" },
          { id: "unclear", label: "Something unclear that I can't name yet" },
        ],
      },
    ],
    practise: {
      heading: "Two ways to practise today",
      intro: "Both settle the journey rather than summarising it.",
      either: "Either or both, and a blessing is offered only if you choose it.",
      reflection: {
        title: "Reflection Practice — choose and rehearse One Honest Step",
        summary:
          "Making one step concrete enough to survive contact with an ordinary week.",
        steps: [
          "Choose the one thing most worth carrying forward. Only one — the rest can wait.",
          "Shrink it until it is genuinely doable in the week you are actually in, not an ideal one.",
          "Make it specific: what, when, and how you will know it happened.",
          "Rehearse it once, inwardly. Picture the moment, and the ending.",
          "Name what is not required: it does not need to be dramatic, visible, successful, or repeated.",
          "If no outward action is right this week, choose preparation instead — and mean it as a step, not a delay.",
        ],
        notRequired:
          "Nothing is scheduled, tracked or checked. You will not be reminded, measured or asked about it.",
      },
      spiritual: {
        title: "Scripture & Spiritual Reflection — a blessing to close",
        summary:
          "A Christian closing, offered only if you want it. It makes no promises about outcomes.",
        steps: [
          "Read the blessing slowly, once.",
          "Notice that it asks for presence and kindness rather than guaranteeing a particular result.",
          "If you wish, receive it as spoken over you — including the parts of your life that are still unresolved.",
          "If receiving it is difficult today, read it as something you might one day be able to receive. That is enough.",
        ],
        notRequired:
          "No commitment, decision or profession of faith is being asked for here. You may close the journey without this.",
        scripture: {
          reference: "Numbers 6:24–26 (World English Bible)",
          body: "Yahweh bless you, and keep you. Yahweh make his face to shine on you, and be gracious to you. Yahweh lift up his face toward you, and give you peace.",
          note: "A blessing asks for presence, kindness and peace. It does not promise that circumstances will change.",
        },
      },
    },
    step: {
      id: "step",
      eyebrow: "One Honest Step",
      prompt: "What is the one honest step you are carrying out of this journey?",
      hint: "One choice. It should be small enough to survive a difficult week.",
      select: "one",
      options: [
        { id: "support", label: "Arrange one piece of real support" },
        { id: "conversation", label: "Have one honest conversation with a safe person" },
        { id: "limit", label: "Set one limit I have been postponing" },
        { id: "rest", label: "Protect rest that I keep giving away" },
        { id: "kind", label: "Change how I speak to myself, once a day" },
        { id: "revisit", label: "Return to one day of this journey that mattered" },
        { id: "prepare", label: "No outward action this week — preparation is my step" },
      ],
    },
    reflection: {
      intro:
        "This gathers only what you selected today, alongside the shape of the journey itself.",
      sections: [
        {
          id: "hearing",
          title: "What I'm hearing",
          from: "different",
          opening: "Looking back across the ten days:",
          lines: {
            protective: "You are holding your coping as protective rather than defective, which changes what can be done with it.",
            named: "You have found that naming something makes it more manageable, which tends to stay useful.",
            twopulls: "You are able to hold two pulls at once without treating it as failure.",
            cost: "You have seen a real cost, and seeing it puts the choice back with you.",
            harsh: "You have heard your own inner tone, which is often the most useful outcome of ten days.",
            small: "You are treating small steps as the method rather than a compromise.",
            notalone: "You are allowing that this does not have to be done entirely alone.",
            nothing: "Nothing has landed yet, and saying so plainly is more honest than manufacturing an insight.",
          },
          unanswered:
            "Nothing was gathered today, and nothing will be claimed on your behalf. Ten days of honest attention happened regardless.",
        },
        {
          id: "care",
          title: "What may deserve care rather than pressure",
          from: "unfinished",
          opening: "You named what is still unfinished:",
          lines: {
            grief: "Grief that needs more room deserves time rather than a deadline.",
            relationship: "Something unresolved with another person may need support around it, not just resolve.",
            limit: "A limit still to be set will keep. It does not expire.",
            support: "Support not yet arranged may be the most practical next thing, and it is allowed to be difficult.",
            self: "How you treat yourself is slow to change and worth changing slowly.",
            faith: "Questions about faith and meaning are not obstacles to be cleared before living.",
            rest: "Rest that keeps being postponed usually needs protecting rather than earning.",
            unclear: "Something unnamed can be left unnamed. It will surface when it is ready.",
          },
          unanswered:
            "Nothing was named as unfinished, and that is fine. Most things worth working on stay unfinished for a while.",
        },
        {
          id: "next",
          title: "One honest next step",
          from: "step",
          lines: {
            support: "Arranging one piece of real support is often the most durable step available.",
            conversation: "One honest conversation, with someone safe, can shift more than several days of thinking.",
            limit: "One limit, set once, is a modest and significant thing.",
            rest: "Protecting rest you keep giving away is a boundary as much as a comfort.",
            kind: "A daily change of tone toward yourself accumulates quietly.",
            revisit: "Returning to a day that mattered is a legitimate step, not a repeat.",
            prepare: "Preparation is the step this week, and it is not a delay.",
          },
          unanswered:
            "No step was chosen, and none is owed. What you noticed across these days remains yours.",
        },
      ],
      closing:
        "Nothing here claims you are healed, finished or fixed. This has been ten days of honest attention, which is a real thing to have done.",
    },
    close: {
      heading: "The end of the First Journey",
      body: [
        "You reached the end of this journey without being asked to perform recovery. Whatever else is unresolved, that is worth acknowledging.",
        "Every day stays open. You can return to any of them, in any order, as often as you like — revisiting does not undo anything.",
        "If something surfaced that needs more than this, a professional, a safe person or a support line is the right next place. Support & Safety is always in Settings.",
      ],
      carryForward:
        "Carry forward one sentence: I began where I was, and I stayed with what was true.",
    },
  },
];
