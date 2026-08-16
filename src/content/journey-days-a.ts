// The First Journey — Days 1–5.
// PROVISIONAL copy. Founder content review required before any public use.

import type { JourneyDayContent } from "./journey-types";

export const DAYS_ONE_TO_FIVE: JourneyDayContent[] = [
  {
    day: 1,
    answerMeaningVersion: "v1",
    title: "Begin Where You Are",
    theme: "Starting honestly, rather than starting well.",
    motif: "threshold",
    shape: "standard",
    descriptor: "Arriving honestly · about 10 minutes",
    arrive: {
      purpose:
        "Starting with one honest picture of the present can reduce the pressure to solve everything. Today helps you notice what needs attention, what you hope may become different, and what has already helped you keep going.",
      lead: "You do not have to be ready. You only have to be here.",
      body: [
        "This is the first day of the 10-day journey. Nothing here is timed, scored or compared, and nothing you choose is seen by another person.",
        "Today is about arriving as you actually are — tired, guarded, unsure, hopeful, or several of those at once.",
      ],
      settle: [
        "Let your eyes travel slowly around the room you are in and rest on one ordinary object.",
        "Feel where your body is supported — the chair, the floor, the bed beneath you.",
        "If breathing feels comfortable, take one easy breath in. As you breathe out, let the exhale be slightly longer. Do not force it. If breath focus is uncomfortable, keep your attention on the room.",
      ],
    },
    understand: {
      heading: "A simple map, not a demand to change",
      body: [
        "People postpone difficult things for many reasons: fear, exhaustion, uncertainty, limited support, present demands, or a response that has helped them cope. Delay is not proof of laziness or unwillingness.",
        "Today offers a simple map: Where am I now? What needs attention? What do I hope may become a little different? What has helped me keep going?",
        "You will not be asked to relive anything, explain yourself, or disclose private details. The purpose is orientation, not breakthrough.",
      ],
      info: [
        {
          term: "What does “protective” mean here?",
          explanation:
            "A protective response is something that may help a person cope, preserve safety, reduce pain or keep functioning. It may still be needed in some circumstances. The word is a possibility, not praise, blame or diagnosis.",
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
          { id: "heavy", label: "Emotionally weighed down or worn out" },
          { id: "tense", label: "Tense, braced, on alert" },
          { id: "flat", label: "Flat or far away from myself" },
          { id: "restless", label: "Restless — hard to settle" },
          { id: "tender", label: "Tender, close to tears" },
          { id: "steady", label: "Steadier than usual" },
          { id: "unsure", label: "I genuinely can't tell" },
        ],
        echo: {
          heading: "What you noticed today",
          byOption: {
            heavy:
              "You arrived emotionally weighed down or worn out. That can come from many things, and it does not mean you are failing. You do not need to accomplish much today. One honest choice—or simply reading—can be enough.",
            tense:
              "You arrived tense or braced. This app cannot know why, and it will not ask you to relax on command.",
            flat:
              "You arrived feeling flat or numb. That can be noticed without deciding what it means or asking it to change.",
            restless:
              "You arrived restless or unable to settle. You may continue without becoming still.",
            tender:
              "You arrived feeling tender or close to tears. You do not have to explain, deepen, or move away from that feeling.",
            steady:
              "You arrived feeling steadier than usual. That can simply be noticed, without deciding what it means or what it makes possible.",
            unsure:
              "Not being able to tell is an honest answer, and a common one. You can stay near the question without solving it.",
          },
          unanswered:
            "You continued without choosing, and that is a real answer too. Sometimes the state we are in has no available word — the day works the same without one.",
          closing: "Whatever is here right now is enough to begin with. Nothing has to change first.",
        },
      },
      {
        id: "brought",
        eyebrow: "Choose",
        prompt: "What brought you here — in plain words?",
        hint: "Choose as many as fit. You are not committing to working on any of them.",
        select: "many",
        options: [
          { id: "stuck", label: "I feel stuck and cannot yet see a way forward" },
          { id: "loss", label: "Something was lost, or someone was" },
          { id: "hurt", label: "A hurt or unresolved experience still affects me" },
          { id: "tired", label: "I am worn out from holding everything together" },
          { id: "distant", label: "I feel distant — from people, from myself, from God" },
          { id: "shame", label: "I feel shame or painful self-blame" },
          { id: "hope", label: "I want to feel more hope or possibility" },
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
          "Begin outwardly. Notice three neutral things around you—objects, colours, shapes or sounds.",
          "Choose one broad area from what brought you here. No event, person or history needs to be named.",
          "Privately complete: ‘Right now, this part of life feels…’ One plain phrase is enough.",
          "If it feels workable, add: ‘What I wish could be a little different is…’ ‘I do not know yet’ is a complete ending.",
          "Name one resource that has helped you reach today—a quality in you, a person, a practice, faith, practical help or simple necessity.",
          "Finish with: ‘I can begin here without solving this today,’ and return your attention to the room.",
        ],
        notRequired:
          "Gentler route: choose only one sentence stem. Read-only route: read the stems without answering. No writing, disclosure, decision or action is required.",
      },
      spiritual: {
        title: "Scripture & Spiritual Reflection — an honest opening",
        summary:
          "A Christian pathway, offered only if you choose it. It is an invitation, not a requirement or a test of faith.",
        steps: [
          "Orient to the room, then read the words once if you wish.",
          "Notice that the speaker begins from being known, not from proving worthiness.",
          "If useful, offer one honest sentence about where you are and one sentence about what you hope may become different.",
          "You may ask for enough light, strength, support or wisdom for one next step. No answer or outcome is promised.",
          "End in silence or return your attention to the room.",
        ],
        notRequired:
          "No belief, certainty or particular feeling is required. Silence counts. You may also leave this path entirely.",
        scripture: {
          reference: "Psalm 139:1, 23 (World English Bible)",
          body: "Yahweh, you have searched me, and you know me… Search me, God, and know my heart. Try me, and know my thoughts.",
          note: "The prayer begins with being known. ‘Search me’ is a voluntary invitation, not surveillance, accusation or a demand to expose yourself.",
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
        {
          id: "tell",
          label: "Say one true sentence to someone safe",
          note: "Only with someone who has consistently respected your limits and can listen without pressure or retaliation. This app cannot decide who is safe; preparing a sentence without sharing it counts.",
        },
        { id: "return", label: "Come back to Day 2 when there is space" },
        { id: "prepare", label: "Nothing outward today — simply noticing is my step" },
      ],
    },
    reflection: {
      intro:
        "This reflection stays close to what you chose\u2014or left open\u2014today. Keep what feels true, and leave anything that does not.",
      sections: [
        {
          id: "hearing",
          title: "How you arrived",
          from: "state",
          opening: "You arrived as you were today. The fuller reasons remain yours:",
          lines: {
            heavy:
              "You arrived emotionally weighed down or worn out. What is taking that energy does not need to be explained here to be taken seriously.",
            tense:
              "You arrived tense or braced. You did not need to become settled before beginning.",
            flat:
              "You arrived feeling flat or far away from yourself. That distance can be named without being judged.",
            restless:
              "You arrived restless and hard to settle. You did not need to become calm before beginning.",
            tender:
              "You arrived tender or close to tears. That tenderness deserves room, not pressure.",
            steady:
              "You arrived steadier than usual. Steadiness is welcome without needing to mean that everything is well.",
            unsure:
              "You could not tell how you arrived. Not knowing is an honest place to begin.",
          },
          unanswered:
            "You left how you arrived unnamed. You do not need to explain yourself for this reflection to meet you with care.",
        },
        {
          id: "underneath",
          title: "What you named",
          from: "brought",
          opening:
            "You gave some words to what brought you here, while the fuller story, reasons, and history remain yours:",
          lines: {
            stuck: "You named feeling stuck and not being able to see the way out.",
            loss: "You named that something was lost, or someone was.",
            hurt: "You named something that happened and has never been resolved.",
            tired: "You named being worn out from holding everything together.",
            distant: "You named feeling distant — from people, from yourself, or from God.",
            shame: "You named carrying something you feel bad about.",
            hope: "You named wanting to hope again without knowing how.",
            private:
              "You kept what brought you here private today. That boundary is respected; you still belong fully in this journey.",
          },
          unanswered:
            "You left what brought you here unnamed. Nothing needs to be guessed or explained for your experience to deserve care.",
        },
        {
          id: "care",
          title: "What may deserve care now",
          opening:
            "Taken together, how you arrived describes today’s capacity, while what brought you describes why this journey matters. Those are two parts of a starting map—not an explanation of your life and not a demand that today’s capacity solve the concern.",
          unanswered:
            "Whatever else is true, the part of you that opened this deserves less pressure and more gentleness.",
        },
        {
          id: "next",
          title: "One honest next step",
          from: "step",
          lines: {
            name: "Holding one honest word may be enough to keep today from disappearing.",
            care: "One small act of physical care is a real step, not a substitute for one.",
            tell:
              "You considered saying one true sentence to someone safe enough. Nothing has to be shared, and this reflection cannot decide who is safe.",
            return: "Coming back when there is space is a step, not a delay.",
            prepare:
              "Nothing outward is required. Noticing can be a complete way to leave today.",
          },
          unanswered:
            "No next step was named. None is owed; the day can end here without one.",
        },
      ],
      closing:
        "This is not a diagnosis or assessment. It is a gentle reflection back\u2014one moment in which you did not have to explain more than you chose.",
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
    answerMeaningVersion: "v1",
    title: "Notice What Is Here",
    theme: "Telling sensation, feeling, thought and pressure apart.",
    motif: "attention",
    shape: "notice-first",
    descriptor: "Gentle attention · about 10 minutes",
    arrive: {
      purpose:
        "A body sensation, an emotion, a thought and pressure can feel like one blur, yet each may need a different response. Separating them can make your next step more accurate and kinder.",
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
          {
            id: "feeling",
            label:
              "A feeling—sadness or grief, fear, anger, shame, loneliness, longing, relief or hope",
          },
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
          "Choose a route. Outward attention and inward attention are equally complete.",
          "Outward route: notice three neutral things by colour, shape, sound or position. Name them silently.",
          "Inward route, only if workable: notice one point of support or one body sensation. Describe it without assigning a cause.",
          "Privately sort one thing you noticed: ‘A body signal is…’, ‘A feeling is…’, ‘A thought is…’, ‘A pressure is…’ or ‘Tiredness is…’. ‘Nothing clear’ also works.",
          "Ask: ‘What kind of response might fit this moment—acknowledgment, practical action, rest, support, a limit, medical attention, or no action?’",
          "Reorient to the room. No response has to be chosen or completed today.",
        ],
        notRequired:
          "Gentler route: use only the outward step. Read-only route: read the categories without sorting anything. The goal is clearer description, not calmness, insight or symptom change.",
      },
      spiritual: {
        title: "Scripture & Spiritual Reflection — permission to lament",
        summary:
          "A Christian pathway for days when faith feels thin. Choose it only if you want it.",
        steps: [
          "Read the passage once. Notice that the writer is not pretending to be fine.",
          "Notice, too, that he speaks to himself and to God at the same time, and does not resolve it in one line.",
          "If you wish, name one feeling, question or need before God. You do not have to move from despair to hope on demand.",
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
        {
          id: "checkin",
          label:
            "Do one brief check-in later, if repeated checking feels helpful rather than increasing anxiety",
        },
        {
          id: "ease",
          label: "If comfortable, experiment with softening my jaw, shoulders or hands once",
        },
        { id: "rest", label: "Give myself ten honest minutes of rest" },
        { id: "word", label: "Write down one word and leave the reflection there for today" },
        {
          id: "share",
          label: "Share one honest sentence with someone I trust",
          note: "Only with someone who has shown respect for your limits. The app cannot determine who is safe; preparing the sentence counts.",
        },
        { id: "prepare", label: "Nothing outward — noticing was the step" },
      ],
    },
    reflection: {
      intro: "Built only from what you selected today, and offered tentatively.",
      sections: [
        {
          id: "hearing",
          title: "What you noticed",
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
          id: "care",
          title: "What the distinction may offer",
          opening:
            "A body signal and a kind of load are two separate pieces of information. One does not prove the cause of the other. When both are available, separating them may help you choose acknowledgment, practical care, rest, support, a limit, medical attention or no action.",
          unanswered:
            "No connection will be assumed. Sensation, emotion, thought and pressure can remain unclear or separate today.",
        },
        {
          id: "next",
          title: "One honest next step",
          from: "step",
          lines: {
            checkin: "One more check-in later today keeps this from being a one-off exercise.",
            ease: "If comfortable, softening one held place is one small experiment. No result is required.",
            rest: "A brief period of rest may be a practical response to tiredness or overload; it does not have to solve the day.",
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
    answerMeaningVersion: "v1",
    title: "Name What You're Carrying",
    theme: "Giving a plain word to something that has stayed wordless.",
    motif: "naming",
    shape: "standard",
    descriptor: "Finding words · about 12 minutes",
    arrive: {
      purpose:
        "Naming one manageable part of an experience can make it less vague and easier to respond to. Naming is not diagnosis, and it does not fix what happened.",
      lead: "Naming something is not the same as fixing it, and it is not a diagnosis.",
      body: [
        "By ‘carrying,’ this journey means grief, worry, responsibility, hurt, shame, anger, loneliness, regret or another experience that continues to take energy, whether or not anyone else can see it.",
        "Today you may give one manageable part of it an ordinary word. The word does not have to be perfect or complete.",
        "You do not need to name an event, person or history. One broad word, ‘not sure,’ keeping it private, or no word today are all valid routes.",
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
        "Sometimes experience arrives as undefined emotional strain before clear words come. A plain word can help you notice one part of it, communicate it or decide what support may be needed.",
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
        prompt: "Where, if anywhere, do you notice its presence or effects in life right now?",
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
          "Choose one broad word from today, use ‘not sure,’ or keep the word private.",
          "Choose a form that feels workable: think one sentence, write it outside the app, speak it privately, use it in prayer, or prepare it for a safe person later. Nothing has to be shared today.",
          "Complete one stem: ‘I am carrying…’, ‘I am afraid…’, ‘What hurts is…’, ‘I feel unseen when…’ or ‘What is taking most of my energy is…’.",
          "Stop after one sentence. Do not add details unless you freely choose to do so somewhere appropriate.",
          "If workable, ask: ‘What might I need after naming this—space, comfort, rest, practical help, witness, protection, or no clear response yet?’",
          "Reorient to ordinary details around you and let the sentence rest.",
        ],
        notRequired:
          "Gentler route: choose a word without making a sentence. Read-only route: read the stems and leave them unanswered. No fuller story, body focus, disclosure, insight, relief or action is required.",
      },
      spiritual: {
        title: "Scripture & Spiritual Reflection — honest lament",
        summary:
          "A Christian pathway for giving one honest sentence to God. Choose it only if you want it.",
        steps: [
          "Read the lament and notice that pain and unanswered questions are allowed to remain present.",
          "If you wish, choose one line: ‘God, this is what hurts…’, ‘This is what I have lost…’, ‘This is what I do not understand…’ or ‘This is what I need…’.",
          "Complete only that line. It may also remain unfinished.",
          "Stop, sit in silence or reorient to the room. Resolution, praise and certainty are not required.",
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
          note: "Only with someone who has consistently respected your limits and can respond without pressure, retaliation or misuse of what you share. Preparing the sentence counts.",
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
          title: "What you named",
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
            "The word you selected and where you notice it do not establish a cause. Together, they form a modest map: one experience taking energy, and one or more places where acknowledgment, practical care, support, protection or professional attention may be useful.",
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
    answerMeaningVersion: "v1",
    title: "What It May Have Protected",
    theme: "Meeting one familiar response with understanding rather than contempt.",
    motif: "shelter",
    shape: "standard",
    descriptor: "Understanding one response · about 12 minutes",
    arrive: {
      purpose:
        "A familiar response may make more sense when you see what happens before it, what it tries to protect and what it affects now. Understanding is not excusing harm; it creates more room for choice.",
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
        "A pattern means a response that tends to return in certain situations. It describes what happens; it is not an identity or diagnosis.",
        "‘Protection’ is one possible lens. A response may reduce pain, preserve connection, create predictability, conserve energy or help someone meet real present demands. Protection may still be necessary where danger, unfairness, illness, disability or responsibility remains.",
        "Understanding does not excuse harmful effects or remove responsibility. It creates a clearer map: what happens, when it appears, what it may do in the short term, and what it may cost now. No origin memory is required.",
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
        title: "Reflection Practice — map one response with compassion",
        summary:
          "A current-context map of what happens, what the response may do, and what it may cost—without requiring an origin story or change.",
        steps: [
          "Orient outward and notice two neutral details. No body attention is required.",
          "Complete privately: ‘When ______ happens, I sometimes ______.’",
          "If the protection lens fits, add: ‘In that moment, this may be trying to prevent, preserve or provide ______.’ If it does not fit, say: ‘I do not know what keeps this going.’",
          "Ask both: ‘How might this help in the short term?’ and ‘What might it cost now?’ A present cost does not prove the response is unnecessary.",
          "Reflect back: ‘This response may make sense in context. Understanding it does not excuse every effect or decide whether, when or how I should change.’",
          "Reorient to the room and leave any part unfinished.",
        ],
        notRequired:
          "Gentler route: complete only ‘When…, I tend to…’. Read-only route: read the map without applying it. No past event, trauma label, parts language, body focus, surrender or change decision is required.",
      },
      spiritual: {
        title: "Scripture & Spiritual Reflection — loved before readiness",
        summary:
          "A Christian pathway in which love precedes performance, certainty, or release.",
        steps: [
          "Orient to the room, then read the phrase slowly.",
          "Notice the order: Jesus sees and loves before the young man decides anything.",
          "This story is not equating your coping with possessions or labelling your response as sin.",
          "If you wish, name one response and wonder, under mercy, what it may be trying to prevent, preserve or provide.",
          "Ask for truthful understanding and whatever care, boundary, support or wisdom is appropriate. No release or outcome is required.",
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
      prompt: "What is one small way to remember this map without forcing change?",
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
          note: "Preparing counts. Share only with someone who has consistently respected your limits; the app cannot determine who is safe.",
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
            "Taken together, the response, the situations where it appears and its possible protective purpose form a working map—not a diagnosis or origin story. The map may explain short-term usefulness while leaving room to notice present cost, ongoing necessity and responsibility for effects.",
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
    answerMeaningVersion: "v1",
    title: "The Two Pulls Within You",
    theme:
      "A pull toward movement and a pull toward caution can be present together, without a decision being required.",
    motif: "two-pulls",
    shape: "standard",
    descriptor: "Making room for mixed feelings · about 10 minutes",
    arrive: {
      purpose:
        "Wanting change and wanting safety can exist together. Hearing both sides can reduce self-attack and show what would make one next step more workable.",
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
        "Mixed wishes, needs or concerns about the same area of life are common. A pull toward movement and a pull toward caution can exist together.",
        "Movement may point toward what matters or what is longed for. Caution may carry information about safety, capacity, responsibility, timing, uncertainty, belonging or the need for support.",
        "Capacity here means being able to stay with one manageable truth without immediately escaping it or becoming overwhelmed. Capacity grows through brief, safe contact—not pressure. Stopping when you are too stirred or far away is part of wise pacing.",
        "Listening makes the conflict clearer. It does not require finding two pulls, obeying either one, treating them as equally right or deciding today.",
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
          "Begin outwardly by noticing one or two neutral details around you.",
          "Privately complete: ‘One side of me hopes for…’ or ‘One side of me wants…’. It may remain unfinished.",
          "Complete: ‘Another concern wants me to take seriously…’ ‘I do not know’ is a valid ending.",
          "Reflect back: ‘I hear the hope for ______. I hear the concern about ______.’ If only one is present, name only that one.",
          "If workable, remain with the sentence or sentences for one brief pause—without debating, solving or choosing.",
          "Ask: ‘What might make listening or one future step more workable—time, information, support, rest, safety, a boundary, or something else?’",
          "Finish with: ‘I do not have to settle this today,’ and reorient outward.",
        ],
        notRequired:
          "Gentler route: name only one pull. Read-only route: read the stems without answering. No two distinct parts, origin story, decision, resolution or action is required.",
      },
      spiritual: {
        title: "Scripture & Spiritual Reflection — two truths in one honest prayer",
        summary:
          "One biblical example of mixed honesty spoken to God — offered as an example, not as a judgement on your caution.",
        steps: [
          "Orient outward, then read the sentence if you wish.",
          "Notice that belief and uncertainty are held together in one honest prayer.",
          "Caution is not being equated with unbelief, and faith does not require overriding safety, limits or present reality.",
          "If useful, pray: ‘Part of me longs for ______. Another part is concerned about ______. Give me truth, mercy, wisdom and an honest pace.’",
          "End in silence or reorient outward. No answer or action is required.",
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
          note: "No need to share today. Use only a person who has consistently respected your limits; the app cannot determine who is safe.",
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
            energy: "You pointed to limits in energy, health or capacity — a real practical concern that deserves respect.",
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
          title: "What may need room",
          opening:
            "Taken together, the longing and the concern form a decision map: one points toward what matters, while the other may identify conditions that need respect. The map does not establish which direction is wiser, and sometimes only one side is clear.",
          unanswered:
            "Longing and caution can both carry information, and sometimes only one is clear. No single pull has to decide today.",
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
