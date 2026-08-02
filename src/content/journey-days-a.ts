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
          term: "What does “unresolved hurt” mean?",
          explanation:
            "Here it means a hurt that still feels unfinished or continues to matter. You do not need to decide why it remains present, tell the whole story or work through it here.",
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
          { id: "hurt", label: "Unresolved hurt — something painful still feels unfinished" },
          { id: "regret", label: "Regret — something I wish had been different" },
          { id: "pressure", label: "Pressure — too much is being asked of me" },
          { id: "unsure", label: "I know something is there, but I do not have a word yet" },
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
              "You chose unresolved hurt as one word for today. You do not need to tell the whole story or decide what to do with it here.",
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
        prompt: "Where, if anywhere, do you notice this alongside ordinary life?",
        hint: "Choose any that fit. These experiences may or may not share a cause; you do not have to work that out here.",
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
          "Complete one sentence silently or somewhere outside this app: “I am carrying…”, “I am afraid that…”, “I regret…” or “I feel unseen when…”.",
          "Stop after one sentence. You do not have to add details or make the sentence explain everything.",
          "If body attention feels comfortable, notice whether anything shifts, tightens or stays the same. If not, look around and notice three neutral details in the room.",
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
          "Anger toward God, silence, doubt or an unfinished sentence may all be present. You may read without praying or leave this path entirely.",
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
        { id: "hold", label: "Keep the word and return to it when I have a little space" },
        { id: "write", label: "Write one honest sentence somewhere outside this app" },
        {
          id: "tell",
          label: "Tell one trusted person one sentence about it",
          note: "Only if the person and relationship feel safe.",
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
              "You chose unresolved hurt. You do not need to tell the whole story or decide what to do with it today.",
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
          title: "Where it may be landing",
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
            hold: "Letting the word rest and returning later respects your pacing.",
            write:
              "Writing one honest sentence may help you see it more clearly. Choose a place that feels suitably private.",
            tell: "One sentence to a trusted person may open support, but you decide how much to say and safety matters.",
            kind: "Saying it is real but not all of you separates experience from identity without denying either.",
            prepare:
              "Finding a word — or choosing not to — was the step. Nothing more is required today.",
          },
          unanswered:
            "No step was chosen, and none is required. Naming, staying near the question or deciding not today may be enough.",
        },
      ],
      closing:
        "Only you know the fuller context. Keep what fits and leave what does not. You are not what you carry.",
    },
    close: {
      heading: "A word, not a verdict",
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
    theme: "Looking at old responses with respect rather than blame.",
    motif: "shelter",
    shape: "practise-mid",
    descriptor: "Understanding your responses · about 12 minutes",
    arrive: {
      lead: "The ways you have coped were not random. They usually made sense at the time.",
      body: [
        "Today looks at habits and responses that may have started as protection — and does so without calling them faults.",
        "Nothing here asks you to give anything up. Understanding comes first, and sometimes understanding is all a day needs to hold.",
      ],
      settle: [
        "Sit back rather than forward, if you can.",
        "Press your feet gently into the floor for three seconds, then release.",
        "Let your gaze soften on something neutral for a moment before reading on.",
      ],
    },
    understand: {
      heading: "Protection is intelligent before it is costly",
      body: [
        "When something is repeatedly unsafe, painful or unpredictable, people adapt. Someone who was criticised may become excellent at getting things right. Someone who was let down may become fiercely self-reliant. Someone who lived with tension may become an expert at keeping everyone calm.",
        "These are not defects. They are skilled responses, learned by a person doing their best with what was available.",
        "The tentative question for today is not “what is wrong with me?” but “what was this response trying to protect me from?” — asked with curiosity rather than a verdict.",
      ],
      info: [
        {
          term: "What is overfunctioning?",
          explanation:
            "Taking on more than your share — anticipating, organising, carrying, fixing — often to keep things stable or to keep others comfortable. It usually looks like competence from the outside and feels like exhaustion from the inside.",
        },
        {
          term: "Does this mean my coping was wrong?",
          explanation:
            "No. This is not about judging how you survived. It is about noticing, gently, whether a response that once helped is still the best fit for your life now. Sometimes the honest answer is that it still is.",
        },
      ],
    },
    questions: [
      {
        id: "response",
        eyebrow: "Notice",
        prompt: "When things become difficult, what do you tend to do?",
        hint: "Choose any that feel familiar. There is no judgement attached to any of them.",
        select: "many",
        options: [
          { id: "withdraw", label: "Withdraw — go quiet, keep to myself" },
          { id: "numb", label: "Numb out — distract, scroll, switch off" },
          { id: "overfunction", label: "Overfunction — take on more, hold it together" },
          { id: "control", label: "Control — plan, tighten, leave nothing to chance" },
          { id: "please", label: "Please — keep others comfortable first" },
          { id: "perfect", label: "Perfect — get it exactly right so nothing can be said" },
          { id: "anger", label: "Push back hard — anger arrives before anything else" },
          { id: "busy", label: "Stay busy — keep moving so nothing catches up" },
          { id: "alone", label: "Handle it alone — asking feels worse than coping" },
        ],
        echo: {
          heading: "What that may once have done for you",
          byOption: {
            withdraw: "Withdrawing may have reduced exposure when being seen was not safe.",
            numb: "Numbing may have made an unbearable amount bearable, one evening at a time.",
            overfunction: "Overfunctioning may have kept a fragile situation stable when nobody else would.",
            control: "Control may have been the only available answer to unpredictability.",
            pleasing: "Keeping others comfortable may have prevented something worse.",
            please: "Keeping others comfortable may have prevented conflict that was not survivable then.",
            perfect: "Getting it exactly right may have removed the opening for criticism.",
            anger: "Anger may have created distance quickly when distance was needed.",
            busy: "Staying busy may have kept grief or fear at a workable distance.",
            alone: "Handling it alone may have been safer than depending on someone who did not follow through.",
          },
          unanswered:
            "You continued without selecting a response, and nothing will be assumed about how you cope. The teaching still stands: what looks like a flaw is often an old solution.",
          closing:
            "This is a possibility, not a conclusion about your history. You know your own story better than any set of options does.",
        },
      },
      {
        id: "then",
        eyebrow: "Consider",
        prompt: "What was going on back when this response first made sense?",
        hint: "Choose gently, or continue without answering. No detail is needed, and nothing is stored as words.",
        select: "many",
        options: [
          { id: "unsafe", label: "Things were unpredictable or unsafe" },
          { id: "criticised", label: "I was criticised or blamed often" },
          { id: "unsupported", label: "There was no one to rely on" },
          { id: "responsible", label: "I was responsible for others too early" },
          { id: "loss", label: "There was loss, illness or upheaval" },
          { id: "conflict", label: "Conflict was frightening or constant" },
          { id: "unclear", label: "Nothing specific — it just built up" },
          { id: "private", label: "I would rather not go into it" },
        ],
      },
    ],
    practise: {
      heading: "Two ways to practise today",
      intro: "Both hold the same shape: then, and now.",
      either: "Either or both. Neither requires you to change anything yet.",
      reflection: {
        title: "Reflection Practice — Then / Now",
        summary:
          "A short, respectful comparison that separates an old solution from a present-day situation.",
        steps: [
          "Bring to mind one response you noticed today — the one that felt most familiar.",
          "Say silently: “Back then, this helped me by ______.” Let the ending be whatever arrives, even if it is imprecise.",
          "Then say: “What is different now is ______.” It may be small: a different home, more choice, one safer person, an adult body.",
          "Notice any resistance to the second sentence. Resistance is not disagreement; sometimes it means the response is still needed.",
          "Finish with: “I don't have to decide today whether to change this.”",
        ],
        notRequired:
          "You are not required to reach a conclusion, drop a protection, or feel differently about your past.",
      },
      spiritual: {
        title: "Scripture & Spiritual Reflection — held without accusation",
        summary:
          "A Christian pathway about being known with compassion rather than judgement.",
        steps: [
          "Read the passage slowly, twice.",
          "Notice the reason given for compassion: not that we are strong, but that we are fragile and this is understood.",
          "If you wish, hold one of your own responses in mind and say: “This is how I survived. Please meet me here.”",
          "Sit quietly for a few breaths. Nothing needs to be surrendered, confessed or resolved for this to count.",
        ],
        notRequired:
          "This is not about being told your coping was sinful, nor about handing anything over before you are ready. You may also read the passage and leave it there.",
        scripture: {
          reference: "Psalm 103:13–14 (World English Bible)",
          body: "Like a father has compassion on his children, so Yahweh has compassion on those who fear him. For he knows how we are made. He remembers that we are dust.",
          note: "The emphasis falls on being understood as fragile — not on being caused to suffer, tested, or required to explain yourself.",
        },
      },
    },
    step: {
      id: "step",
      eyebrow: "One Honest Step",
      prompt: "What feels possible to do with this today?",
      hint: "One choice. Nothing here requires changing a pattern.",
      select: "one",
      options: [
        { id: "thank", label: "Thank the response, silently, for what it did" },
        { id: "watch", label: "Simply watch for it once this week, without acting" },
        { id: "loosen", label: "Loosen it five percent in one safe moment" },
        { id: "talk", label: "Mention it to a safe person or a professional" },
        { id: "prepare", label: "Nothing outward — understanding it was the step" },
      ],
    },
    reflection: {
      intro: "Built from what you chose today, and held loosely.",
      sections: [
        {
          id: "hearing",
          title: "What I'm hearing",
          from: "response",
          opening: "You recognised some familiar responses:",
          lines: {
            withdraw: "Going quiet is familiar, which usually develops where being seen carried risk.",
            numb: "Switching off is familiar, which is often how people survive an amount they cannot process at the time.",
            overfunction: "Taking on more is familiar, and that competence may have been load-bearing for others.",
            control: "Tightening control is familiar, which frequently grows in unpredictable conditions.",
            please: "Keeping others comfortable is familiar, which often begins where conflict was unsafe.",
            perfect: "Getting it exactly right is familiar, which tends to develop under criticism.",
            anger: "Pushing back hard is familiar, and anger can be a fast, effective way to create space.",
            busy: "Staying busy is familiar, and movement can keep difficult things at a workable distance.",
            alone: "Handling it alone is familiar, which often follows being let down rather than preferring solitude.",
          },
          unanswered:
            "You did not name a response, and none will be attributed to you. What today offered still applies: coping strategies usually began as solutions.",
        },
        {
          id: "protected",
          title: "What this may have been trying to protect",
          from: "then",
          opening: "Considering what was happening then:",
          lines: {
            unsafe: "In unpredictable conditions, a reliable response is worth a great deal — even a costly one.",
            criticised: "Where criticism was frequent, becoming difficult to criticise is an intelligent adaptation.",
            unsupported: "Where no one was reliable, self-reliance was not a preference; it was the only option.",
            responsible: "Carrying responsibility too early tends to leave a person very good at carrying and poor at putting down.",
            loss: "After loss or upheaval, keeping things controlled or distant can be how a person stays upright.",
            conflict: "Where conflict was frightening, keeping the peace may have been genuine protection for everyone.",
            unclear: "It may have built up gradually, without a single identifiable cause. That is common.",
            private: "You kept the detail to yourself, which is entirely reasonable and changes nothing about the work.",
          },
          unanswered:
            "Nothing was said about the past, and nothing will be inferred. What can be said generally is that protective responses are usually answers to something real.",
        },
        {
          id: "care",
          title: "What may deserve care now",
          opening:
            "It is possible to be grateful to a response and honest about its cost at the same time. Both can be true, and neither cancels the other.",
          unanswered:
            "However you coped, the person who did the coping deserves respect rather than a reprimand.",
        },
        {
          id: "next",
          title: "One honest next step",
          from: "step",
          lines: {
            thank: "Thanking a response can reduce the internal argument about it.",
            watch: "Watching without acting keeps you in charge of the pace.",
            loosen: "Five percent, in a safe moment, is a real change and a modest risk.",
            talk: "Talking it through with a safe person or professional is often where this work moves fastest.",
            prepare: "Understanding it was the step. Nothing more is due today.",
          },
          unanswered:
            "No step was chosen. Understanding, by itself, is a legitimate outcome for a day like this.",
        },
      ],
      closing:
        "Nothing here is a psychological assessment, and no conclusion has been drawn about your history.",
    },
    close: {
      heading: "Held with respect",
      body: [
        "You looked at how you have coped without turning it into a case against yourself. That is unusual, and it matters.",
        "Tomorrow looks at the pull in two directions that often follows this kind of honesty.",
      ],
      carryForward:
        "Carry forward one sentence: this made sense, and I am allowed to look at it kindly.",
    },
  },

  {
    day: 5,
    title: "The Two Pulls Within You",
    theme: "Wanting change and wanting safety, at the same time.",
    motif: "two-pulls",
    shape: "standard",
    descriptor: "Working with ambivalence · about 10 minutes",
    arrive: {
      lead: "Being pulled two ways is not weakness or hypocrisy.",
      body: [
        "Almost everyone who wants something to change also has a part that would rather not risk it.",
        "Today makes room for both, without requiring you to pick a winner.",
      ],
      settle: [
        "Notice the weight of your hands wherever they are resting.",
        "Take one breath in through the nose and let it out slowly through the mouth.",
        "Let both feet be flat, as though you could stand up if you chose to.",
      ],
    },
    understand: {
      heading: "Two pulls, both trying to help",
      body: [
        "One part of a person may want movement: honesty, repair, rest, a different life. Another part may want safety, distance or control — often because it remembers what change cost last time.",
        "It is tempting to treat the second part as the enemy. That usually backfires: the more it is attacked, the harder it holds on.",
        "So today is not about defeating anything. It is about hearing both pulls clearly enough that they stop fighting in the dark.",
      ],
      info: [
        {
          term: "What is ambivalence?",
          explanation:
            "Holding two opposing wants at the same time — for example wanting to speak honestly and wanting to keep the peace. It is a normal human state, not indecision or a lack of commitment.",
        },
      ],
    },
    questions: [
      {
        id: "forward",
        eyebrow: "Listen",
        prompt: "The part of you that wants something to move — what does it want?",
        hint: "Choose any that fit. Wanting something does not commit you to doing it.",
        select: "many",
        options: [
          { id: "honest", label: "To be honest about something I have kept quiet" },
          { id: "rest", label: "To stop and actually rest" },
          { id: "limit", label: "To set a limit that is overdue" },
          { id: "repair", label: "To repair or clear something with someone" },
          { id: "help", label: "To ask for help properly" },
          { id: "grieve", label: "To let myself grieve something" },
          { id: "live", label: "To live in a way that feels like mine again" },
          { id: "unclear", label: "Something needs to move — I can't name what" },
        ],
        echo: {
          heading: "The other side of it",
          byOption: {
            honest: "The wish to be honest usually arrives with a fear of what honesty could cost. Both are reasonable.",
            rest: "Wanting rest often meets a fear that things will fall apart if you stop.",
            limit: "Wanting a limit often meets a fear of being seen as difficult, or of someone's reaction.",
            repair: "Wanting repair often meets a fear of being rejected again, or of it changing nothing.",
            help: "Wanting help often meets an old lesson that asking was not safe or not answered.",
            grieve: "Wanting to grieve often meets a fear that once it starts it will not stop.",
            live: "Wanting your life to feel like yours often meets the practical weight of other people's needs.",
            unclear: "An unnamed pull is still a real pull. It does not have to be specified to be listened to.",
          },
          unanswered:
            "You continued without naming a pull forward, and today still works. Ambivalence can be present without either side having found its words.",
          closing: "Neither pull is the enemy. Both are usually trying, in their own way, to look after you.",
        },
      },
      {
        id: "holdback",
        eyebrow: "Listen",
        prompt: "And the part that holds back — what is it protecting?",
        hint: "Choose any that fit. This part is not the villain of the story.",
        select: "many",
        options: [
          { id: "hurt", label: "Me, from being hurt again" },
          { id: "others", label: "Other people, from the fallout" },
          { id: "stability", label: "The stability I have managed to build" },
          { id: "energy", label: "The little energy I have left" },
          { id: "hope", label: "Me, from hoping and being disappointed" },
          { id: "identity", label: "Who I have had to be to get through" },
          { id: "unknown", label: "Something I can't name yet" },
        ],
      },
    ],
    practise: {
      heading: "Two ways to practise today",
      intro: "Both are private, and neither asks you to decide anything.",
      either: "Either or both, in either order.",
      reflection: {
        title: "Reflection Practice — the two-voice exercise",
        summary:
          "A structured way to let both pulls speak, so neither has to shout.",
        steps: [
          "Sit with both feet on the floor. You will speak for two parts of yourself, silently, one at a time.",
          "First, complete: “A part of me wants ______.” Let it finish however it finishes.",
          "Then, complete: “Another part of me is afraid that ______.”",
          "Now the important step: say to the second part, “Thank you. I understand why.” Do not argue with it.",
          "Finally, complete: “Something small that both parts could live with is ______.”",
          "If nothing arrives for that last line, leave it open. An unfinished sentence is an acceptable ending.",
        ],
        notRequired:
          "No decision is required today. Nothing must be resolved, and nothing is written down.",
      },
      spiritual: {
        title: "Scripture & Spiritual Reflection — honest divided faith",
        summary:
          "A Christian pathway for belief and doubt arriving together.",
        steps: [
          "Read the sentence. Notice that it contains both halves and is not corrected in the text.",
          "Notice that the man is not asked to sort himself out before being met.",
          "If you wish, say your own version — belief and doubt in the same breath, in your own words.",
          "Sit for a few breaths. You do not have to land on one side of it before you finish.",
        ],
        notRequired:
          "Certainty is not the entry requirement. Doubt is not a failure, and you may leave this path at any point.",
        scripture: {
          reference: "Mark 9:24 (World English Bible)",
          body: "I believe. Help my unbelief!",
          note: "One short sentence holding two opposite things — offered without apology and without being corrected.",
        },
      },
    },
    step: {
      id: "step",
      eyebrow: "One Honest Step",
      prompt: "What would honour both pulls today?",
      hint: "One choice, small enough that the cautious part can bear it.",
      select: "one",
      options: [
        { id: "thank", label: "Thank the cautious part without giving it the final vote" },
        { id: "tiny", label: "Take one step so small both parts can live with it" },
        { id: "wait", label: "Wait deliberately, rather than by default" },
        { id: "talk", label: "Talk it through with someone who will not rush me" },
        { id: "prepare", label: "Nothing outward — hearing both sides was the step" },
      ],
    },
    reflection: {
      intro: "From what you chose today. Nothing is assumed about what you did not choose.",
      sections: [
        {
          id: "hearing",
          title: "What I'm hearing",
          from: "forward",
          opening: "Part of you is reaching for something:",
          lines: {
            honest: "There is a wish to be honest about something that has stayed quiet.",
            rest: "There is a wish to stop and rest — properly, not in the gaps.",
            limit: "There is a limit waiting to be set, possibly overdue.",
            repair: "There is a wish for repair, which usually means the relationship still matters.",
            help: "There is a wish to ask for help, which is often harder than carrying on.",
            grieve: "There is a wish to grieve, which suggests something has not yet been allowed its space.",
            live: "There is a wish for your life to feel like yours again.",
            unclear: "There is a pull toward movement without a name yet, and it still counts.",
          },
          unanswered:
            "The forward pull was not named today. It may not be ready for words, and it does not stop existing while it waits.",
        },
        {
          id: "protected",
          title: "What the other part may be protecting",
          from: "holdback",
          opening: "And part of you is holding the line:",
          lines: {
            hurt: "It may be protecting you from being hurt in a way you have already survived once.",
            others: "It may be protecting other people from fallout you would then have to manage.",
            stability: "It may be protecting a stability that took real effort to build.",
            energy: "It may be protecting the little energy left, which is a practical concern rather than an excuse.",
            hope: "It may be protecting you from hoping and being disappointed again.",
            identity: "It may be protecting who you had to become in order to get through.",
            unknown: "It may be protecting something not yet nameable, which is still worth listening to.",
          },
          unanswered:
            "The cautious part was not described, and it will not be second-guessed here. It is usually protecting something that once mattered a great deal.",
        },
        {
          id: "next",
          title: "One honest next step",
          from: "step",
          lines: {
            thank: "Thanking the cautious part tends to reduce how loudly it has to argue.",
            tiny: "A step both parts can live with is more durable than a decisive one they cannot.",
            wait: "Waiting on purpose is different from stalling, and it keeps the choice yours.",
            talk: "Talking with someone unhurried can make ambivalence far less exhausting.",
            prepare: "Hearing both sides was the step, and it is a substantial one.",
          },
          unanswered:
            "Nothing was chosen, and nothing needs deciding. Both pulls were listened to, which was the work.",
        },
      ],
      closing: "No decision has been made here, and none is being urged on you.",
    },
    close: {
      heading: "Both parts heard",
      body: [
        "You let two opposing things be true without forcing a conclusion. That is difficult, and it is genuinely useful.",
        "Tomorrow turns gently toward what the current arrangement is costing — without blame.",
      ],
      carryForward:
        "Carry forward one sentence: I can want change and want safety at the same time.",
    },
  },
];
