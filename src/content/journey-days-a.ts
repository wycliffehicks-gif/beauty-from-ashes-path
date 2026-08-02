// The First Journey — Days 1–5.
// PROVISIONAL copy. Founder content review required before any public use.

import type { JourneyDayContent } from "./journey-types";

export const DAYS_ONE_TO_FIVE: JourneyDayContent[] = [
  {
    day: 1,
    title: "Begin Where You Are",
    theme: "Starting honestly, rather than starting well.",
    motif: "threshold",
    shape: "standard",
    descriptor: "Arriving honestly · about 10 minutes",
    arrive: {
      lead: "You do not have to be ready. You only have to be here.",
      body: [
        "This is the first day of a short journey. Nothing here is timed, scored or compared, and nothing you choose is seen by another person.",
        "Today is about arriving as you actually are — tired, guarded, unsure, hopeful, or several of those at once.",
      ],
      settle: [
        "Let your eyes travel slowly around the room you are in and rest on one ordinary object.",
        "Feel where your body is supported — the chair, the floor, the bed beneath you.",
        "Let the next out-breath be a little longer than the one before it, without forcing anything.",
      ],
    },
    understand: {
      heading: "Why starting is hard, and why that makes sense",
      body: [
        "Most people who open something like this have already tried to feel better in other ways. Putting a difficulty off is rarely laziness. Avoidance is usually protective: it keeps a person functioning when looking directly at something feels like more than they can hold.",
        "That protection was not a mistake. It may still be doing quiet work now. So this journey does not ask you to tear it down. It asks something smaller: to let one honest thing become visible, at a pace your body can bear.",
        "You will not be asked to relive anything, explain yourself, or tell this app anything private.",
      ],
      info: [
        {
          term: "What does “protective” mean here?",
          explanation:
            "It means a response that once helped you cope or stay safe, even if it costs you something now. Calling it protective is not praise or blame — it is simply a more accurate description than “weakness”.",
        },
      ],
    },
    questions: [
      {
        id: "state",
        eyebrow: "Notice",
        prompt: "As you sit down with this, how is it being you today?",
        hint: "One choice. There is no better or worse answer, and you can change it later.",
        select: "one",
        options: [
          { id: "heavy", label: "Heavy or worn down" },
          { id: "tense", label: "Tense, braced, on alert" },
          { id: "flat", label: "Flat or far away from myself" },
          { id: "restless", label: "Restless — hard to settle" },
          { id: "tender", label: "Tender, close to tears" },
          { id: "steady", label: "Steadier than usual" },
          { id: "unsure", label: "I genuinely can't tell" },
        ],
        echo: {
          heading: "What that might mean today",
          byOption: {
            heavy:
              "Heaviness often means you have been carrying something for longer than you have admitted, not that you are failing. Today can be small.",
            tense:
              "Bracing is the body staying ready for something. It usually has a history. We will not ask you to relax on command.",
            flat:
              "Feeling far away is common and protective. Nothing today depends on you feeling more than you feel.",
            restless:
              "Restlessness can be energy with nowhere safe to go. Movement while you read this is completely allowed.",
            tender:
              "Tenderness usually means something true is close to the surface. You can go slowly and still be doing this properly.",
            steady:
              "Steadier days are good days to look at something honestly, while there is a little room to do it.",
            unsure:
              "Not being able to tell is an honest answer, and a common one. You can stay near the question without solving it.",
          },
          unanswered:
            "You continued without choosing, and that is a real answer too. Sometimes the state we are in has no available word — the day works the same without one.",
          closing: "Whatever is here right now is the material we work with. Nothing needs to change first.",
        },
      },
      {
        id: "brought",
        eyebrow: "Choose",
        prompt: "What brought you here — in plain words?",
        hint: "Choose as many as fit. You are not committing to working on any of them.",
        select: "many",
        options: [
          { id: "stuck", label: "I feel stuck and can't see the way out" },
          { id: "loss", label: "Something was lost, or someone was" },
          { id: "hurt", label: "Something happened that I have never resolved" },
          { id: "tired", label: "I am worn out from holding everything together" },
          { id: "distant", label: "I feel distant — from people, from myself, from God" },
          { id: "shame", label: "I am carrying something I feel bad about" },
          { id: "hope", label: "I want to hope again and don't know how" },
          { id: "private", label: "I would rather not put it into words here" },
        ],
      },
    ],
    practise: {
      heading: "Two ways to practise today",
      intro:
        "Both practices below do the same work in different language. Each takes two or three minutes.",
      either:
        "You may open one, do it, come back and open the other, or continue after just one. Neither is the better choice.",
      reflection: {
        title: "Reflection Practice — one honest “Right now…”",
        summary:
          "A short way of telling yourself the truth without having to explain or justify it to anyone.",
        steps: [
          "Sit or stand however you are, and let your attention come to the room rather than your thoughts.",
          "Name silently three things you can see. Ordinary things: a mug, a door frame, the light on the wall.",
          "Notice one place in your body that is holding on — jaw, shoulders, chest, stomach. Do not try to change it.",
          "Say one sentence to yourself, beginning with “Right now…”. For example: “Right now, I am tired and I still showed up.”",
          "Say it once more, slowly. Then let it go and return your attention to the room.",
        ],
        notRequired:
          "You do not have to write it down, say it aloud, or tell anyone. Thinking it once is enough.",
      },
      spiritual: {
        title: "Scripture & Spiritual Reflection — an honest opening",
        summary:
          "A Christian pathway, offered only if you choose it. It is an invitation, not a requirement or a test of faith.",
        steps: [
          "Read the passage once slowly. Read it again, more slowly still.",
          "Notice this is a request, not a verdict: the writer is asking to be known, rather than being inspected against his will.",
          "If you want to, borrow the writer's honesty and say one plain sentence of your own — including doubt, anger or silence if that is what is true.",
          "If prayer is difficult or unwanted today, simply sit with the words for a few breaths. That is a complete way to do this.",
        ],
        notRequired:
          "No belief, certainty or particular feeling is required. Silence counts. You may also leave this path entirely.",
        scripture: {
          reference: "Psalm 139:23–24 (World English Bible)",
          body: "Search me, God, and know my heart. Try me, and know my thoughts. See if there is any wicked way in me, and lead me in the everlasting way.",
          note: "This is not surveillance and it is not an accusation. It reads more like a person opening a door they have kept shut, in their own time.",
        },
      },
    },
    step: {
      id: "step",
      eyebrow: "One Honest Step",
      prompt: "What small step feels genuinely possible before tomorrow?",
      hint: "Small counts. Preparation counts. Choose one.",
      select: "one",
      options: [
        { id: "name", label: "Hold one honest word for what is going on", note: "Privately, without explaining it to anyone." },
        { id: "care", label: "Do one small thing that cares for my body", note: "Water, food, rest, air, a shower." },
        { id: "tell", label: "Say one true sentence to someone safe" },
        { id: "return", label: "Come back to Day 2 when there is space" },
        { id: "prepare", label: "Nothing outward today — simply noticing is my step" },
      ],
    },
    reflection: {
      intro:
        "This is drawn only from what you chose today. It is tentative on purpose, and it may be wrong.",
      sections: [
        {
          id: "hearing",
          title: "What I'm hearing",
          from: "state",
          opening: "From what you selected today, it sounds like this:",
          lines: {
            heavy: "You arrived carrying something heavy, and you opened this anyway.",
            tense: "You arrived braced, as though some part of you is still standing guard.",
            flat: "You arrived at a distance from yourself, which often means something is being kept at arm's length for good reason.",
            restless: "You arrived restless, with energy that has not found anywhere useful to go.",
            tender: "You arrived tender, with something close to the surface.",
            steady: "You arrived steadier than usual, and you chose to use that steadiness for something honest.",
            unsure: "You arrived unable to name your state, which is its own kind of honesty.",
          },
          unanswered:
            "You moved through today without naming how you arrived. That is allowed, and it does not make this less real: you still came, and you stayed to the end.",
        },
        {
          id: "underneath",
          title: "What may be underneath",
          from: "brought",
          opening: "You named what brought you here. Perhaps some of this fits:",
          lines: {
            stuck: "Feeling stuck often means there is a real obstacle that has not yet been named, rather than a shortage of willpower.",
            loss: "Loss can keep asking for attention long after we expect it to be finished with us.",
            hurt: "Something unresolved may still be shaping ordinary days, quietly and without permission.",
            tired: "Holding everything together is work. Exhaustion may be the honest cost of doing it for a long time.",
            distant: "Distance is often protective before it is a problem — it usually starts as a way of getting through.",
            shame: "What we feel bad about tends to grow in private. It may need company more than it needs judgement.",
            hope: "Wanting to hope again, while not knowing how, is not a contradiction. It is often where hope begins.",
            private: "You kept the details to yourself, and that is a reasonable way to begin something new.",
          },
          unanswered:
            "You did not name what brought you here, and nothing about you needs to be guessed. What can be said is that something made today worth beginning.",
        },
        {
          id: "care",
          title: "What may deserve care now",
          opening:
            "Beginning is not a small thing when a difficulty has been kept at a distance for a while.",
          unanswered:
            "Whatever else is true, the part of you that opened this may deserve some credit rather than more pressure.",
        },
        {
          id: "next",
          title: "One honest next step",
          from: "step",
          lines: {
            name: "Holding one honest word may be enough to keep today from disappearing.",
            care: "One small act of physical care is a real step, not a substitute for one.",
            tell: "One true sentence to someone safe can change how heavy a thing feels to carry.",
            return: "Coming back when there is space is a step, not a delay.",
            prepare: "Preparation counts. Noticing is where almost everything else begins.",
          },
          unanswered:
            "No step was chosen, and none is owed. If anything at all carries forward, let it be that beginning happened.",
        },
      ],
      closing:
        "Nothing here is a diagnosis or an assessment. It is a way of being accompanied for a moment.",
    },
    close: {
      heading: "You began",
      body: [
        "You did not have to open this today, and you did. Whatever else the journey holds, that part is already done.",
        "There is nothing to complete before tomorrow, and no streak to protect.",
      ],
      carryForward:
        "Carry forward one sentence: I am allowed to start from where I actually am.",
    },
  },

  {
    day: 2,
    title: "Notice What Is Here",
    theme: "Telling sensation, feeling, thought and pressure apart.",
    motif: "attention",
    shape: "notice-first",
    descriptor: "Gentle attention · about 10 minutes",
    arrive: {
      lead: "Before anything can change, it helps to know what is actually here.",
      body: [
        "Today is quieter than it sounds. You are not asked to produce a feeling, dig anything up, or reach a conclusion.",
        "We will simply separate a few things that usually arrive tangled together.",
      ],
      settle: [
        "Settle however your body allows today — seated, lying down, standing or moving. Nothing here needs a particular posture.",
        "If shifting position is uncomfortable or painful, stay exactly as you are. Comfort matters more than any instruction.",
        "Look at one thing across the room for the length of two ordinary breaths. Attention outward is enough; you do not need to attend inward at all.",
      ],
    },
    understand: {
      label: "Listen",
      heading: "Four different things, often mistaken for each other",
      body: [
        "A sensation is physical: tightness, heat, weight, buzzing, emptiness. A feeling is emotional: sadness, fear, irritation, longing. A thought is a sentence your mind offers, true or not. A pressure is a demand — from work, family, money, faith or from yourself.",
        "These get bundled into one word, usually “stressed” or “fine”. Separating them can make it easier to describe what is happening and decide what, if anything, needs attention.",
        "If nothing registers at all, that is information too, and today has a route for it.",
      ],
      info: [
        {
          term: "What if I feel numb?",
          explanation:
            "Flatness or numbness can have many meanings—or no clear meaning yet. You do not need to work out why, and you are not being asked to feel more than you do.",
        },
      ],
    },
    questions: [
      {
        id: "body",
        eyebrow: "Notice",
        prompt: "What sensations, if any, are most noticeable in your body right now?",
        hint: "Choose any that feel close, or choose none. You do not have to search.",
        select: "many",
        options: [
          { id: "chest", label: "Chest — tight, full or hollow" },
          { id: "throat", label: "Throat or jaw — held, clenched" },
          { id: "stomach", label: "Stomach — knotted or unsettled" },
          { id: "shoulders", label: "Shoulders or back — carrying weight" },
          { id: "head", label: "Head — busy, foggy, aching" },
          { id: "limbs", label: "Arms and legs — heavy or restless" },
          {
            id: "nothing",
            label: "Nothing much registers right now",
            exclusive: true,
          },
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
            chest:
              "You noticed tightness, fullness or hollowness in your chest. A sensation can have many possible causes and does not tell us by itself what it means.",
            throat:
              "You noticed holding or clenching around your throat or jaw. You can notice it without deciding why it is present.",
            stomach:
              "You noticed a knotted or unsettled feeling in your stomach. That is enough information for this moment.",
            shoulders:
              "You noticed weight or tension around your shoulders or back. You do not need to explain it here.",
            head: "You noticed busyness, fogginess or aching in your head. Several physical, emotional or situational factors may contribute.",
            limbs:
              "You noticed heaviness or restlessness in your arms or legs. You can stay with the description without assigning a cause.",
            nothing:
              "Nothing much registered right now. You do not need to search for a sensation or decide what that means.",
          },
          unanswered:
            "You continued without selecting anything, which is fine. There is nothing you owe this screen, and attention can be its own practice.",
          closing:
            "You can stay curious without deciding what any sensation means today.",
        },
      },
      {
        id: "load",
        eyebrow: "Sort",
        prompt: "And what has the day mostly been made of?",
        hint: "Choose any that fit. This is sorting, not confessing.",
        select: "many",
        options: [
          { id: "feeling", label: "Feelings — sadness, fear, anger, longing" },
          { id: "thoughts", label: "Thoughts that keep circling" },
          { id: "pressure", label: "Pressure and demands from outside" },
          { id: "selfpressure", label: "Pressure I put on myself" },
          { id: "tiredness", label: "Plain tiredness" },
          { id: "flat", label: "Very little of anything — flat" },
        ],
      },
    ],
    practise: {
      heading: "Two ways to practise today",
      intro: "Both are short. Both work whether or not you can feel much.",
      either:
        "Either or both. You can open one, return, and open the other, or continue after one.",
      reflection: {
        title: "Reflection Practice — a map for your attention",
        summary:
          "A structured two-minute practice that gives your attention somewhere specific to go. Two routes are offered: inward or outward. Both are complete.",
        steps: [
          "Choose one route. Inward attention is optional, and the outward route is equally complete.",
          "Outward route: look slowly around the room and notice five neutral things — by colour, by shape, or by where they sit in the space.",
          "Name each one silently as you find it, at whatever pace suits you. There is nothing to score.",
          "Inward route, only if it feels workable today: notice contact and temperature where your body meets what is supporting you. Two breaths.",
          "Inward route, continuing: notice one other area — stomach, chest, or jaw — and whether anything is settled, tight or unclear. Two breaths.",
          "Finish either route by naming, silently, one word for the whole of it — even if the word is “blank”.",
        ],
        notRequired:
          "You are not aiming to become calm, and nothing has to change. If inward attention feels unsettling, use the outward route only. Two stops is a complete practice.",
      },
      spiritual: {
        title: "Scripture & Spiritual Reflection — permission to lament",
        summary:
          "A Christian pathway for days when faith feels thin. Choose it only if you want it.",
        steps: [
          "Read the passage once. Notice that the writer is not pretending to be fine.",
          "Notice, too, that he speaks to himself and to God at the same time, and does not resolve it in one line.",
          "If you wish, name one honest thing to God the way the writer does — including “I don't know where you are” if that is true.",
          "Sit for a few breaths afterwards. You do not need to arrive at hope by the end of the passage; the psalm itself takes longer than that.",
        ],
        notRequired:
          "Doubt does not disqualify you from this. You may read the passage without praying, or leave this path entirely.",
        scripture: {
          reference: "Psalm 42:3, 5 (World English Bible)",
          body: "My tears have been my food day and night… Why are you in despair, my soul? Why are you disturbed within me? Hope in God!",
          note: "The psalm holds despair and hope in the same breath, without hurrying past the first to reach the second.",
        },
      },
    },
    step: {
      id: "step",
      eyebrow: "One Honest Step",
      prompt: "What might you do with what you noticed today?",
      hint: "One choice. It should be small enough that today's version of you can do it.",
      select: "one",
      options: [
        { id: "checkin", label: "Check in with my body once more later today" },
        { id: "ease", label: "Loosen one held place — jaw, shoulders, hands" },
        { id: "rest", label: "Give myself ten honest minutes of rest" },
        { id: "word", label: "Write down one word and leave the reflection there for today" },
        {
          id: "share",
          label: "Share one honest sentence with someone I trust",
          note: "Only if that relationship feels safe.",
        },
        { id: "prepare", label: "Nothing outward — noticing was the step" },
      ],
    },
    reflection: {
      intro: "Built only from what you selected today, and offered tentatively.",
      sections: [
        {
          id: "hearing",
          title: "What I'm hearing",
          from: "body",
          opening: "You noticed the following:",
          lines: {
            chest: "You noticed tightness, fullness or hollowness in your chest.",
            throat: "You noticed holding or clenching around your throat or jaw.",
            stomach: "You noticed a knotted or unsettled feeling in your stomach.",
            shoulders: "You noticed weight or tension around your shoulders or back.",
            head: "You noticed busyness, fogginess or aching in your head.",
            limbs: "You noticed heaviness or restlessness in your arms or legs.",
            nothing:
              "Nothing much registered right now, and you do not need to decide what that means.",
          },
          unanswered:
            "Nothing was selected today, and nothing was needed. Attention was given, and that is the substance of this day.",
        },
        {
          id: "underneath",
          title: "What may be happening underneath",
          from: "load",
          opening: "Sorting what the day was made of can help you describe it. From your choices:",
          lines: {
            feeling:
              "You identified feelings as part of today. That names one part of your experience without requiring an explanation.",
            thoughts:
              "You identified circling thoughts. They may be tiring even when no clear answer is available.",
            pressure:
              "You identified pressure and demands from outside. That pressure is real, and it does not stop being real because you are coping with it.",
            selfpressure:
              "You identified pressure you place on yourself. It may be taking up more space than it appears to.",
            tiredness:
              "You identified tiredness as part of today. It may deserve practical care rather than judgement.",
            flat: "You identified flatness or very little registering. You do not need to decide what it means.",
          },
          unanswered:
            "The day was not sorted into parts, and it does not have to be. Noticing that something is here is the first move; naming it can wait.",
        },
        {
          id: "next",
          title: "One honest next step",
          from: "step",
          lines: {
            checkin: "One more check-in later today keeps this from being a one-off exercise.",
            ease: "Loosening one held place is a small, real act of care.",
            rest: "Ten honest minutes of rest is not indulgence; it is maintenance.",
            word: "Writing down one word and leaving the reflection there is a reasonable way to carry a day.",
            share:
              "One honest sentence to someone you trust can lighten a day — as long as that relationship feels safe to you.",
            prepare: "Noticing was the step. That is a complete answer.",
          },
          unanswered:
            "Nothing was chosen, and nothing is owed. The attention you gave today already happened.",
        },
      ],
      closing:
        "Only you know the fuller context. Keep what fits and leave what does not.",
    },
    close: {
      heading: "Enough noticing for one day",
      body: [
        "You looked at what was here without needing to fix it — whether you selected something or continued without selections. Either way, you gave this some attention.",
        "The next day gives words to some of it — gently, and without requiring anything you do not want to name. You can go on when you are ready, or stop here.",
      ],
      carryForward:
        "Carry forward one sentence: what I notice does not have to be dramatic to be true.",
    },
  },

  {
    day: 3,
    title: "Name What You're Carrying",
    theme: "Giving a plain word to something that has stayed wordless.",
    motif: "naming",
    shape: "standard",
    descriptor: "Finding words · about 12 minutes",
    arrive: {
      lead: "Naming something is not the same as fixing it, and it is not a diagnosis.",
      body: [
        "Today you are invited to give one ordinary word to something you have been carrying.",
        "It does not have to be the right word or the whole truth. A word you can bear is enough.",
        "You do not need to name an event, person or history. One broad word — or no word today — is enough.",
      ],
      settle: [
        "Settle in whatever position your body allows. You do not need to change your posture.",
        "Notice the sound furthest away and then the sound closest — or, if sound is not useful, notice two colours in the room.",
        "Take one ordinary breath if that is comfortable, or simply continue.",
      ],
    },
    understand: {
      label: "Listen",
      heading: "Why a word helps",
      body: [
        "Sometimes experience arrives as a general heaviness before clear words come. A plain word can help you notice one part of it, communicate it or decide what support may be needed.",
        "A word is a beginning, not a full explanation. “I am carrying grief” is different from “grief is all I am.” Naming can create a little space between what you are experiencing and who you are.",
        "Some words bring clarity. Some feel incomplete. Naming may bring discomfort, relief, mixed feelings or no noticeable shift. You do not have to find the perfect word, and you may decide not to name anything today.",
      ],
      info: [
        {
          term: "What is the difference between naming and diagnosis?",
          explanation:
            "A diagnosis is a clinical judgement made by a qualified professional after proper assessment. Naming is simply you choosing an everyday word for your own experience. This app does not assess, diagnose, label or classify you.",
        },
        {
          term: "What does “carrying” mean here?",
          explanation:
            "When this journey speaks of what you are carrying, it means any grief, worry, responsibility, hurt, shame or unanswered question that continues to take energy — even when other people cannot see it.",
        },
        {
          term: "What does “hurt that still affects me” mean?",
          explanation:
            "Pain from something past or ongoing that still affects you. This does not mean you have failed to move on, and it does not point to one hidden cause.",
        },
      ],
    },
    questions: [
      {
        id: "carrying",
        eyebrow: "Name",
        prompt: "If you had to use plain words, what might you be carrying?",
        hint: "Choose any that fit, or continue without choosing. These are everyday words, not diagnoses.",
        select: "many",
        options: [
          { id: "grief", label: "Grief — something or someone has been lost or changed" },
          { id: "fear", label: "Fear — something feels threatening or uncertain" },
          { id: "shame", label: "Shame — a painful sense that something is wrong with me" },
          {
            id: "anger",
            label: "Anger — irritation, resentment or a sense that something is not right",
          },
          { id: "exhaustion", label: "Exhaustion — I have little or no reserve left" },
          { id: "loneliness", label: "Loneliness — I feel alone, unseen or disconnected" },
          { id: "hurt", label: "Hurt that still affects me — something painful still matters" },
          { id: "regret", label: "Regret — something I wish had been different" },
          { id: "pressure", label: "Pressure — too much is being asked of me" },
          {
            id: "unsure",
            label: "I know something is there, but I do not have a word yet",
            exclusive: true,
          },
          {
            id: "private",
            label: "I would rather not name it here today",
            exclusive: true,
          },
        ],
        echo: {
          heading: "A word for it",
          byOption: {
            grief:
              "You chose grief as one word for today. It may include many kinds of loss. You do not need to explain or solve it here.",
            fear: "You chose fear as one word for today. It deserves respectful attention without this app deciding its cause or meaning.",
            shame:
              "You chose shame — a painful sense that something is wrong with you. Shame is an experience, not proof of identity.",
            anger:
              "You chose anger as one word for today. Naming it does not require acting on it, suppressing it or deciding yet what it means.",
            exhaustion:
              "You chose exhaustion as one word for today. Having little reserve is not a moral failure, and its causes may be many.",
            loneliness:
              "You chose loneliness as one word for today. It may involve feeling alone, unseen, disconnected or something else only you can name.",
            hurt:
              "You chose hurt that still affects you as part of what you are carrying. You do not need to tell the whole story or decide what to do with it here.",
            regret:
              "You chose regret as one word for today. It names something you wish had been different without deciding what responsibility, repair or self-forgiveness may be needed.",
            pressure:
              "You chose pressure as one word for today. It may come from several places, and naming it does not mean you should be able to carry it alone.",
            unsure:
              "The word has not arrived yet. “I do not have the word yet” is itself one honest sentence.",
            private:
              "You chose not to name it here. You remain in charge of what you share, when and with whom.",
          },
          unanswered:
            "You continued without choosing a word. Nothing will be assumed. Some things are named more safely later, in private or with a person you trust.",
          closing:
            "Whatever you chose or did not choose, this may be part of what you are carrying; it is not a definition of you. You are not what you carry.",
        },
      },
      {
        id: "shows",
        eyebrow: "Locate",
        prompt: "In what parts of life, if any, does this word feel relevant right now?",
        hint: "Choose any that fit. Noticing it in more than one place does not mean those experiences share the same cause.",
        select: "many",
        options: [
          { id: "sleep", label: "Sleep — falling asleep, staying asleep, waking early" },
          { id: "patience", label: "Patience with people close to me" },
          { id: "focus", label: "Concentration and getting things done" },
          { id: "withdraw", label: "Wanting to be left alone" },
          {
            id: "body",
            label: "Physical comfort or energy — tension, appetite, pain, restlessness or fatigue",
          },
          { id: "mornings", label: "Mornings, or particular times of day" },
          { id: "faith", label: "My faith or sense of meaning" },
          { id: "hidden", label: "Other people may not see it — I usually keep it private" },
          { id: "unclear", label: "I am not sure where it shows up", exclusive: true },
        ],
        info: [
          {
            term: "A note about physical symptoms",
            explanation:
              "This reflection cannot tell you why a physical sensation is present. If a symptom is new, severe, worsening or concerning, pause and seek appropriate medical care.",
          },
        ],
      },
    ],
    practise: {
      heading: "Two ways to practise today",
      intro:
        "Both help you give one honest sentence somewhere safe enough to rest for today. One uses private reflection; the other uses Scripture and lament.",
      either:
        "Either or both. You may read without doing, stop after one step or continue without opening either.",
      reflection: {
        title: "Reflection Practice — One Honest Sentence",
        summary:
          "A private sentence that names one part of what you are carrying. No full story is required.",
        steps: [
          "Choose one broad word from today, or use “not sure”.",
          "Keep this as broad as you need. You do not have to describe what happened or include names or identifying details. You may stop or leave the sentence unfinished.",
          "Complete one sentence silently or somewhere outside this app: “I am carrying…”, “I am afraid that…”, “Something I regret is…”, “I feel unseen when…” or “What feels heaviest today is…”.",
          "Stop after one sentence. You do not have to add details or make the sentence explain everything.",
          "If body attention feels comfortable, notice whether anything shifts, tightens or stays the same. If not, notice up to three neutral details around you, using any sense that works comfortably for you.",
          "Finish with: “This is real, and it is not all that is real about me.”",
          "Let the sentence rest there for now. You do not need to keep repeating it or make it disappear.",
        ],
        notRequired:
          "The goal is not breakthrough. The goal is a little more clarity. You may keep the sentence private, write it outside the app, share it with a safe person or stop. No further disclosure is required.",
      },
      spiritual: {
        title: "Scripture & Spiritual Reflection — honest lament",
        summary:
          "A Christian pathway for giving one honest sentence to God. Choose it only if you want it.",
        steps: [
          "Read the passage and notice that the complaint is present in Scripture without being tidied up.",
          "If you wish, borrow the form “How long…” and add one honest ending.",
          "You may also say “This is what hurts…” or “What I long for is…”. One line is enough.",
          "Finish by pausing, noticing the room around you or stopping. A completed resolution is not required.",
        ],
        notRequired:
          "You may remain with the question, anger, doubt or silence. You do not have to resolve the lament or move toward praise today. You may read without praying or leave this path entirely.",
        scripture: {
          reference: "Psalm 13:1–2 (World English Bible)",
          body: "How long, Yahweh? Will you forget me forever? How long will you hide your face from me? How long shall I take counsel in my soul, having sorrow in my heart every day?",
          note: "In this translation, “Yahweh” is the divine name often rendered “LORD”. Within Scripture, lament is an established form of honest prayer, not a failure of faith.",
        },
      },
    },
    step: {
      id: "step",
      eyebrow: "One Honest Step",
      prompt: "What small, safe step — if any — fits what happened today?",
      hint: "Choose one, or continue without choosing. It should be small enough for today’s version of you.",
      select: "one",
      options: [
        {
          id: "hold",
          label:
            "Pause once today and quietly name the word to myself without trying to solve it",
        },
        { id: "write", label: "Write one honest sentence somewhere outside this app" },
        {
          id: "tell",
          label: "Share one honest sentence with someone I reasonably trust to respond with care",
          note: "Only if doing so feels safe.",
        },
        { id: "kind", label: "Say to myself, “This is real, and it is not all of me”" },
        {
          id: "prepare",
          label: "Nothing outward — finding a word, or choosing not to, was the step",
        },
      ],
    },
    reflection: {
      intro: "Built only from what you selected today and offered tentatively.",
      sections: [
        {
          id: "hearing",
          title: "What I'm hearing",
          from: "carrying",
          lines: {
            grief:
              "You chose grief. That word may include many kinds of loss, and it does not need to be solved today.",
            fear: "You chose fear. It deserves respectful attention while this reflection leaves its cause and meaning open.",
            shame:
              "You chose shame. Shame can feel like a verdict on the self, but an experience is not proof of identity.",
            anger:
              "You chose anger. Naming it does not require acting on it, suppressing it or deciding yet what it means.",
            exhaustion:
              "You chose exhaustion. Having little reserve is not a moral failure, and its causes and needs may be multiple.",
            loneliness:
              "You chose loneliness. It may involve feeling alone, unseen, disconnected or something else only you can name.",
            hurt:
              "You chose hurt that still affects you. You do not need to tell the whole story or decide what to do with it today.",
            regret:
              "You chose regret. That names something you wish had been different without deciding what responsibility, repair or self-forgiveness may be needed.",
            pressure:
              "You chose pressure. It may come from several places, and naming it does not mean you should be able to carry it alone.",
            unsure: "“I do not have the word yet” is itself an honest sentence.",
            private:
              "You chose not to name it here. You remain in charge of what you share, when and with whom.",
          },
          unanswered:
            "You did not choose a word today. Nothing will be assumed. Staying near the question — or deciding not today — is a valid place to stop.",
        },
        {
          id: "underneath",
          title: "What you noticed alongside it",
          from: "shows",
          lines: {
            sleep:
              "You noticed this alongside changes or difficulty with sleep. Sleep can be affected by many factors; no cause is being assumed here.",
            patience:
              "You noticed this alongside changes in patience with people close to you. That is useful context, not a verdict on your character.",
            focus:
              "You noticed this alongside concentration or getting things done. Many factors can affect focus; you do not have to sort them here.",
            withdraw:
              "You noticed wanting to be left alone. You do not have to decide whether that reflects rest, protection, overwhelm or something else.",
            body:
              "You noticed physical comfort or energy alongside what you are carrying. This app cannot tell why a physical symptom is present. If a symptom is new, severe, worsening or concerning, seek appropriate medical care.",
            mornings:
              "You noticed that particular times of day may feel different. The pattern can be noticed without explaining it.",
            faith:
              "You noticed this in your faith or sense of meaning. Questions, distance, anger, silence or uncertainty do not have to be resolved here.",
            hidden:
              "You noticed that other people may not see what you are carrying. You decide whether, when and with whom to share.",
            unclear: "You are not sure where it shows up. Nothing has to be located today.",
          },
          unanswered:
            "You did not identify where it may be landing, and nothing needs to be pinned down today.",
        },
        {
          id: "care",
          title: "What may deserve care now",
          opening:
            "Naming may bring clarity, discomfort, relief, mixed feelings or no noticeable shift. None of these means you failed. If what you named feels too much to carry alone, one honest sentence to a safe person or professional may be wiser than working harder by yourself.",
          unanswered:
            "Naming may bring clarity, discomfort, relief, mixed feelings or no noticeable shift. None of these means you failed. If what you named feels too much to carry alone, one honest sentence to a safe person or professional may be wiser than working harder by yourself.",
        },
        {
          id: "next",
          title: "One honest next step",
          from: "step",
          lines: {
            hold: "Quietly naming the word once, without trying to solve it, is a small practice of clarity.",
            write:
              "Writing one honest sentence may help you see it more clearly. Choose a place that feels suitably private.",
            tell: "One sentence to someone you reasonably trust may open support, but you decide how much to say and safety matters.",
            kind: "Saying it is real but not all of you separates experience from identity without denying either.",
            prepare:
              "No outward step today. Finding a word, choosing not to or simply reaching this point is enough.",
          },
          unanswered:
            "No step was chosen, and none is required. Naming, staying near the question or deciding not today may be enough.",
        },
      ],
      closing:
        "Only you know the fuller context. Keep what fits and leave what does not. You are not what you carry.",
    },
    close: {
      heading: "One honest beginning",
      body: [
        "You gave something a plain word, or you stayed near the question without forcing one. Either is enough for today.",
        "Day 4 turns toward what a response or pattern may be trying to protect. Continue when you have a little space, or stop here if you need.",
      ],
      carryForward: "What I carry is real, but it is not all that is real about me.",
    },

  },

  {
    day: 4,
    title: "What It May Have Protected",
    theme: "Meeting one familiar response with understanding rather than contempt.",
    motif: "shelter",
    shape: "standard",
    descriptor: "Understanding one response · about 12 minutes",
    arrive: {
      lead:
        "A familiar response is not the whole of who you are. It may be something you learned to do when life became difficult.",
      body: [
        "Today explores one familiar response — going quiet, taking over, staying busy, trying to get everything right, or another way of getting through — and wonders what it may have tried to prevent, preserve, or provide.",
        "You will not be asked to prove where it came from, to relive a painful event, or to give it up.",
      ],
      settle: [
        "Settle in whatever position gives you the most support. Sitting, standing, lying down or moving are all fine.",
        "Notice two or three neutral details around you, using any sense that works comfortably for you.",
        "Only if gentle contact feels comfortable, notice where your hands, feet or body meet something supportive. Otherwise keep your attention outward.",
      ],
    },
    understand: {
      label: "Listen",
      heading: "A familiar response may have had a job to do",
      body: [
        "A pattern, here, means a response someone returns to in certain situations. It describes what tends to happen. It is not an identity.",
        "“Protection” is one possible lens, not a verdict. A response may have tried to reduce pain, preserve connection, create predictability, conserve energy, or simply help someone get through. Not every pattern began in trauma, and some protection may be responding to danger, unfairness, illness, pressure or responsibility that is still real today.",
        "Understanding does not make every effect acceptable, and it does not remove responsibility. It simply makes curiosity possible without contempt. No memory of when a response began is required for today.",
      ],
      info: [
        {
          term: "What does “pattern” mean here?",
          explanation:
            "A response you notice yourself returning to in certain situations — something you do or experience more than once. It is a description, not a diagnosis, and not a statement about who you are.",
        },
        {
          term: "What is overfunctioning?",
          explanation:
            "Taking on more than your share — anticipating, organising, carrying or fixing. It is described here only by what it looks like. It can have many different reasons, and no single hidden cause is being assigned to it.",
        },
        {
          term: "What if protection does not fit?",
          explanation:
            "Then you may leave that lens aside. Some responses may be habit, preference, circumstance, or something you cannot name. No explanation needs to be manufactured today.",
        },
      ],
    },
    questions: [
      {
        id: "response",
        eyebrow: "Notice",
        prompt: "When life feels difficult, which response feels most familiar today?",
        hint: "Choose one to explore. A pattern is something you may return to; it is not who you are.",
        select: "one",
        options: [
          { id: "withdraw", label: "Go quiet or keep to myself" },
          { id: "numb", label: "Distract myself, scroll, or switch off" },
          { id: "overfunction", label: "Take on more and hold everything together" },
          { id: "control", label: "Plan tightly or try to leave nothing to chance" },
          { id: "please", label: "Keep others comfortable, even at my own expense" },
          { id: "perfect", label: "Try to get everything exactly right" },
          { id: "anger", label: "Push back hard or become angry quickly" },
          { id: "busy", label: "Stay busy so there is no room to stop" },
          { id: "alone", label: "Handle it alone rather than ask" },
          { id: "unsure", label: "I am not sure which response fits" },
          { id: "private", label: "I would rather keep this private today" },
        ],
        echo: {
          heading: "What you chose to explore",
          byOption: {
            withdraw:
              "You chose going quiet or keeping to yourself as the response to explore. That describes what can happen; it does not tell us why.",
            numb:
              "You chose distracting yourself, scrolling or switching off as the response to explore. That describes what can happen; it does not tell us why.",
            overfunction:
              "You chose taking on more and holding everything together as the response to explore. That describes what can happen; it does not tell us why.",
            control:
              "You chose planning tightly or trying to leave nothing to chance as the response to explore. That describes what can happen; it does not tell us why.",
            please:
              "You chose keeping others comfortable as the response to explore. That describes what can happen; it does not tell us why.",
            perfect:
              "You chose trying to get everything exactly right as the response to explore. That describes what can happen; it does not tell us why.",
            anger:
              "You chose pushing back hard or becoming angry quickly as the response to explore. That describes what can happen; it does not tell us why.",
            busy:
              "You chose staying busy as the response to explore. That describes what can happen; it does not tell us why.",
            alone:
              "You chose handling it alone rather than asking as the response to explore. That describes what can happen; it does not tell us why.",
            unsure:
              "You said you are not sure which response fits. That is a real answer, and the rest of today works without one.",
            private:
              "You chose not to name a response here. No response will be assumed from that choice, and the day continues.",
          },
          unanswered:
            "You continued without choosing a response, and none will be assumed. The rest of today can be read generally.",
          closing:
            "A response is something you do or experience. It is not a definition of who you are.",
        },
      },
      {
        id: "doorway",
        eyebrow: "Notice",
        prompt: "When is this response most likely to show up?",
        hint: "Choose any that fit. These are possible contexts, not explanations of the cause.",
        select: "many",
        options: [
          { id: "criticism", label: "After criticism, a mistake, or feeling judged" },
          { id: "conflict", label: "During conflict or tension" },
          { id: "needed", label: "When other people need something from me" },
          { id: "uncertainty", label: "When life feels uncertain or outside my control" },
          { id: "closeness", label: "Around closeness, vulnerability, or depending on someone" },
          { id: "overload", label: "When I am overloaded, exhausted, ill, or in pain" },
          { id: "loss", label: "Around loss or difficult reminders" },
          {
            id: "unfairness",
            label: "When I feel excluded, treated unfairly, discriminated against, or unsafe",
          },
          {
            id: "unclear",
            label: "There is no clear pattern; it can build gradually",
            exclusive: true,
          },
          { id: "private", label: "I would rather not answer this here", exclusive: true },
        ],
      },
      {
        id: "purpose",
        eyebrow: "Wonder",
        prompt:
          "If this response has had a protective purpose, what might it have tried to prevent, preserve, or provide?",
        hint: "Choose possibilities that fit, if any. This is wondering — not diagnosing yourself.",
        select: "many",
        options: [
          { id: "conflict", label: "Make conflict or another person's reaction less likely" },
          { id: "criticism", label: "Reduce criticism, shame, or feeling like a failure" },
          { id: "predictability", label: "Create predictability or a sense of control" },
          { id: "connection", label: "Preserve connection, approval, or belonging" },
          { id: "distance", label: "Create space or keep needs and vulnerability private" },
          { id: "overwhelm", label: "Keep feelings, grief, or pressure more manageable" },
          { id: "energy", label: "Conserve energy or help me get through responsibilities" },
          {
            id: "disappointment",
            label: "Reduce the risk of relying, hoping, or being disappointed",
          },
          {
            id: "stillreal",
            label: "Respond to something unsafe, unfair, or demanding that is still real",
          },
          { id: "other", label: "Something else not listed here" },
          {
            id: "notfit",
            label: "Protection does not feel like the right word for me",
            exclusive: true,
          },
          { id: "unsure", label: "I am not sure yet", exclusive: true },
          { id: "private", label: "I would rather keep this private today", exclusive: true },
        ],
      },
    ],
    practise: {
      heading: "Two ways to practise today",
      intro:
        "Both slow the rush to self-judgment and make room for careful understanding.",
      either:
        "You may open either one, both, or neither. Neither path is ranked as better, and nothing has to be resolved today.",
      reflection: {
        title: "Reflection Practice — Then / Now, with room for what is still true",
        summary:
          "A respectful comparison that does not assume the response belongs only to the past.",
        steps: [
          "Orient outward first: notice two neutral details around the room. No body attention is required.",
          "Bring one response to mind and complete this privately: “When ______ happens, I sometimes ______.”",
          "If a past context comes naturally, try: “Then, this may have helped me by ______.” If no past comes to mind, use: “In difficult moments, this may be trying to help me by ______.”",
          "Ask: “Now, what is different, what remains true, or what is not yet clear?” Nothing assumes your circumstances are safer now or that the protection is obsolete.",
          "Say: “Understanding this does not mean every effect is acceptable, and it does not mean I must change before I am ready.”",
          "Reorient to the room, and leave the question unfinished if that is where it rests today.",
        ],
        notRequired:
          "There is no need to remember when this began, to identify trauma, to use parts language, to attend inwardly, or to decide whether to change it.",
      },
      spiritual: {
        title: "Scripture & Spiritual Reflection — loved before readiness",
        summary:
          "A Christian pathway in which love precedes performance, certainty, or release.",
        steps: [
          "Orient to the room, then read the short phrase slowly, twice.",
          "Notice the order: Jesus' love is present before the young man's decision, and before he could release anything.",
          "This story is not being used to equate your coping with the man's possessions, to label your response as sin, or to demand surrender.",
          "If you wish, name one response and wonder, under mercy, what it may have tried to prevent, preserve, or provide.",
          "If you would like a prayer: “Jesus, look on me with love. Help me understand without contempt. Show me what care, truth, boundary, or support is wise today.”",
          "Sit in silence, or reorient outward. No feeling or answer is required.",
        ],
        notRequired:
          "No confession, surrender, certainty, forgiveness, reconciliation or change is required. You may read without praying, or leave this path entirely.",
        scripture: {
          reference: "Mark 10:21 (World English Bible)",
          body: "Jesus looking at him loved him.",
          note: "The emphasis falls on love being present before readiness. No claim is made that God caused this pattern or is ordering its release.",
        },
      },
    },
    step: {
      id: "step",
      eyebrow: "One Honest Step",
      prompt: "What is one small way to meet this response with curiosity rather than contempt?",
      hint: "Specific, small, safe. You are not being asked to change the response today.",
      select: "one",
      options: [
        {
          id: "notice",
          label:
            "Notice it once and say, “There it is. I wonder what it is trying to protect or provide.”",
        },
        {
          id: "sentence",
          label: "Write one private sentence: “When ______ happens, I tend to ______.”",
        },
        {
          id: "reminder",
          label: "Keep one word somewhere private to remind me to notice without judging",
        },
        {
          id: "prepare-share",
          label: "Prepare one sentence I could share with a safe person or professional",
          note: "No need to send or say it today.",
        },
        { id: "settle", label: "No outward action — let today's understanding settle" },
      ],
    },
    reflection: {
      intro: "This uses only what you chose today. Keep what fits and leave what does not.",
      sections: [
        {
          id: "hearing",
          title: "What you noticed",
          from: "response",
          lines: {
            withdraw: "You chose going quiet or keeping to yourself as the response to look at today.",
            numb: "You chose distracting yourself, scrolling or switching off as the response to look at today.",
            overfunction:
              "You chose taking on more and holding everything together as the response to look at today.",
            control:
              "You chose planning tightly or trying to leave nothing to chance as the response to look at today.",
            please: "You chose keeping others comfortable as the response to look at today.",
            perfect: "You chose trying to get everything exactly right as the response to look at today.",
            anger:
              "You chose pushing back hard or becoming angry quickly as the response to look at today.",
            busy: "You chose staying busy as the response to look at today.",
            alone: "You chose handling it alone rather than asking as the response to look at today.",
            unsure: "You said you were not sure which response fits, which is an honest place to be.",
            private:
              "You chose not to name a response here. No response will be inferred from that choice.",
          },
          unanswered:
            "No response was chosen, and none will be attributed to you. Today can still be read generally.",
        },
        {
          id: "underneath",
          title: "When it tends to appear",
          from: "doorway",
          lines: {
            criticism:
              "You noted criticism, mistakes or feeling judged as a context where this can appear. A context is not a cause.",
            conflict: "You noted conflict or tension as a context where this can appear.",
            needed:
              "You noted times when other people need something from you. A context is not a cause.",
            uncertainty: "You noted uncertainty, or life feeling outside your control.",
            closeness: "You noted closeness, vulnerability or depending on someone.",
            overload:
              "You noted being overloaded, exhausted, ill or in pain — real conditions, not explanations.",
            loss: "You noted loss or difficult reminders as a context where this can appear.",
            unfairness:
              "You noted exclusion, unfair treatment, discrimination or feeling unsafe. Those are circumstances, not something you invented.",
            unclear: "You said there is no clear pattern and it can build gradually. That is a real answer.",
            private: "You chose not to answer this here, which is entirely reasonable.",
          },
          unanswered:
            "No contexts were selected, and none will be guessed. Where a response appears can stay unclear for now.",
        },
        {
          id: "protected",
          title: "What it may have been trying to protect or provide",
          from: "purpose",
          lines: {
            conflict:
              "You wondered whether it may have made conflict or another person's reaction less likely.",
            criticism:
              "You wondered whether it may have reduced criticism, shame, or feeling like a failure.",
            predictability:
              "One possibility you selected is that it may have created predictability or a sense of control.",
            connection:
              "You wondered whether it may have preserved connection, approval, or belonging.",
            distance:
              "One possibility you selected is that it may have created space, or kept needs and vulnerability private.",
            overwhelm:
              "You wondered whether it may have kept feelings, grief, or pressure more manageable.",
            energy:
              "One possibility you selected is that it may have conserved energy, or helped you get through responsibilities.",
            disappointment:
              "You wondered whether it may have reduced the risk of relying, hoping, or being disappointed.",
            stillreal:
              "You noted that it may be responding to something unsafe, unfair, or demanding that is still real. If so, it may still be needed.",
            other: "You noted something else, not listed here. Your own words are closer than any list.",
            notfit:
              "You said protection does not feel like the right word, and that lens can be set aside.",
            unsure: "You said you are not sure yet. Wondering can stay open.",
            private: "You kept this private today, which is a complete answer.",
          },
          unanswered:
            "Nothing was selected here, and there is no need to manufacture an answer. Protection may simply not be the right lens for this response.",
        },
        {
          id: "care",
          title: "What understanding does — and does not — mean",
          opening:
            "Compassion does not excuse harm, and understanding a response does not settle what to do about it. Some protection may still be necessary where a risk, injustice, limitation, illness or responsibility is ongoing. No origin and no decision to change are required today.",
          unanswered:
            "However much or little was chosen today, understanding without contempt is still available to you.",
        },
        {
          id: "next",
          title: "One honest next step",
          from: "step",
          lines: {
            notice: "You chose to notice it once and wonder what it may be trying to protect or provide.",
            sentence: "You chose to write one private sentence about when this response tends to appear.",
            reminder: "You chose to keep one private word as a reminder to notice without judging.",
            "prepare-share":
              "You chose to prepare one sentence for a safe person or professional. Nothing needs to be sent or said today.",
            settle: "You chose no outward action, and let today's understanding settle.",
          },
          unanswered:
            "No step was chosen. Understanding, by itself, is a legitimate outcome for a day like this.",
        },
      ],
      closing:
        "Only you know the fuller context. A response can make sense without becoming your identity. You are not only this pattern.",
    },
    close: {
      heading: "Understanding before change",
      body: [
        "You looked at one possible pattern without reducing yourself to it. You did not have to prove where it came from or give it up.",
        "Some protection may belong to the past, and some may be responding to what is still real.",
        "When you continue, Day 5 makes room for both the pull toward movement and the pull toward safety.",
      ],
      carryForward: "A pattern may be part of my story; it is not the whole of who I am.",
    },
  },


  {
    day: 5,
    title: "The Two Pulls Within You",
    theme:
      "A pull toward movement and a pull toward caution can be present together, without a decision being required.",
    motif: "two-pulls",
    shape: "standard",
    descriptor: "Making room for mixed feelings · about 10 minutes",
    arrive: {
      lead: "Wanting something to change and feeling cautious about it can both be true.",
      body: [
        "One pull may want honesty, rest, help, grief, a limit, reconnection, or some other movement.",
        "Another pull may carry concern about safety, energy, consequences, responsibilities, uncertainty, belonging, timing, or something not yet clear.",
        "Today is for listening, not deciding. You do not have to find two pulls if that is not your experience.",
      ],
      settle: [
        "Settle into any position that works for you today — sitting, standing, lying down, or moving.",
        "Orient outward first: notice one or two neutral details around you, using any sense that is comfortable.",
        "Only if attention to your body or breath feels comfortable, notice the support beneath you or one ordinary breath. Otherwise stay with your surroundings.",
      ],
    },
    understand: {
      label: "Listen",
      heading: "Two truths can ask for room at the same time",
      body: [
        "Mixed feelings about the same area of life are common. A wish for something to move and a concern about moving can sit side by side.",
        "The pull toward movement may point toward what matters to you or what you long for. The cautious pull may point toward risk, capacity, responsibility, timing, uncertainty, or a need for more information or support. Either may be faint, or absent today.",
        "Listening to both can make the conflict more visible. It does not require obeying either, deciding today, or treating them as equally right — and it does not excuse harmful effects.",
      ],
      info: [
        {
          term: "What is ambivalence?",
          explanation:
            "Mixed or competing wishes, concerns, needs or loyalties about the same area of life. It is not proof of weakness, laziness, insincerity or lack of commitment, and it is not a diagnosis.",
        },
        {
          term: "What does “a part of me” mean here?",
          explanation:
            "Ordinary shorthand for one feeling, motive, wish, concern or side of an inner conflict. It does not mean separate personalities, and it is not a clinical label.",
        },
      ],
    },
    questions: [
      {
        id: "forward",
        eyebrow: "Listen",
        prompt: "If one pull wants something to move, what is it reaching toward?",
        hint: "Choose the one closest to today. Wanting something does not commit you to doing it.",
        select: "one",
        options: [
          { id: "honest", label: "More honesty about something I have kept quiet" },
          { id: "rest", label: "Genuine rest" },
          { id: "limit", label: "A needed limit or boundary" },
          {
            id: "repair",
            label: "Understanding or addressing something unresolved in a relationship",
            note: "No contact, reconciliation or forgiveness is required.",
          },
          { id: "help", label: "Asking for or receiving support" },
          { id: "grieve", label: "Making some room for grief, at my own pace" },
          { id: "live", label: "Reconnecting with a life that feels more like my own" },
          { id: "unclear", label: "Some movement I can sense without a clear name" },
          { id: "none", label: "I do not notice a clear pull toward movement today" },
          { id: "private", label: "I would rather keep this private today" },
        ],
        echo: {
          heading: "What may be drawing you forward",
          byOption: {
            honest:
              "You named a wish for more honesty about something kept quiet. Nothing here decides whether, when, how, or with whom that would be safe or wise.",
            rest: "You named a wish for genuine rest. Nothing is assumed here about why rest has been difficult.",
            limit:
              "You named a wish for a needed limit or boundary. What that limit would be, and with whom, stays with you.",
            repair:
              "You named a wish for understanding or addressing something unresolved in a relationship. This does not imply contact, reconciliation or forgiveness, and it does not say anything about whether the relationship still matters.",
            help: "You named a wish to ask for or receive support. No past experience of asking is assumed from that.",
            grieve:
              "You named a wish to make some room for grief at your own pace. Nothing is predicted here about what grief will feel like or do.",
            live: "You named a wish to reconnect with a life that feels more like your own.",
            unclear:
              "You sensed some movement without a clear name. An unnamed sense is still something you noticed, and it does not have to be specified today.",
            none: "You noted that you do not notice a clear pull toward movement today. That is a legitimate answer, and no pull will be assumed.",
            private:
              "You chose to keep this private today. No pull will be inferred from that choice, and the day continues.",
          },
          unanswered:
            "No pull toward movement was named here, and none will be assumed. Today still works without it.",
          closing:
            "Wanting something is information, not an instruction. The next prompt invites a possible concern or hesitation, but does not assume one exists.",
        },
      },
      {
        id: "holdback",
        eyebrow: "Listen",
        prompt: "If another pull makes movement feel risky or difficult, what concern might it carry?",
        hint: "Choose the one closest to today. The concern may relate to past experience, present reality, anticipated consequences, or no clear reason.",
        select: "one",
        options: [
          { id: "hurt", label: "Risk of hurt, rejection, criticism or disappointment" },
          {
            id: "others",
            label: "Possible effects on people or responsibilities that genuinely depend on me",
          },
          { id: "stability", label: "Possible loss of safety, privacy, stability or predictability" },
          { id: "energy", label: "Limits in energy, health or capacity" },
          { id: "hope", label: "The risk of hoping and being disappointed" },
          {
            id: "identity",
            label: "A role, relationship, belonging, culture, faith or sense of identity that may feel at stake",
          },
          { id: "unknown", label: "I am not sure what the concern is yet" },
          { id: "ongoing", label: "Something difficult, unfair, demanding or unsafe is still real" },
          { id: "none", label: "I do not notice a clear second pull today" },
          { id: "private", label: "I would rather keep this private today" },
        ],
        info: [
          {
            term: "What if the concern is about something still real?",
            explanation:
              "Caution may be wise where safety, unfairness, illness, disability, limited resources or capacity, dependence, responsibility, or another present reality is involved. Nothing here asks you to override it.",
          },
        ],
      },
    ],
    practise: {
      heading: "Two ways to practise today",
      intro:
        "Both are private, both are complete on their own, and neither asks you to decide anything.",
      either: "Either, both, or neither — in whatever order suits you.",
      reflection: {
        title: "Reflection Practice — let both pulls speak",
        summary:
          "A private sentence-stem practice for hearing a longing and a concern without forcing a decision.",
        steps: [
          "Begin outwardly: notice one or two neutral details around you, in any position that is workable today.",
          "Privately complete: “One side of me hopes for…” or “One side of me wants…”. It may remain unfinished.",
          "Privately complete: “Another concern says…” or “Another side of me wants me to take seriously…”. “I don't know” is a valid ending.",
          "Reflect back plainly, without forced gratitude or agreement: “I hear the hope for ____. I hear the concern about ____.” If only one side is present, name only that one.",
          "Ask: “Before any decision, what might help me listen well — time, information, support, rest, safety, a boundary, or something else?”",
          "Finish with: “I do not have to settle this today,” then reorient to your surroundings. If the exercise becomes too uncomfortable, stop and return to neutral surroundings.",
        ],
        notRequired:
          "You do not need to write or save anything from this practice. No origin story, no two distinct parts, no decision, no resolution and no action are required.",
      },
      spiritual: {
        title: "Scripture & Spiritual Reflection — two truths in one honest prayer",
        summary:
          "One biblical example of mixed honesty spoken to God — offered as an example, not as a judgement on your caution.",
        steps: [
          "Orient outward for a moment, then read the sentence slowly if you wish.",
          "Notice that a father seeking help speaks belief and uncertainty together, and Scripture keeps both in one honest sentence.",
          "Your caution is not being equated with unbelief. Faith does not require overriding safety, wisdom, limits, responsibilities or current reality.",
          "If you wish, name the tension before God: “Part of me longs for ____. Another part of me is concerned about ____.” Either line may be left blank.",
          "If you wish, pray briefly for truth, mercy, wisdom, safety, support and an honest pace. No answer or outcome is promised here.",
          "Sit in silence or reorient outward. No feeling, certainty, answer or action is required.",
        ],
        notRequired:
          "You may read without praying, or leave this path entirely. No certainty, surrender, forgiveness, reconciliation, contact, decision or change is required.",
        scripture: {
          reference: "Mark 9:24 (World English Bible)",
          body: "I believe. Help my unbelief!",
          note: "The verse makes room for mixed honesty. It does not define caution as spiritual failure, and it does not promise that the tension will be resolved.",
        },
      },
    },
    step: {
      id: "step",
      eyebrow: "One Honest Step",
      prompt: "What may help you honour what you heard without forcing a decision?",
      hint: "Choose one small, safe, reversible response. Listening may be the step.",
      select: "one",
      options: [
        {
          id: "thank",
          label:
            "Offer one respectful sentence to each pull: “I hear the hope…” and “I hear the concern…”",
        },
        {
          id: "tiny",
          label:
            "Identify one thing I may need before deciding: information, support, rest, safety, time or a boundary",
        },
        { id: "wait", label: "Choose a later time to revisit this, without deciding today" },
        {
          id: "talk",
          label: "Prepare one sentence for a safe, unhurried person or professional",
          note: "No need to share it today, and do not involve anyone who feels unsafe.",
        },
        {
          id: "prepare",
          label: "No outward action — making room for more than one possibility was the step",
        },
      ],
    },
    reflection: {
      intro:
        "This stays within what you chose — or did not choose — today. Keep what fits and leave what does not.",
      sections: [
        {
          id: "hearing",
          title: "What may be drawing you forward",
          from: "forward",
          lines: {
            honest: "You named a wish for more honesty about something kept quiet.",
            rest: "You named a wish for genuine rest.",
            limit: "You named a wish for a needed limit or boundary.",
            repair:
              "You named a wish for understanding or addressing something unresolved in a relationship. Nothing about contact, reconciliation or forgiveness follows from that.",
            help: "You named a wish to ask for or receive support.",
            grieve: "You named a wish to make some room for grief, at your own pace.",
            live: "You named a wish to reconnect with a life that feels more like your own.",
            unclear: "You sensed some movement without a clear name, and that still counts as something noticed.",
            none: "You noted that no clear pull toward movement is present today.",
            private: "You chose to keep this private today, and no pull will be inferred from that.",
          },
          unanswered:
            "No pull toward movement was named today, and none will be attributed to you here.",
        },
        {
          id: "protected",
          title: "What may be asking for caution",
          from: "holdback",
          lines: {
            hurt: "You pointed to a concern about hurt, rejection, criticism or disappointment.",
            others:
              "You pointed to possible effects on people or responsibilities that genuinely depend on you.",
            stability:
              "You pointed to a possible loss of safety, privacy, stability or predictability.",
            energy: "You pointed to limits in energy, health or capacity — a practical concern, not an excuse.",
            hope: "You pointed to the risk of hoping and being disappointed.",
            identity:
              "You pointed to a role, relationship, belonging, culture, faith or sense of identity that may feel at stake.",
            unknown: "You noted that the concern is not clear yet, which is a fair place to stop.",
            ongoing:
              "You noted that something difficult, unfair, demanding or unsafe is still real. Nothing here asks you to override it, and caution may be carrying important current information.",
            none: "You noted that no clear second pull is present today.",
            private: "You chose to keep this private today, and no concern will be inferred from that.",
          },
          unanswered:
            "No concern was described here. No motive, history or purpose will be assigned to a pull you did not name.",
        },
        {
          id: "care",
          title: "What both may need from you",
          opening:
            "Longing and caution can both carry information. Longing may point toward what matters; caution may point toward risk, capacity, responsibility, timing or uncertainty. Sometimes only one is clear. Neither has to decide alone today.",
          unanswered:
            "Longing and caution can both carry information, and sometimes only one is clear. Neither has to decide alone today.",
        },
        {
          id: "next",
          title: "One honest listening step",
          from: "step",
          lines: {
            thank: "You chose to offer one respectful sentence to each pull you noticed.",
            wait: "You chose to revisit this at a later time, without deciding today.",
            tiny: "You chose to identify one thing you may need before deciding.",
            talk: "You chose to prepare one sentence for a safe, unhurried person or professional.",
            prepare:
              "You chose no outward action. Making room for more than one possibility was the step.",
          },
          unanswered:
            "No step was chosen, and no action is required. Reaching this point may simply leave the question open.",
        },
      ],
      closing:
        "This app cannot know the whole context or decide what is wise. Ambivalence may contain information; it is not a verdict, and it does not require action today.",
    },
    close: {
      heading: "Room for more than one truth",
      body: [
        "Today made room for the possibility that movement and caution may both have something to say.",
        "You did not have to find two pulls, explain where they came from, treat them as opponents, or decide anything. Where listening happened, listening is not obeying either side automatically.",
        "When you continue, Day 6 turns gently toward present-day cost, without blame or pressure to change.",
      ],
      carryForward: "More than one truth can be present, and I can choose my pace.",
    },
  },
];
