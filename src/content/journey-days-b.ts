// The First Journey — Days 6–10.
// PROVISIONAL copy. Founder content review required before any public use.

import type { JourneyDayContent } from "./journey-types";

export const DAYS_SIX_TO_TEN: JourneyDayContent[] = [
  {
    day: 6,
    title: "What It Is Costing Now",
    theme: "Present-day cost, noticed without blame.",
    motif: "cost",
    shape: "notice-first",
    descriptor: "An honest inventory · about 12 minutes",
    arrive: {
      lead: "This is not an audit of your failures.",
      body: [
        "Yesterday held two pulls together. Today looks at what the current arrangement asks of you now — in your body, your energy, your relationships and your sense of meaning.",
        "The aim is accuracy, not guilt. Noticing a cost does not oblige you to pay a different one.",
      ],
      settle: [
        "Let your jaw unclench slightly and your tongue rest away from the roof of your mouth.",
        "Feel the surface under you taking your full weight for one breath.",
        "Notice one sound in the room without following it anywhere.",
      ],
    },
    understand: {
      heading: "Intention and cost are different questions",
      body: [
        "A response can be well-intentioned and expensive at the same time. Keeping the peace may protect a relationship and quietly drain you. Self-reliance may keep you upright and keep you alone.",
        "People often avoid this question because it seems to require immediate action. It does not. You can look at a cost clearly and still choose to keep paying it for now — with your eyes open, which is different from paying it by default.",
        "Nothing today asks you to confront anyone, end anything or make a major decision.",
      ],
      info: [
        {
          term: "Why look at cost at all?",
          explanation:
            "Because a cost paid unknowingly tends to be paid indefinitely. Naming it puts the choice back in your hands, even if today you choose exactly what you were already doing.",
        },
      ],
    },
    questions: [
      {
        id: "cost",
        eyebrow: "Notice",
        prompt: "Where is the cost showing up at the moment?",
        hint: "Choose any that fit. This is observation, not accusation.",
        select: "many",
        options: [
          { id: "body", label: "My body — tension, pain, sleep, appetite" },
          { id: "energy", label: "My energy — nothing left after the essentials" },
          { id: "closeness", label: "Closeness — people are near but not close" },
          { id: "patience", label: "My patience with the people I love" },
          { id: "choices", label: "My choices — I have narrowed my own life" },
          { id: "values", label: "My values — I am living against something I believe" },
          { id: "meaning", label: "Meaning — things feel greyer than they should" },
          { id: "hope", label: "Hope — I have quietly stopped expecting change" },
        ],
        echo: {
          heading: "What that cost may indicate",
          byOption: {
            body: "A physical cost often appears before we consciously admit the load is too much.",
            energy: "Running on empty after essentials suggests the reserve has been spent, not misspent.",
            closeness: "Having people near without being close is a particular kind of lonely, and a common one.",
            patience: "Short patience with people you love is usually a capacity signal rather than a character one.",
            choices: "A life narrowed for safety can become smaller than the danger it was avoiding.",
            values: "Living against your own values costs something even when nobody notices.",
            meaning: "Greyness is frequently what protection looks like from the inside after a long time.",
            hope: "Quietly lowering expectations is a way of preventing disappointment, and it has its own price.",
          },
          unanswered:
            "You continued without naming a cost, and nothing will be assumed. It is also possible that the honest answer today is that things are bearable.",
          closing: "Naming a cost does not commit you to changing anything about it.",
        },
      },
      {
        id: "protects",
        eyebrow: "Balance",
        prompt: "And what is it still doing for you?",
        hint: "The honest answer usually includes something real. Choose any that fit.",
        select: "many",
        options: [
          { id: "peace", label: "Keeping things peaceful" },
          { id: "functioning", label: "Keeping me functioning day to day" },
          { id: "safe", label: "Keeping me safe from something specific" },
          { id: "others", label: "Protecting other people" },
          { id: "predictable", label: "Keeping life predictable" },
          { id: "little", label: "Honestly, not much any more" },
        ],
      },
    ],
    practise: {
      heading: "Two ways to practise today",
      intro: "Both hold cost and care together, rather than one at a time.",
      either: "Either or both, whichever fits the energy you have.",
      reflection: {
        title: "Reflection Practice — the cost-and-care inventory",
        summary:
          "A short, balanced look at what is being spent and what would ease it slightly.",
        steps: [
          "Bring to mind one cost you noticed today. Keep it in view without arguing with it.",
          "Say silently: “This costs me ______.” Be specific and unsparing, but not cruel.",
          "Then: “It is also still doing ______ for me.” Both halves belong.",
          "Then ask the gentler question: “What would make this one percent less expensive this week?”",
          "Notice whether your answer is something you could actually do, or something someone else would have to do. If it is the second, that is worth knowing.",
          "Finish with: “I am allowed to see this clearly without changing it today.”",
        ],
        notRequired:
          "No confrontation, no ultimatum, no decision. Nothing here requires you to speak to anyone.",
      },
      spiritual: {
        title: "Scripture & Spiritual Reflection — rest without a slogan",
        summary:
          "A Christian pathway about being met while tired, offered only if you choose it.",
        steps: [
          "Read the passage once, slowly. Notice it is addressed to people already labouring, not to people who have sorted themselves out.",
          "Notice the words “gentle and lowly”. The invitation is to a manner, not a transaction.",
          "If you wish, say plainly what you are tired of carrying. There is no requirement to hand it over neatly or feel lighter afterwards.",
          "Sit for a few breaths. If nothing shifts, nothing has gone wrong.",
        ],
        notRequired:
          "This is not “just give it to God”. Nothing is solved by a phrase, and being tired is not a spiritual failure. You may read and leave it there.",
        scripture: {
          reference: "Matthew 11:28–30 (World English Bible)",
          body: "Come to me, all you who labor and are heavily burdened, and I will give you rest… for I am gentle and lowly in heart; and you will find rest for your souls.",
          note: "Rest here is offered to the exhausted as they are. It is not a reward for surrendering correctly.",
        },
      },
    },
    step: {
      id: "step",
      eyebrow: "One Honest Step",
      prompt: "What is one small thing that would ease the cost slightly?",
      hint: "One choice. Nothing large, nothing confrontational.",
      select: "one",
      options: [
        { id: "rest", label: "Protect one small piece of rest this week" },
        { id: "ask", label: "Ask for one specific thing from one person" },
        { id: "return", label: "Return one task that was never mine" },
        { id: "notice", label: "Notice the cost once more, without acting" },
        { id: "support", label: "Speak to a professional or trusted support about it" },
        { id: "prepare", label: "Nothing outward — seeing it clearly was the step" },
      ],
    },
    reflection: {
      intro: "Drawn only from today's selections, and offered tentatively.",
      sections: [
        {
          id: "hearing",
          title: "What I'm hearing",
          from: "cost",
          opening: "You named where it is landing:",
          lines: {
            body: "The body is carrying part of this, which usually means the load is not theoretical.",
            energy: "Energy is depleted after the essentials, which is a real limit rather than a motivation problem.",
            closeness: "Closeness has thinned, which can be lonely in a way that is hard to explain to anyone nearby.",
            patience: "Patience is short with the people who matter most, which is often the first cost people notice.",
            choices: "The range of your life has narrowed, perhaps more than the original danger required.",
            values: "Something is being lived against your own values, and that friction is expensive.",
            meaning: "Colour has drained out of things somewhat, which frequently accompanies long-term protection.",
            hope: "Expectation has been quietly lowered, which prevents disappointment and costs something else.",
          },
          unanswered:
            "You did not name a cost today. That may be because nothing pressing surfaced, and it may be because it is not the right week to look. Both are legitimate.",
        },
        {
          id: "protected",
          title: "What it may still be protecting",
          from: "protects",
          opening: "You also named what it still does:",
          lines: {
            peace: "It keeps the peace, and peace is not nothing — even peace that costs you.",
            functioning: "It keeps you functioning, which matters when other people depend on you.",
            safe: "It keeps you safe from something specific, which deserves respect rather than override.",
            others: "It protects other people, which is often the hardest thread to pull.",
            predictable: "It keeps life predictable, which can be worth a great deal after unpredictability.",
            little: "It may be doing less for you now than it once did, which is worth noticing without haste.",
          },
          unanswered:
            "The other side of the ledger was left blank. It is usually there, though — most costly arrangements are still buying something.",
        },
        {
          id: "care",
          title: "What may deserve care now",
          opening:
            "Seeing a cost accurately can be uncomfortable. It may help to remember that noticing is not the same as being obliged to act.",
          unanswered:
            "Whatever the ledger holds, the person paying it may deserve some gentleness today.",
        },
        {
          id: "next",
          title: "One honest next step",
          from: "step",
          lines: {
            rest: "One protected piece of rest is a small, defensible change.",
            ask: "One specific request of one person is far more achievable than a general one of everyone.",
            return: "Returning a task that was never yours is a boundary in practical clothing.",
            notice: "Noticing again, without acting, keeps the pace yours.",
            support: "Talking it through with a professional or trusted support is a sound use of this.",
            prepare: "Seeing it clearly was the step, and clarity is not a small thing.",
          },
          unanswered:
            "No step was chosen. The honest look you took today stands on its own.",
        },
      ],
      closing: "Nothing here is advice about a decision, and nothing has been concluded about your life.",
    },
    close: {
      heading: "Seen clearly, held gently",
      body: [
        "You looked at a cost without turning it into a verdict on yourself. That is the difficult version of honesty.",
        "Tomorrow moves toward a kinder way of holding all of this.",
      ],
      carryForward:
        "Carry forward one sentence: I can see the cost and still choose my own pace.",
    },
  },

  {
    day: 7,
    title: "A More Compassionate Way to Hold It",
    theme: "Accurate compassion, rather than harshness or false comfort.",
    motif: "compassion",
    shape: "standard",
    descriptor: "Turning toward yourself · about 12 minutes",
    arrive: {
      lead: "Most people are gentler with others than they are with themselves.",
      body: [
        "Today is about the tone you use inside your own head — and whether it is accurate.",
        "Compassion here does not mean flattery or excuses. It means speaking to yourself the way a wise, honest friend would.",
      ],
      settle: [
        "Put one hand somewhere steady — your chest, your arm, the table.",
        "Let two breaths pass without doing anything with them.",
        "Notice that you are the one who kept showing up to this.",
      ],
    },
    understand: {
      heading: "Compassion is accuracy, not indulgence",
      body: [
        "Self-criticism promises to keep us in line. In practice it mostly keeps us defended, and defended people find change harder, not easier.",
        "Accurate compassion says two things at once: this is genuinely difficult, and you are genuinely responsible for what you do next. It does not require pretending anything is fine.",
        "If self-kindness feels false or undeserved, that reaction is common and worth noting rather than overriding. There are ways into this that do not involve saying nice things to yourself.",
      ],
      info: [
        {
          term: "What if self-compassion feels fake?",
          explanation:
            "Then start with accuracy instead of warmth. “This has been hard, and I have been doing my best with it” is a factual sentence. You can also use the body rather than words — steadiness, warmth or rest can carry compassion without any statement at all.",
        },
      ],
    },
    questions: [
      {
        id: "tone",
        eyebrow: "Notice",
        prompt: "When you are struggling, what does your inner voice sound like?",
        hint: "Choose whichever is most familiar.",
        select: "many",
        options: [
          { id: "harsh", label: "Harsh — you should have handled this better" },
          { id: "dismissive", label: "Dismissive — other people have it worse" },
          { id: "impatient", label: "Impatient — why is this still going on" },
          { id: "anxious", label: "Anxious — running through everything that could go wrong" },
          { id: "silent", label: "Silent — I don't speak to myself at all" },
          { id: "mixed", label: "It shifts depending on the day" },
          { id: "kind", label: "Reasonably kind, most of the time" },
        ],
        echo: {
          heading: "Where that voice may come from",
          byOption: {
            harsh: "A harsh inner voice is usually borrowed. Somebody spoke that way first, and it was learned rather than chosen.",
            dismissive: "Comparing your pain downward keeps you from taking it seriously — which is often exactly what it was trained to do.",
            impatient: "Impatience with your own recovery frequently comes from being expected to bounce back quickly.",
            anxious: "An anxious inner voice is usually trying to prevent harm by rehearsing it in advance.",
            silent: "Silence is not neutral. It may be an absence of anyone ever speaking kindly to you when it mattered.",
            mixed: "A voice that shifts often tracks how much reserve you have on a given day.",
            kind: "A reasonably kind inner voice is an asset, and it may still go quiet under real pressure.",
          },
          unanswered:
            "You continued without naming the voice, and it will not be guessed at. What is true generally is that the tone we use inside was learned somewhere.",
          closing: "Noticing the tone is the change. You do not have to argue with it today.",
        },
      },
      {
        id: "need",
        eyebrow: "Consider",
        prompt: "What might the struggling part of you actually need?",
        hint: "Choose any that fit. Needing something is not weakness.",
        select: "many",
        options: [
          { id: "rest", label: "Rest, without earning it first" },
          { id: "acknowledged", label: "To be told this has genuinely been hard" },
          { id: "notalone", label: "To not be alone with it" },
          { id: "permission", label: "Permission to feel what I feel" },
          { id: "patience", label: "Time, without a deadline attached" },
          { id: "safety", label: "To feel safe before anything else" },
          { id: "forgiveness", label: "To stop being punished by me" },
          { id: "unsure", label: "I don't know yet" },
        ],
      },
    ],
    practise: {
      heading: "Two ways to practise today",
      intro:
        "One uses words. One does not, for people who would rather not write or speak anything.",
      either: "Either or both. The wordless one is not the lesser option.",
      reflection: {
        title: "Reflection Practice — a compassionate response",
        summary:
          "Speaking to the struggling part of you as a wise friend would — or, if you prefer, offering steadiness instead of words.",
        steps: [
          "Bring to mind the part of you that has been struggling. Not the whole of you — the part.",
          "Imagine that part belonged to someone you respect and care about. Notice what you would not say to them.",
          "Now find one sentence you could say honestly: for example, “This has been hard, and you have kept going.”",
          "Say it once inwardly. If it feels false, make it more accurate rather than warmer, and try again.",
          "If words do not work today, do this instead: place a hand somewhere steady, let your breathing slow slightly, and stay there for thirty seconds. That is the whole practice — no sentence required.",
        ],
        notRequired:
          "Nothing has to be written, spoken aloud or believed fully. Warmth is not the requirement; accuracy is.",
      },
      spiritual: {
        title: "Scripture & Spiritual Reflection — mercy toward the barely-lit",
        summary:
          "A Christian pathway about being handled gently when you are worn thin.",
        steps: [
          "Read the passage. Notice what it says about damaged things: they are not discarded, and they are not forced.",
          "Notice what it does not say: it does not say the reed deserved to break, or that the wick should try harder.",
          "If you wish, hold the struggling part of you in mind and receive that image for a moment — being handled carefully rather than corrected.",
          "Sit quietly for a few breaths. Nothing needs to be confessed or resolved here.",
        ],
        notRequired:
          "There is no requirement to forgive anyone, including yourself, and no requirement to feel differently by the end. You may read this and leave it there.",
        scripture: {
          reference: "Isaiah 42:3 (World English Bible)",
          body: "He won't break a bruised reed. He won't quench a dimly burning wick.",
          note: "An image of care for what is barely holding on — without demand, and without haste.",
        },
      },
    },
    step: {
      id: "step",
      eyebrow: "One Honest Step",
      prompt: "What small act of compassion is possible today?",
      hint: "One choice, and accuracy counts as compassion.",
      select: "one",
      options: [
        { id: "sentence", label: "Say one accurate, kind sentence to myself once" },
        { id: "catch", label: "Catch the harsh voice once and simply notice it" },
        { id: "body", label: "Offer my body something it needs" },
        { id: "receive", label: "Let one kindness from someone else land, without deflecting" },
        { id: "prepare", label: "Nothing outward — noticing the tone was the step" },
      ],
    },
    reflection: {
      intro: "From what you chose today, tentatively and without conclusion.",
      sections: [
        {
          id: "hearing",
          title: "What I'm hearing",
          from: "tone",
          opening: "You noticed how you speak to yourself:",
          lines: {
            harsh: "The inner tone runs harsh, which is usually learned rather than deserved.",
            dismissive: "Your difficulty tends to be minimised by comparison, which quietly disqualifies you from your own care.",
            impatient: "There is impatience with how long this is taking, which recovery rarely respects.",
            anxious: "The voice runs ahead, rehearsing what might go wrong in an attempt to prevent it.",
            silent: "There is no inner voice at all, which may mean kindness was never modelled inwardly.",
            mixed: "The tone shifts with your reserves, which is ordinary and informative.",
            kind: "The tone is reasonably kind, and that is a genuine resource to protect.",
          },
          unanswered:
            "The inner tone was not named. It is still worth listening for later — most people are startled by what they hear.",
        },
        {
          id: "care",
          title: "What may deserve care now",
          from: "need",
          opening: "You considered what the struggling part may need:",
          lines: {
            rest: "Rest may be needed before anything else, and it does not have to be earned first.",
            acknowledged: "Acknowledgement may matter more than advice: this has genuinely been hard.",
            notalone: "Not being alone with it may be the need, which is a reason to let someone near.",
            permission: "Permission to feel what you feel may be the missing piece, and you are allowed to give it.",
            patience: "Time without a deadline may be what is required, and pressure will not speed it up.",
            safety: "Safety may need to come first. Nothing else settles well without it.",
            forgiveness: "An end to self-punishment may be what is needed, which is different from excusing anything.",
            unsure: "The need is not clear yet, and it does not have to be identified to be met gently.",
          },
          unanswered:
            "No need was named, and none will be invented. It may be enough today to allow that there is a part of you that needs something.",
        },
        {
          id: "next",
          title: "One honest next step",
          from: "step",
          lines: {
            sentence: "One accurate, kind sentence — said once — is a real change in tone.",
            catch: "Catching the harsh voice without fighting it is often the most effective first move.",
            body: "Offering the body what it needs is compassion that requires no words at all.",
            receive: "Letting one kindness land without deflecting is harder than it sounds, and it counts.",
            prepare: "Noticing the tone was the step. That is where this work begins.",
          },
          unanswered:
            "Nothing was chosen. The attention you gave to how you speak to yourself already matters.",
        },
      ],
      closing: "Nothing here excuses anything or asks you to forgive anyone.",
    },
    close: {
      heading: "A kinder hold",
      body: [
        "You turned toward the struggling part of yourself instead of away from it. That is not indulgence; it is usually what makes change possible.",
        "Tomorrow looks outward — carefully, and on your terms.",
      ],
      carryForward:
        "Carry forward one sentence: I can be honest with myself without being harsh.",
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
