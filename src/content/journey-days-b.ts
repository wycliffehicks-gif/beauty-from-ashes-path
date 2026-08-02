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
    theme: "One thread that matters now, met in a way that is small and safe.",
    motif: "reconnect",
    shape: "practise-mid",
    descriptor: "One thread that matters · about 12 minutes",
    arrive: {
      lead: "Reconnection is not going back, and it never means returning to harm.",
      body: [
        "Reconnecting here means making a little room for one thread that matters to you now. It may be something long-standing, something newly emerging, or something not yet clear.",
        "It does not mean restoring an earlier, untouched version of yourself. New life can be a new way of being with yourself, with others, with God, with your wounds, with your questions and with a story that is not finished. It may begin quietly — in a changed relationship, or in one small moment of contact.",
        "It does not mean reconciling, returning to an unsafe person, place or community, proving progress, or pretending that pain is over.",
        "Grief, illness, disability, exhaustion, caregiving, discrimination, unsafe circumstances and limited money, time or transport can all reduce what is reachable. That is a real limit on access, not a personal failure.",
      ],
      settle: [
        "If it helps, take a moment before reading on. Any of these is optional, and none of them requires a particular feeling.",
        "You might rest your attention on one thing you can see, or one sound you can hear, or the surface under your hand — whichever is available to you.",
        "You might instead hold one ordinary thought: the day, the room, the time of year.",
        "Or you can simply read on. Reading on is a complete way to begin.",
      ],
    },
    understand: {
      heading: "What “what matters” can mean",
      body: [
        "What matters can be a value, a need, a person, a culture, a community, a faith, an interest, a creative thread, a place, an ordinary activity, or a way of being. It is not what you are told you should value, and not what other people demand of you.",
        "A value is a chosen quality or direction — dignity, honesty, care, rest, belonging, justice, creativity, faith. It is not a task to complete, a rule imposed on you, or a test you have to pass.",
        "A thread can be approached in a new form. It does not have to recreate what it was before, and it does not have to be available outwardly today. It can be named, remembered, held privately, or left alone.",
        "You do not have to explain where a thread came from, or why it became distant. It can remain yours without that explanation.",
        "Nothing here requires contact, disclosure, reconciliation, forgiveness, public action, a bodily response, hope, clarity or change.",
      ],
      info: [
        {
          term: "What does “safe enough” mean here?",
          explanation:
            "Safe enough for this amount of contact — not safe in every way, and not permanently. Someone who respects a no or a limit, who does not require you to disclose anything, and who is not known to use your vulnerability against you. This app cannot decide whether a particular person is safe. You may know things about this person or situation that the app cannot know. If safety is uncertain, no contact is required, and another route can be chosen instead.",
        },
      ],
    },
    questions: [
      {
        id: "route",
        eyebrow: "Choose",
        prompt: "What, if anything, feels worth making a little room for today?",
        hint: "One choice for today. Nothing follows automatically from it.",
        select: "one",
        options: [
          {
            id: "self",
            label: "Something of my own — a preference or interest not reduced to duty or pain",
          },
          {
            id: "body",
            label: "My body or a physical need, in whatever way is available to me",
          },
          { id: "reality", label: "One ordinary part of the present" },
          { id: "values", label: "One chosen quality or direction that matters to me" },
          {
            id: "creativity",
            label: "Creativity, beauty, learning, music, words, nature — making or noticing",
          },
          {
            id: "person",
            label: "One person who may be safe enough for a small amount of contact",
          },
          {
            id: "community",
            label: "A community, culture, tradition or place of belonging, without performing",
          },
          { id: "god", label: "God — within the Christian path offered here" },
          { id: "other", label: "Something else that matters to me" },
          { id: "unclear", label: "I am not sure what matters, or where to begin" },
          { id: "none", label: "Nothing feels available or safe to reconnect with today" },
          { id: "private", label: "I would rather keep the direction private" },
        ],
        echo: {
          heading: "Room for what is clear — and what is not",
          byOption: {
            self: "Something of your own is a thread that does not have to be useful to anyone. It can stay a preference or an interest without becoming a project.",
            body: "Attention to your body or a physical need can take whatever form is available — comfort, rest, warmth, accommodation, practical care, or no action today. No sensation, movement, or improvement is expected.",
            reality: "One ordinary part of the present is small on purpose. Noticing it is enough; nothing has to follow.",
            values: "A chosen quality or direction can be named without being lived out today. Naming it does not commit you to anything.",
            creativity: "Creativity, beauty, learning or nature can be met by noticing as much as by making. Contact may mean making something or simply noticing.",
            person: "One person who may be safe enough is a possibility, not an obligation. No contact and no disclosure are required. If their safety is uncertain, no contact is required.",
            community: "A community, culture, tradition or place can be held in mind without joining, attending or performing anything.",
            god: "This route stays within the Christian path offered here. It does not assume prayer, certainty of belief, or any felt closeness.",
            other: "Something else that matters to you is a complete answer. It does not have to fit a listed category to be real.",
            unclear: "Not being sure what matters, or where to begin, is left as it is here. No direction will be guessed for you.",
            none: "Nothing feeling available or safe today is left intact. No hidden meaning is read into it, and it is not treated as failure.",
            private: "The direction stays with you. This structured choice is saved on this device so you can return to today; nothing about which direction you hold is recorded or inferred.",
          },
          unanswered:
            "You continued without making a selection, and nothing will be chosen on your behalf. Today's screens still hold without one.",
          closing:
            "Anything held here can be small, private, or set down. Nothing on this screen needs to be visible to anyone else.",
        },
      },
      {
        id: "size",
        eyebrow: "Amount",
        prompt: "How much contact with what matters is realistically available now?",
        hint: "One choice, for today as it actually is.",
        select: "one",
        options: [
          { id: "tiny", label: "Name or notice it only — nothing more" },
          { id: "small", label: "A few private minutes, or one small moment" },
          {
            id: "moderate",
            label: "One small outward action, only if it is safe and realistic",
          },
          {
            id: "rehearse",
            label: "Keep it inward today — remembered, imagined or symbolic",
          },
          { id: "unclear", label: "I am not sure what amount fits" },
          { id: "none", label: "No contact with it feels available today" },
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
        title: "Reflection Practice — making room for one thread",
        summary:
          "A step-by-step way to make a small amount of room for something that matters, without planning, scheduling or acting.",
        steps: [
          "Read through the steps once before doing anything. You may do them in your head, on paper, or not at all.",
          "Let one thread be present — one you named earlier, one you are holding privately, or none in particular. If nothing comes, let the absence stay; the remaining steps still read.",
          "If something is present, ask what quality or meaning it holds for you now — dignity, care, rest, belonging, interest, faith, beauty, honesty, or something you would put differently. You do not need to work out where it came from or why it became distant.",
          "Notice that a thread can be met in a new form. It does not have to look like it once did, and it does not have to involve the same people, place or ability.",
          "If some contact is available, choose one brief and accessible form: noticing something, listening to something, reading a line, remembering, saying or writing the name of it, holding an object, making one mark, or simply letting the idea stay in the room for a moment. No message, contact, arrangement or outing is needed.",
          "Whatever happens next in your thoughts, feelings or body — including resistance, numbness, or nothing noticeable — is left uninterpreted here. None of it means anything about you.",
          "Stop when you are ready. This practice claims no change and no progress; it was one contained amount of room, and that is all it needed to be.",
        ],
        notRequired:
          "No contact, message, explanation, plan, visualisation, movement, touch, outing, calm or hope is required, and no feeling has to arrive. You may stop at any step.",
      },
      spiritual: {
        title: "Scripture & Spiritual Reflection — company on an unfinished road",
        summary:
          "A Christian pathway drawn from the walk to Emmaus, offered only if you choose it, with equal room for doubt and for silence.",
        steps: [
          "Read the verse below slowly, once or twice. Reading only is a complete way to do this.",
          "In the wider Emmaus story, two people are walking while their questions are still unresolved. That is the part this verse describes — not a promise about what you will feel, notice or understand today.",
          "If you wish, you may hold one thing before God: what matters to you, or what feels out of reach. You may do this in silence, or leave it unsaid.",
          "If words fit, one brief prayer in your own words is enough. If they do not fit, silence can be the whole practice.",
          "Doubt, anger, numbness, distance and spiritual struggle can be present here without being problems to solve or things to fix before continuing.",
          "Close whenever you are ready, with or without anything having shifted.",
        ],
        notRequired:
          "No prayer, no certainty, no disclosure, no outward step and no felt sense of accompaniment is required. Uncertainty about God does not exclude you, and you may leave this path entirely.",
        scripture: {
          reference: "Luke 24:15 (World English Bible)",
          body: "While they talked and questioned together, Jesus himself came near, and went with them.",
          note: "This describes what happens in the Emmaus story while the walkers are still talking and questioning. It is an account of that road, not a promise about what you must feel, recognise or experience today.",
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
        { id: "act", label: "Make one small, safe space for something that matters" },
        {
          id: "message",
          label: "Draft one brief message to someone safe enough — sending it is optional",
        },
        {
          id: "outside",
          label:
            "Spend a moment with a window, sound, object, memory, or another point of contact within reach",
        },
        { id: "own", label: "Take a few minutes for something that is mine and not a duty" },
        { id: "rehearse", label: "Keep it inward — naming or remembering what matters" },
        { id: "unclear", label: "I am not sure what step fits" },
        { id: "none", label: "No step feels available, and I will not force one" },
        { id: "private", label: "I will keep the step private" },
      ],
    },
    reflection: {
      intro:
        "This reflection uses only what was selected; it will not fill in what was left open.",
      sections: [
        {
          id: "hearing",
          title: "The thread — or what remained open",
          from: "route",
          lines: {
            self: "You named something of your own as the thread that matters — a preference or an interest, rather than a duty.",
            body: "You named your body, or a physical need, as the thread that matters, in whatever form is available to you.",
            reality: "You named one ordinary part of the present as the thread that matters.",
            values: "You named a chosen quality or direction as the thread that matters.",
            creativity: "You named creativity, beauty, learning or nature as the thread that matters — making or noticing.",
            person: "You named one person who may be safe enough as the thread that matters. No contact is required, and uncertain safety means no contact.",
            community: "You named a community, culture, tradition or place of belonging as the thread that matters, with nothing to perform.",
            god: "You named God as the thread that matters, within the Christian path offered here.",
            other: "You named something outside the listed routes as the thread that matters. It does not need to be described here to be real.",
            unclear: "You said you were not sure what matters, or where to begin. That uncertainty is left as it is, with no direction supplied and no meaning read into it.",
            none: "You said nothing felt available or safe to reconnect with today. That absence is left intact, without a hidden reason and without being treated as failure.",
            private: "You kept the direction private. Its content is not known or interpreted here, and none will be inferred.",
          },
          unanswered:
            "You left the thread unnamed, and none will be assigned. The direction simply remains open; no personal meaning or conclusion is drawn from that.",
        },
        {
          id: "care",
          title: "What may deserve care now",
          from: "size",
          lines: {
            tiny: "You named naming or noticing only as the amount of contact available now.",
            small: "You named a few private minutes, or one small moment, as the amount available now.",
            moderate: "You named one small outward action, if safe and realistic, as the amount available now.",
            rehearse: "You chose to keep it inward — remembered, imagined or symbolic — as the amount available now.",
            unclear: "You said you were not sure what amount fits. It stays uncertain here, and no amount will be suggested in its place.",
            none: "You said no contact felt available today. That is left as it is, with nothing read into it.",
            private: "You kept the amount private. Its content is not known or interpreted here, and none will be inferred.",
          },
          unanswered:
            "You left the amount unnamed. What is available remains open, and no amount will be estimated or supplied here.",
        },
        {
          id: "next",
          title: "One honest next step",
          from: "step",
          lines: {
            act: "You considered making one small, safe space for something that matters.",
            message: "You considered drafting one brief message to someone safe enough. Drafting without sending is the whole step if that is what happens.",
            outside: "You considered a window, a sound, an object, a memory, or another point of contact within reach. No change in how you feel is promised.",
            own: "You considered a few minutes for something that is yours and not a duty.",
            rehearse: "You chose to keep it inward — naming or remembering what matters. That naming is the whole of it.",
            unclear: "You said you were not sure which step fits. No step will be chosen for you.",
            none: "You said no step felt available, and none will be pressed or inferred.",
            private: "You kept the step private. What it is remains yours alone.",
          },
          unanswered:
            "You left the step unnamed. Nothing will be assumed about what you may or may not do after this page.",
        },

      ],
      closing:
        "These selections do not establish why something matters to you, why it became distant, whether reconnection is possible, or what will change. Nothing here suggests moving toward anyone unsafe, and no reconnection is owed to anybody.",
    },
    close: {
      heading: "Held without force",
      body: [
        "Reconnection is not going back, not returning to harm, and not proving progress. A thread that matters can be approached in a new form, held inwardly, kept private, or left alone when it is not available.",
        "Day 9 turns to practising a different response, privately, with step-by-step guidance and nothing required in public.",
      ],
      carryForward:
        "What matters can be met in a way that is small, safe, and mine to choose.",
    },
  },

  {
    day: 9,
    title: "Practise a Different Response",
    theme: "Trying one possible response privately, with safety and choice intact.",
    motif: "practise",
    shape: "standard",
    descriptor: "A small private rehearsal · about 12 minutes",
    arrive: {
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
              "A private choice was selected. The structured choice is saved on this device; what it refers to stays with you and is not collected here.",
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
      reflection: {
        title: "Reflection Practice — one private rehearsal",
        summary:
          "A short private structure for trying only the opening moment of one possible response, without deciding to use it in real life.",
        steps: [
          "Orient outward through one neutral detail or point of orientation available to you. No posture, touch, breath change, particular sense, stillness, or calm is required, and reading only is available.",
          "Bring to mind one manageable ordinary moment, or keep this entirely general. No names or identifying details are needed. Please do not use the most dangerous, traumatic, overwhelming, or high-consequence situation you are living with.",
          "If it is clear, name the familiar response in a few words, without judging it and without explaining where it came from. If it is unclear, leave it unnamed.",
          "Name one slightly different possibility: a pause and orienting outward; asking for time; one brief first-person sentence; preparing a limit; preparing a request; a less hostile way of speaking to yourself; telling a private truth or naming grief; preparation only; or nothing outward at all.",
          "Try only its opening moment, once — in silent words, in writing you will not send, or as a simple outline. There is no need to replay a whole scene. If imagining or turning inward is unhelpful, read this step only.",
          "Notice whether it seems usable, incomplete, unclear, unavailable, or unwise. No bodily response is required, and discomfort is not proof of growth.",
          "Ask what condition would matter before any real-world use: time, privacy, support, an accommodation, someone else carrying a message, the ability to stop, or safer circumstances. “I do not know” and “not available” are both valid answers.",
          "Reorient outward however suits you. The response can be revised, kept private, discarded, or never used.",
        ],
        notRequired:
          "No confrontation, disclosure, sending a message, contact, real-world test, emotional release, decision, outcome, particular body or breath response, or change is required. You may stop at any point.",
      },
      spiritual: {
        title: "Scripture & Spiritual Reflection — honest rehearsal before God",
        summary:
          "A Christian path for bringing one manageable concern and one possible response before God, without treating prayer as a promise or command.",
        steps: [
          "Orient outward however works for you. Reading only is available here too.",
          "Read Psalm 62:8 below, only if you would like to.",
          "Bring one manageable concern, or keep it general. Please leave aside anything that is dangerous or high-risk right now.",
          "Pour out only as much as fits. Anger, grief, doubt, numbness, difficulty trusting, silence, or having no words at all may all be present.",
          "If it is clear, name the familiar response without a moral verdict. If it is unclear, let it stay unclear.",
          "Name one possible alternative that seems truthful while leaving safety and real-world use undecided: a pause, a short sentence, a prepared limit or request, a more compassionate word to yourself, private lament, preparation, or nothing outward.",
          "Rehearse only its opening moment, once — in words, in writing, or in silence before God. Hold it as a possibility, not a vow, not a divine command or direction, not proof of faith, and not a promise to act.",
          "Name any practical support, safety, accommodation, or wisdom that would be needed. Prayer does not replace real-world help or planning.",
          "Reorient outward. No relief, certainty, trust, felt refuge or closeness, forgiveness, reconciliation, contact, disclosure, or action is required.",
        ],
        notRequired:
          "No confrontation, disclosure, sending a message, contact, real-world test, emotional release, decision, outcome, particular body or breath response, or change is required. You may stop at any point or leave this path entirely.",
        scripture: {
          reference: "Psalm 62:8 (World English Bible)",
          body: "Trust in him at all times, you people. Pour out your heart before him. God is a refuge for us. Selah.",
          note: "This is the psalmist's invitation to speak honestly. It does not explain suffering, does not declare a situation safe, does not promise that refuge will be felt, does not require trust on command, and does not turn a rehearsed response into divine direction.",
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
      intro: "This reflection uses only what was selected; it will not fill in what was left open.",
      sections: [
        {
          id: "hearing",
          title: "The response — or what remained open",
          from: "practice",
          lines: {
            grounding:
              "You considered a pause and orienting outward. Nothing here says whether it would be available under pressure, or what it would change.",
            unsent:
              "You considered putting private words to what you feel or need. The words themselves are not collected, and nothing about them is assumed.",
            boundary:
              "You considered rehearsing a limit or a delay. Whether such a limit is safe, available, or ready for real life is not established here.",
            support:
              "You considered rehearsing asking for one kind of support. No person, request, or disclosure is identified.",
            lament:
              "You considered naming grief, anger, disappointment, or longing privately. No history, cause, or required release is inferred.",
            prepare:
              "You considered preparing without deciding to act. Preparation stands on its own here, with no action implied.",
            loosen:
              "You considered a very small variation in a familiar response. No pattern, reason, or outcome is inferred from that.",
            unclear:
              "You said you were not sure what to practise. That uncertainty is left as it is, and no response will be guessed for you.",
            none:
              "You said no different response feels available today. That absence is left intact, without being treated as failure.",
            private:
              "You kept this private. Its content is not known or interpreted here.",
          },
          unanswered:
            "You left this open, and no response will be assigned. Nothing is assumed about what you might need, whether any rehearsal happened, or what may be available to you later.",
        },
        {
          id: "underneath",
          title: "The setting — or what remained open",
          from: "where",
          lines: {
            home: "You named home as a setting that came to mind. Nothing about who is there, or what happens there, is assumed.",
            work: "You named work as a setting that came to mind. No estimate is made here about power, consequences, accommodation needs, or safety.",
            family:
              "You named family as a setting that came to mind. No roles, closeness, safety, conflict, or history are assumed.",
            friend:
              "You named a friend or partner as a setting that came to mind. No closeness, safety, conflict, or history is assumed.",
            self: "You named how you speak to yourself as a setting that came to mind. No form, cause, or diagnosis is inferred.",
            faith:
              "You named faith or spiritual life as a setting that came to mind. Nothing is assumed about belief, practice, community, spiritual struggle, or whether honesty is welcomed there.",
            private:
              "You left the setting unspecified. What it refers to stays with you, and its content is not known or interpreted here.",
            other:
              "You named a setting outside the listed options. Its content is not collected here, and nothing about it is assumed.",
            unclear:
              "You said you were not sure of a setting. It stays uncertain here, and no setting will be assigned.",
            none: "You left the setting general, and none will be added. A rehearsal can stay general.",
          },
          unanswered:
            "You left the setting open, and none will be assigned. No person, relationship, risk, or context is inferred from that.",
        },
        {
          id: "next",
          title: "How today was completed — or left open",
          from: "step",
          lines: {
            again:
              "You considered reading, or privately trying, the opening of one possible response. It remains a possibility, and nothing outward follows from it.",
            sentence:
              "You considered shortening or revising one sentence. Whether it is ever spoken anywhere is left entirely open.",
            use: "You considered naming what would have to be true before any real-world use. That names conditions only; it does not commit you to using anything.",
            ground:
              "You considered keeping one accessible outward-orienting cue. Nothing is claimed about whether it will be reached for.",
            support:
              "You considered identifying support you might want before any real-world action. No contact and no disclosure are part of that.",
            prepare:
              "You chose to leave the exercise here. Nothing more is implied or required by this step.",
            unclear:
              "You said you were not sure of a step. That is left uncertain, and no step will be chosen for you.",
            none: "You said no step feels right today. That is left as it is, and none will be pressed or inferred.",
            private:
              "You kept the step private. Its content is not known or interpreted here.",
          },
          unanswered:
            "You left the step open, and none will be added. Nothing is claimed about whether any rehearsal happened, what became available, or what happens after today.",
        },

      ],
      closing:
        "A rehearsal is information, not a contract. What was selected does not establish why a response developed, whether another response is safe or available to you, whether any rehearsal took place, or what will happen under pressure.",
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
    title: "Carry It Forward",
    theme:
      "Integration and a complete stopping place without manufactured progress, forced closure, or required action.",
    motif: "carry",
    shape: "notice-first",
    descriptor: "Gathering the journey · about 15 minutes",
    arrive: {
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
        "By integration, we mean allowing pieces of experience to sit in a more workable relationship with each other. That may involve remembering, grieving, reinterpreting, practising, seeking support, setting limits, receiving accommodation, resisting harm or injustice, or leaving a question open. It does not have to produce a clear feeling or result.",
        "New life, in this series, is not going back to an untouched earlier self. It may mean relating to the same story, wounds, losses, questions, or circumstances differently—with more truth, care, support, boundaries, grief, or room for hope.",
        "Carrying something differently does not mean carrying it alone, calling harm good, suppressing lament, pretending the ashes never existed, or claiming the old story no longer matters.",
        "Some things may change. Some may need support, accommodation, advocacy, resistance, mourning, safer conditions, or time. Some may remain unresolved. Grief, illness, disability, caregiving, discrimination, unsafe conditions, financial pressure, differences in power, relationships, limited resources, and limited support are all real, and none of them is undone by an app or a closing screen.",
        "Unfinishedness may reflect circumstance, constraint, loss, other people's choices, your own responsibility, or something that is simply unclear. It is not automatically a personal failure.",
        "Carrying forward can mean keeping one sentence, knowing where to return, seeking care, allowing grief, waiting, or leaving the journey here. It does not mean carrying alone, and it does not mean taking action. Insight, action, relief, spiritual feeling, future continuation, and a next step are not required.",
      ],
      info: [
        {
          term: "What does integration mean?",
          explanation:
            "It means letting the pieces of an experience sit together in a more workable way—remembered, named, grieved, supported, limited, or left open. No insight, feeling, or outcome is required here.",
        },
        {
          term: "What does ‘carry it forward’ mean?",
          explanation:
            "It can mean keeping one sentence, revising it, knowing where to return, seeking support, waiting, or leaving it here. It never means carrying it alone.",
        },
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
              "You kept near the possibility that a familiar response may have helped you cope. This choice does not tell us where it came from, what it protected, or whether it still helps.",
            named:
              "One idea you chose to keep near is that putting words to something may change how you relate to it. This choice does not tell us that anything has become lighter or easier.",
            twopulls:
              "You kept near the idea that more than one pull or truth can be present at once. This choice does not tell us that any particular conflict is alive in you now.",
            cost:
              "You kept near the idea that noticing a possible cost is not the same as blaming yourself. This choice does not tell us what any cost is, what caused it, or where blame belongs.",
            harsh:
              "You kept near the idea that truth and responsibility do not require self-attack. This choice does not tell us how you speak to yourself, and honest accountability remains possible.",
            small:
              "One idea you chose to keep near is that a small or preparatory response can matter without proving progress. This choice does not tell us that any step has happened.",
            notalone:
              "You kept near the idea that some things may need support or safer conditions rather than more effort from you. This choice does not tell us what support exists, who is safe, or what you can reach.",
            nothing:
              "You noted that nothing feels settled or complete right now, even if an idea resonates. An idea may resonate without becoming a finished outcome, a commitment, or a clear thing to carry forward, and that can sit beside anything else you kept near.",
            unclear:
              "You noted that you are not sure what, if anything, you want to carry forward. Uncertainty stays uncertainty here, with no hidden meaning read into it.",
            private:
              "You chose to keep this private. That choice is saved on this device, and what you held privately remains yours.",
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
        title: "Scripture & Spiritual Reflection — blessing without forced closure",
        summary:
          "A Christian integration practice that leaves blessing, lament, practical care and unfinishedness in the same room.",
        steps: [
          "Let your attention rest outward for a moment in whatever way is accessible to you. Reading only is available here too.",
          "Read the blessing below if you would like to. It may feel comforting, distant, difficult, neutral, or unwelcome, and it may be set aside without any spiritual judgment.",
          "If you wish, bring before God one idea worth keeping, your uncertainty, or nothing in particular. You may also keep everything private.",
          "If you would like to, name one unfinished place. It may involve grief, responsibility, unsafe conditions, injustice, illness, lack of support, or something outside your influence. No reason for it needs to be assigned.",
          "Without forcing an answer, consider whether anything calls for action, support, accommodation, advocacy, a boundary, mourning, waiting, time, or no step at all. Prayer is not a substitute for practical care.",
          "If prayer fits, you might pray: “God of grace, hold what I cannot finish. Give me wisdom for what is mine, support for what I cannot carry alone, and freedom to leave the rest unfinished.”",
          "The blessing may remain as words on a page rather than something felt or received. Then let your attention return outward. No relief, peace, clarity, or sense of God's presence is required.",
        ],
        notRequired:
          "Not required: prayer, a profession of faith, certainty, receiving the blessing, surrendering safety or boundaries, forgiveness, reconciliation, disclosure, contact, action, spiritual experience, changed circumstances, relief, peace, closure, or any outcome.",
        scripture: {
          reference: "Numbers 6:24–26 (World English Bible)",
          body: "Yahweh bless you, and keep you. Yahweh make his face to shine on you, and be gracious to you. Yahweh lift up his face toward you, and give you peace.",
          note: "This ancient priestly blessing from Israel’s Scriptures entrusts people to God’s keeping, grace, attentive presence, and shalom. It is not a forecast that pain, danger, illness, grief, or circumstances will change, and it should not silence lament or replace practical care.",
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
        "This reflection stays with what you chose—or left open—today. It does not fill in earlier days or decide what the journey meant for you.",
      sections: [
        {
          id: "hearing",
          title: "What may be carried — or left here",
          from: "different",
          lines: {
            protective:
              "One idea you chose to keep near is that a familiar response may have helped you cope. This choice does not tell us where it began, what danger there was, what it protected, or whether it still helps.",
            named:
              "You kept near the idea that putting words to something may change how you relate to it. This choice does not tell us that anything has become lighter, clearer, or easier to manage.",
            twopulls:
              "You kept near the idea that more than one pull or truth can be present at once. This choice does not tell us that any particular conflict or ambivalence is alive in you now.",
            cost:
              "You kept near the idea that noticing a possible cost is not the same as blaming yourself. This choice does not tell us what any cost is, what caused it, what choice was available, or where blame belongs.",
            harsh:
              "You kept near the idea that truth and responsibility do not require self-attack. This choice does not tell us how you speak to yourself or how you have behaved, and honest accountability remains possible.",
            small:
              "One idea you chose to keep near is that a small or preparatory response can matter without proving progress. This choice does not tell us that any step happened or that it mattered.",
            notalone:
              "You kept near the idea that some things may need support or safer conditions rather than more effort from you. This choice does not tell us what support exists, who is safe, or what is within reach for you.",
            nothing:
              "You noted that nothing feels settled or complete right now, even if an idea resonates. An idea may resonate without becoming a finished outcome, a commitment, or a clear thing to carry forward, and nothing is promised to arrive later instead.",
            unclear:
              "You noted that you are not sure what, if anything, you want to carry forward. That uncertainty stays uncertainty here, and nothing is read into it.",
            private:
              "You chose to keep this private. That choice is saved on this device, and what was held privately remains yours—its content is not known or interpreted.",
          },
          unanswered:
            "You left the first question open. Nothing is being chosen or interpreted for you.",
        },
        {
          id: "care",
          title: "What remains unfinished — or unnamed",
          from: "unfinished",
          lines: {
            grief:
              "You named grief, loss, or mourning as something still open. This choice does not tell us any history, and no particular grief work is asked of you.",
            relationship:
              "You named something relational that remains unresolved. No contact, reconciliation, forgiveness, or action follows from that, and no one is treated here as safe or unsafe.",
            limit:
              "You named a limit, boundary, or condition that may need consideration. This choice does not tell us that it is overdue, safe, available, or within your control.",
            support:
              "You named support, accommodation, advocacy, or practical care that is not yet in place. This choice does not tell us what service or person exists, or what you can reach.",
            self:
              "You named how you relate to yourself in difficulty as something still open. This choice does not tell us how you speak to yourself, and no compassionate outcome is required.",
            faith:
              "You named questions about faith, God, meaning, or belonging as open. No spiritual resolution, certainty, or prayer is required of you.",
            rest:
              "You named rest, reduced demand, or recovery time as something still open. Rest may not be available to you, and that is not a fault of yours.",
            unclear:
              "You noted that something remains open that you cannot or do not want to name. Its content stays yours, and nothing is promised to emerge later.",
            outside:
              "You noted that what remains is mostly outside your control or influence. That limit is respected here, and responsibility is not handed back to you.",
            none:
              "You noted that nothing in particular feels unfinished today. That is left exactly as it is.",
            private:
              "You kept this unfinished place private. That privacy choice is saved on this device, and its content is not known or interpreted.",
          },
          unanswered:
            "You did not name an unfinished place. Nothing needs to be added.",
        },
        {
          id: "next",
          title: "How the journey was left — or left open",
          from: "step",
          lines: {
            support:
              "You chose to identify one possible kind of support, accommodation, advocacy, or practical care. This choice does not tell us that anyone was contacted, that a service exists, or that it is within reach.",
            conversation:
              "You chose to prepare one sentence you might share. Nothing has to be sent or said, no one is treated here as safe, and this choice does not tell us that anything happened.",
            limit:
              "You chose to name one limit or condition you may want to consider. This choice does not tell us that it is safe, available, or acted on.",
            rest:
              "You chose to identify one realistic form of rest or reduced demand. Rest may not be available to you, and this choice does not tell us that anything changed.",
            kind:
              "You chose to keep one fair sentence for a difficult moment. No daily promise, habit, or effect follows from that.",
            revisit:
              "You chose one day or practice you may return to. Nothing is scheduled, and returning is not required.",
            prepare:
              "You chose to let the journey end here with nothing outward required. Nothing further follows from that.",
            unavailable:
              "You noted that a step may matter, but none feels safe or available now. That stays exactly as you left it, and nothing is asked of you.",
            unclear:
              "You noted that you are not sure how you want to leave this. That uncertainty stays as uncertainty.",
            none:
              "You noted that no next step feels right or needed today. That stays exactly as you left it.",
            private:
              "You kept how you are leaving this journey private. That choice is saved on this device, and no private content is known or inferred.",
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
