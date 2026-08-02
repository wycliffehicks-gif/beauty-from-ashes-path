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
            self: "Something of your own was selected as the thread that matters — a preference or interest, rather than a duty.",
            body: "Your body or a physical need was selected as the thread that matters, in whatever form is available to you.",
            reality: "One ordinary part of the present was selected as the thread that matters.",
            values: "A chosen quality or direction was selected as the thread that matters.",
            creativity: "Creativity, beauty, learning or nature was selected as the thread that matters — making or noticing.",
            person: "One person who may be safe enough was selected as the thread that matters. No contact is required, and uncertain safety means no contact.",
            community: "A community, culture, tradition or place of belonging was selected as the thread that matters, with nothing to perform.",
            god: "God was selected as the thread that matters, within the Christian path offered here.",
            other: "Something outside the listed routes was selected as the thread that matters. It does not need to be described here to be real.",
            unclear: "Uncertainty about what matters, or where to begin, was selected. That uncertainty is left as it is, with no direction supplied and no meaning read into it.",
            none: "Nothing available or safe to reconnect with today was selected. That absence is left intact, without a hidden reason and without being treated as failure.",
            private: "A private direction was selected. That structured choice is saved on this device; the direction itself is not recorded here, and none will be inferred.",
          },
          unanswered:
            "No thread was selected, and none will be assigned. The direction simply remains open; no personal meaning or conclusion is drawn from that.",
        },
        {
          id: "care",
          title: "What may deserve care now",
          from: "size",
          lines: {
            tiny: "Naming or noticing only was selected as the amount of contact available now.",
            small: "A few private minutes, or one small moment, was selected as the amount available now.",
            moderate: "One small outward action, if safe and realistic, was selected as the amount available now.",
            rehearse: "Keeping it inward — remembered, imagined or symbolic — was selected as the amount available now.",
            unclear: "Uncertainty about what amount fits was selected. It stays uncertain here, and no amount will be suggested in its place.",
            none: "No available contact today was selected. That is left as it is, with nothing read into it.",
            private: "A private amount was selected. That structured choice is saved on this device; the amount itself is not recorded, and none will be inferred.",
          },
          unanswered:
            "No amount was selected. What is available remains open, and no amount will be estimated or supplied here.",
        },
        {
          id: "next",
          title: "One honest next step",
          from: "step",
          lines: {
            act: "Making one small, safe space for something that matters was selected as the step.",
            message: "Drafting one brief message to someone safe enough was selected as the step. Drafting without sending is the whole step if that is what happens.",
            outside: "A window, sound, object, memory, or another point of contact within reach was selected as the step. No change in how you feel is promised.",
            own: "A few minutes for something that is yours and not a duty was selected as the step.",
            rehearse: "Keeping it inward — naming or remembering what matters — was selected as the step. That naming is the whole of it.",
            unclear: "Uncertainty about which step fits was selected. No step will be chosen for you.",
            none: "No available step was selected, and none will be pressed or inferred.",
            private: "A private step was selected. That structured choice is saved on this device; what the step is remains yours alone.",
          },
          unanswered:
            "No step was selected. Nothing will be assumed about what you may or may not do after this page.",
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
          heading: "What was selected — and what is not established",
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
              "That no different response feels available today was selected, and that is left intact. It is treated as accurate information, not as failure.",
            private:
              "A private choice was selected. The structured choice is saved on this device; what it refers to stays with you and is not collected here.",
          },
          unanswered:
            "This page was continued without a selection, and nothing will be chosen on your behalf. The shared practice ahead does not depend on a choice, and it can be read only.",
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
      heading: "Two ways to rehearse without committing to act.",
      intro:
        "Both paths below work whether or not anything was selected earlier, and whether what you have in mind is clear, unclear, private, or absent.",
      either:
        "Either, both, or neither. Reading only is complete, stopping at any point is complete, and leaving the exercise unfinished is complete.",
      reflection: {
        title: "Reflection Practice — one private rehearsal",
        summary:
          "A short private structure for trying only the opening moment of one possible response, without using it anywhere.",
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
          "No confrontation, disclosure, message sent, contact, real-world test, emotional release, decision, outcome, particular body or breath response, and no change is required. You may stop at any point.",
      },
      spiritual: {
        title: "Scripture & Spiritual Reflection — honest rehearsal before God",
        summary:
          "A Christian path through the same movement, at the same depth, offered only if you choose it.",
        steps: [
          "Orient outward however works for you. Reading only is available here too.",
          "Read Psalm 62:8 below, only if you would like to.",
          "Bring one manageable concern, or keep it general. Please leave aside anything that is dangerous or high-risk right now.",
          "Pour out only as much as fits. Anger, grief, doubt, numbness, difficulty trusting, silence, or having no words at all may all be present.",
          "If it is clear, name the familiar response without a moral verdict. If it is unclear, let it stay unclear.",
          "Name one possible alternative that would be truthful and safe for you: a pause, a short sentence, a prepared limit or request, a more compassionate word to yourself, private lament, preparation, or nothing outward.",
          "Rehearse only its opening moment, once — in words, in writing, or in silence before God. Hold it as a possibility, not a vow, not a divine command or direction, not proof of faith, and not a promise to act.",
          "Name any practical support, safety, accommodation, or wisdom that would be needed. Prayer does not replace real-world help or planning.",
          "Reorient outward. No relief, certainty, trust, felt refuge or closeness, forgiveness, reconciliation, contact, disclosure, or action is required.",
        ],
        notRequired:
          "No confrontation, disclosure, message sent, contact, real-world test, emotional release, decision, outcome, particular body or breath response, and no change is required. Stopping at any point is available, and you may leave this path entirely.",
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
      prompt: "How would you like to complete today's rehearsal—if one choice fits?",
      hint: "One choice if one fits. Reading, or leaving it open, remains available.",
      select: "one",
      options: [
        { id: "again", label: "Read or rehearse the response once more, privately" },
        { id: "sentence", label: "Shorten or revise one sentence until it sounds like me" },
        { id: "use", label: "Name what would have to be true before any real-world use" },
        { id: "ground", label: "Keep one accessible outward-orienting cue" },
        {
          id: "support",
          label:
            "Identify support I might want before any real-world action — no contact or disclosure today",
        },
        { id: "prepare", label: "Leave it here; reading or rehearsing was enough" },
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
              "A pause and orienting outward was selected. Nothing here says whether it would be available under pressure, or what it would change.",
            unsent:
              "Putting private words to what you feel or need was selected. The words themselves are not collected, and nothing about them is assumed.",
            boundary:
              "Rehearsing a limit or a delay was selected. Whether such a limit is safe, available, or ready for real life is not established here.",
            support:
              "Rehearsing asking for one kind of support was selected. No person, request, or disclosure is identified.",
            lament:
              "Naming grief, anger, disappointment, or longing privately was selected. No history, cause, or required release is inferred.",
            prepare:
              "Preparing without deciding to act was selected. Preparation stands on its own here, with no action implied.",
            loosen:
              "A very small variation in a familiar response was selected. No pattern, reason, or outcome is inferred from that.",
            unclear:
              "Not being sure what to practise was selected. That uncertainty is left as it is, and no response will be guessed for you.",
            none:
              "That no different response feels available today was selected. That absence is left intact, without being treated as failure.",
            private:
              "A private choice was selected. That structured choice is saved on this device, and its content stays with you.",
          },
          unanswered:
            "No response was selected here, and none will be assigned. Nothing is assumed about what you might need, whether any rehearsal happened, or what may be available to you later.",
        },
        {
          id: "underneath",
          title: "The setting — or what remained open",
          from: "where",
          lines: {
            home: "Home was selected as a setting that came to mind. Nothing about who is there, or what happens there, is assumed.",
            work: "Work was selected as a setting that came to mind. No estimate is made here about power, consequences, accommodation needs, or safety.",
            family:
              "Family was selected as a setting that came to mind. No roles, closeness, safety, conflict, or history are assumed.",
            friend:
              "A friend or partner was selected as a setting that came to mind. No closeness, safety, conflict, or history is assumed.",
            self: "How you speak to yourself was selected as a setting that came to mind. No form, cause, or diagnosis is inferred.",
            faith:
              "Faith or spiritual life was selected as a setting that came to mind. Nothing is assumed about belief, practice, community, spiritual struggle, or whether honesty is welcomed there.",
            private:
              "Keeping the setting unspecified was selected. That structured choice is saved on this device, and what it refers to stays with you.",
            other:
              "A setting outside the listed options was selected. Its content is not collected here, and nothing about it is assumed.",
            unclear:
              "Not being sure of a setting was selected. It stays uncertain here, and no setting will be assigned.",
            none: "No particular setting was selected, and none will be added. A rehearsal can stay general.",
          },
          unanswered:
            "No setting was selected here, and none will be assigned. No person, relationship, risk, or context is inferred from that.",
        },
        {
          id: "next",
          title: "How today was completed — or left open",
          from: "step",
          lines: {
            again:
              "Reading or rehearsing the response once more, privately, was selected. It stays private, and nothing outward follows from it.",
            sentence:
              "Shortening or revising one sentence was selected. Whether it is ever spoken anywhere is left entirely open.",
            use: "Naming what would have to be true before any real-world use was selected. That names conditions only; it does not commit you to using anything.",
            ground:
              "Keeping one accessible outward-orienting cue was selected. Nothing is claimed about whether it will be reached for.",
            support:
              "Identifying support you might want before any real-world action was selected. No contact and no disclosure are part of that.",
            prepare:
              "Leaving it here was selected, with reading or rehearsing being enough. That is complete as it stands.",
            unclear:
              "Not being sure of a step was selected. That is left uncertain, and no step will be chosen for you.",
            none: "That no step feels right today was selected. That is left as it is, and none will be pressed or inferred.",
            private:
              "A private step was selected. That structured choice is saved on this device, and its content stays with you.",
          },
          unanswered:
            "No step was selected here, and none will be added. Nothing is claimed about whether any rehearsal happened, what became available, or what happens after today.",
        },
      ],
      closing:
        "A rehearsal is information, not a contract. What was selected does not establish why a response developed, whether another response is safe or available to you, whether any rehearsal took place, or what will happen under pressure.",
    },
    close: {
      heading: "Possibility, not a promise.",
      body: [
        "Whether today was rehearsed, read, kept private, or left open, no real-world action was required, and none is required now.",
        "A private rehearsal may make one option feel more familiar, may show that it needs revising or needs support, or may leave it unavailable for now. It does not guarantee access under pressure, and it does not make a situation safe.",
        "Day 10 gathers what may be worth keeping, what remains unfinished, and what support or next step, if any, fits your actual life.",
      ],
      carryForward: "I can rehearse a possibility without promising to use it.",
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
