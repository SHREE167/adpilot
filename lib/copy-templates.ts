import type {
  AdAngle,
  ChannelAllocation,
  OutreachScript,
  PlanInput,
  PriceTier,
  ProductIntel,
} from "./types";

export interface CreativeFill {
  explanations: Record<string, string>;
  adAngles: AdAngle[];
  outreach: OutreachScript[];
}

function cityOf(input: PlanInput): string {
  return input.city?.trim() || "your city";
}

function product(input: PlanInput, intel?: ProductIntel): string {
  return intel?.recognizedName?.trim() || input.product_name?.trim() || "this product";
}

function lang(input: PlanInput): string {
  return (input.language || "English").toLowerCase();
}

function explanationFor(
  row: ChannelAllocation,
  input: PlanInput,
  category: string,
  intel?: ProductIntel
): string {
  const p = product(input, intel);
  const city = cityOf(input);
  const extra = intel?.differentiators?.[0]
    ? ` Hook: ${intel.differentiators[0]}.`
    : "";
  const map: Record<string, string> = {
    google_search: `Capture people in ${city} already looking for ${p} or a close substitute. Search is the high-intent slice of a ${category} plan.`,
    google_display: `Cheap reminder ads around ${city} browsing. Use Display to stay visible after someone hits your site or a competitor.`,
    youtube: `Short video of ${p} in a real ${city} setting. Skip-in-5s hooks beat polished brand films on this budget.`,
    instagram_reels: `Reels is where ${city} 18–28 actually linger. Shoot ${p} in-hand, with local audio, and a WhatsApp sticker.`,
    instagram_feed: `Feed carousels for proof: price, flavour, reviews. Retarget Reel viewers who did not tap through.`,
    facebook: `Still the neighbourhood graph in ${city} for parents and 30+. Boost a simple offer + map pin.`,
    whatsapp: `Click-to-chat is the conversion event. Run Click-to-WhatsApp from ads and a status/broadcast for repeat buyers of ${p}.`,
    sharechat: `Regional short video in ${input.language} puts ${p} in front of mass India at a low CPM — useful when English Instagram saturates.`,
    linkedin: `Sponsored content and InMail to job titles that buy ${p}. Tight audience, high CPC, so we only use it when the ticket supports it.`,
    telegram: `Pin a launch note in relevant ${city} / industry groups. Treat Telegram as community, not a performance buy.`,
    reddit: `Promote in subs where people already argue about tools like ${p}. Native tone; no banner-speak.`,
    x: `Founder-led posts and a light promote around launch hours. Good for tech chatter, weak for local impulse.`,
  };
  const base =
    map[row.channelId] ??
    `Allocate here because the score (${row.score}) beat the 40 cutoff for this brief.`;
  return `${base}${extra}`;
}

function englishAngles(input: PlanInput, category: string): AdAngle[] {
  const p = product(input);
  const city = cityOf(input);
  if (category === "food") {
    return [
      {
        headline: `${p} hits different at 4pm`,
        primaryText: `Campus hunger in ${city} is real. ${p} is the pocket-friendly snack your friends will steal. Order today — we pack it fresh.`,
        cta: "Order on WhatsApp",
        channelHint: "Instagram Reels, WhatsApp",
      },
      {
        headline: `₹? and a 10-minute pickup`,
        primaryText: `No grand launch. Just ${p}, made for ${city} students who are done with overpriced canteen food.`,
        cta: "Find us nearby",
        channelHint: "Facebook, Google Display",
      },
      {
        headline: `The group-chat snack`,
        primaryText: `When the hostel group goes silent, drop ${p}. Share the code, split the pack, win the evening.`,
        cta: "Send this to your wing",
        channelHint: "ShareChat, WhatsApp",
      },
    ];
  }
  if (category === "saas" || input.goal === "b2b") {
    return [
      {
        headline: `${p} pays for itself in one sprint`,
        primaryText: `Teams in ${city} still stitch this together with sheets and Slack. ${p} gives you one workflow, one owner, one weekly number.`,
        cta: "Book a 20-min demo",
        channelHint: "LinkedIn, Google Search",
      },
      {
        headline: `Stop losing the same lead twice`,
        primaryText: `If your CRM is a graveyard, ${p} is the follow-up system your AEs will actually use.`,
        cta: "See a live pipeline",
        channelHint: "LinkedIn, Reddit",
      },
      {
        headline: `Built for Indian B2B reality`,
        primaryText: `GST, WhatsApp threads, multi-GSTIN chaos. ${p} was not designed in a Palo Alto vacuum.`,
        cta: "Start a trial",
        channelHint: "Google Search, X",
      },
    ];
  }
  return [
    {
      headline: `${p} for people in ${city}`,
      primaryText: `A straightforward offer for ${input.audience_age}. See why locals pick ${p} this month.`,
      cta: "Learn more",
      channelHint: "Instagram, Google",
    },
    {
      headline: `Try ${p} this week`,
      primaryText: `Built around ${input.goal}. Clear price, clear next step, no mystery funnel.`,
      cta: "Get started",
      channelHint: "WhatsApp, Feed",
    },
    {
      headline: `What ${city} is switching to`,
      primaryText: `Social proof first, then the offer. ${p} in the language your buyer already uses (${input.language}).`,
      cta: "Talk to us",
      channelHint: "Facebook, YouTube",
    },
  ];
}

function hindiAngles(input: PlanInput): AdAngle[] {
  const p = product(input);
  const city = cityOf(input);
  return [
    {
      headline: `${city} वाले, ${p} ट्राई किया?`,
      primaryText: `दाम साफ़ है, स्वाद/फ़ायदा साफ़ है। WhatsApp पर मँगवाइए — ${city} में डिलीवरी/पिकअप।`,
      cta: "WhatsApp पर ऑर्डर",
      channelHint: "ShareChat, WhatsApp",
    },
    {
      headline: `दोस्तों के साथ शेयर करो ${p}`,
      primaryText: `ग्रुप में डालो, ऑफ़र चलाओ, आज ही ख़त्म मत होने देना।`,
      cta: "अभी देखें",
      channelHint: "Instagram Reels",
    },
    {
      headline: `${p} — रोज़ की आदत`,
      primaryText: `बड़े ब्रांड का इंतज़ार मत करो। ${city} के लिए बना छोटा ब्रांड, बड़ी consistency.`,
      cta: "आज ऑर्डर करें",
      channelHint: "Facebook, YouTube",
    },
  ];
}

function tamilAngles(input: PlanInput): AdAngle[] {
  const p = product(input);
  const city = cityOf(input);
  return [
    {
      headline: `${city}-ல ${p} ட்ரை பண்ணியாச்சா?`,
      primaryText: `கல்லூரி / office break-க்கு easy. Price clear, taste clear. WhatsApp-ல order பண்ணுங்க.`,
      cta: "WhatsApp-ல் ஆர்டர்",
      channelHint: "Instagram Reels, WhatsApp",
    },
    {
      headline: `Friend group-க்கு ஒரு pack`,
      primaryText: `${p} share பண்ணா silence break ஆகும். ${city} students already repeat வாங்குறாங்க.`,
      cta: "இப்போ பாரு",
      channelHint: "ShareChat, Reels",
    },
    {
      headline: `Canteen-க்கு alternative`,
      primaryText: `Overpriced snacks வேணாம். ${p} nearby, fast, budget-க்கு ஒத்துப்போம்.`,
      cta: "Nearby பாரு",
      channelHint: "Facebook, Display",
    },
  ];
}

function angles(input: PlanInput, category: string): AdAngle[] {
  const l = lang(input);
  if (l.startsWith("tamil") || l.startsWith("தமிழ்")) return tamilAngles(input);
  if (l.startsWith("hindi") || l.startsWith("हिंदी")) return hindiAngles(input);
  return englishAngles(input, category);
}

function foodOutreach(input: PlanInput): OutreachScript[] {
  const p = product(input);
  const city = cityOf(input);
  const tamil = lang(input).startsWith("tamil");
  return [
    {
      channel: "WhatsApp",
      title: "Broadcast to past buyers",
      body: tamil
        ? `Hey! ${city}-ல இன்னைக்கு ${p} fresh pack ஆயிடுச்சு. Hostel/PG nearby-க்கு evening 6 மணிக்குள்ள order பண்ணுங்க — extra masala sachet free. Reply YES.`
        : `Hey! Fresh batch of ${p} in ${city} today. Order before 6pm and we add a masala sachet. Reply YES to get the menu.`,
    },
    {
      channel: "Instagram DM",
      title: "Reply to story replies",
      body: `Loved that you replied 🔥 ${p} is ₹ starter pack. Want the campus pickup point or door delivery in ${city}?`,
    },
    {
      channel: "Email",
      title: "Campus list / club newsletter",
      body: `Subject: ${city} students — a snack that does not wreck the mess bill\n\n${p} is a local pack designed for late study hours. This week: 10% off on 3+ packs. Pickup points listed below.`,
    },
    {
      channel: "Campus ambassador",
      title: "WhatsApp to class rep",
      body: `Hi, we are testing ${p} in ${city} colleges. If you can drop 20 sample packs in your wing this Thursday, you keep a stipend + referral code. 2-line reply if interested.`,
    },
    {
      channel: "Retailer",
      title: "Kirana / canteen owner",
      body: `Vanakkam, I am from ${p}. Can we keep a jar at your counter for 7 days, zero risk — unsold we take back? Students already ask for it on WhatsApp.`,
    },
    {
      channel: "Cold call",
      title: "20-second canteen pitch",
      body: `Hi, calling from ${p} in ${city}. We make a student snack that sells in the 4–7pm slot. I need 30 seconds to leave a sample. If it does not move in a week we pick it up. Okay to drop by today?`,
    },
    {
      channel: "Telegram / Discord",
      title: "College community post",
      body: `${city} folks — we are not a national chips brand. ${p} is local, spicy, cheap. First 50 comments get a pickup coupon. No app install needed.`,
    },
    {
      channel: "SMS",
      title: "Missed-call follow-up",
      body: `${p}: you pinged us. Menu + tonight's offer: <link>. Reply STOP to opt out. ${city} only.`,
    },
  ];
}

function b2bOutreach(input: PlanInput): OutreachScript[] {
  const p = product(input);
  const city = cityOf(input);
  return [
    {
      channel: "WhatsApp",
      title: "Warm lead, 2 hours after demo form",
      body: `Hi {{firstName}}, this is {{sender}} from ${p}. Got your note from the ${city} landing page. Can I send a 4-min loom of the exact workflow you mentioned, or would a 20-min slot tomorrow be easier?`,
    },
    {
      channel: "LinkedIn DM",
      title: "Connection note",
      body: `Hi {{firstName}} — I work on ${p}. Not selling in this note. We help ${city} teams replace sheet-and-Slack ops. If ops pain is real this quarter, happy to share a teardown of a lookalike account.`,
    },
    {
      channel: "Email",
      title: "Cold email 1",
      body: `Subject: ${city} team still doing {{pain}} by hand?\n\n{{firstName}},\nMost {{title}}s we talk to have the same leak: leads come in, nobody owns the next step.\n${p} makes that owner obvious.\nWorth a 20-min teardown of your current stack?\n– {{sender}}`,
    },
    {
      channel: "LinkedIn InMail",
      title: "Sponsored InMail",
      body: `{{firstName}}, skipping the generic SaaS pitch. ${p} is for Indian B2B teams that live in WhatsApp + GSTIN reality. If you own pipeline quality in ${city}, I will show one account that cut follow-up delay by half. Yes / No is a fine reply.`,
    },
    {
      channel: "Founder-to-founder",
      title: "Short email / X DM",
      body: `Building ${p}. We are not another US clone. If you are hiring SDRs in ${city} this half, I will show the playbook we use internally — no deck theatre.`,
    },
    {
      channel: "Cold call",
      title: "Gatekeeper + 25s pitch",
      body: `Hi, I am {{sender}} from ${p}. I am not asking for a meeting with everyone — only whoever owns inbound-to-demo in ${city}. I can send a 3-slide note first. Who should I mail?`,
    },
    {
      channel: "Telegram / Slack community",
      title: "Helpful post, not spam",
      body: `We open-sourced the scoring sheet we use inside ${p} (how we rank channels before spending). If useful, grab it here. Happy to walk a ${city} founder through it on Friday office hours.`,
    },
    {
      channel: "Webinar invite",
      title: "Calendar + LinkedIn",
      body: `30 min, Thursday 4pm IST: “Pipeline without a 6-lakh agency retainer”. Live walkthrough of ${p}. Seats capped at 40 so we can actually answer ${city} / India-stack questions.`,
    },
  ];
}

function genericOutreach(input: PlanInput): OutreachScript[] {
  const p = product(input);
  const city = cityOf(input);
  return [
    {
      channel: "WhatsApp",
      title: "Click-to-chat opener",
      body: `Hi, thanks for tapping ${p}. Are you in ${city}? Tell me what you need in one line and I will send price + next step.`,
    },
    {
      channel: "Instagram DM",
      title: "Story reply",
      body: `Thanks for the reply! ${p} details + this week's offer are here. Want a call or a WhatsApp catalogue?`,
    },
    {
      channel: "Email",
      title: "Nurture 1",
      body: `Subject: ${p} in ${city} — next step\n\nYou looked at ${p}. Here is a 4-bullet recap and a single CTA. Reply with your area and we route you.`,
    },
    {
      channel: "Local partner",
      title: "Tie-up text",
      body: `Hello, we are rolling out ${p} in ${city}. Open to a small co-branded push this month? I can send a one-pager.`,
    },
    {
      channel: "SMS",
      title: "Reminder",
      body: `${p}: your offer in ${city} is still live today. ${"{{link}}"}. Reply STOP to opt out.`,
    },
    {
      channel: "Cold call",
      title: "20-second intro",
      body: `Hi, calling from ${p} in ${city}. I will be brief — we help with ${input.goal}. If this is a bad time I can WhatsApp a 4-line note instead.`,
    },
    {
      channel: "Facebook comment",
      title: "Public reply",
      body: `Thanks for asking! ${p} is available in ${city}. I have DMed the price list so the thread stays clean.`,
    },
    {
      channel: "Referral ask",
      title: "After a happy customer",
      body: `Glad ${p} worked. If two friends in ${city} would want the same, forward this note — we credit both of you.`,
    },
  ];
}

export function templateCreative(
  input: PlanInput,
  mix: ChannelAllocation[],
  category: string,
  priceTier: PriceTier,
  intel?: ProductIntel
): CreativeFill {
  void priceTier;
  const explanations: Record<string, string> = {};
  for (const row of mix) {
    explanations[row.channelId] = explanationFor(row, input, category, intel);
  }
  const outreach =
    category === "food"
      ? foodOutreach(input)
      : category === "saas" || input.goal === "b2b"
        ? b2bOutreach(input)
        : genericOutreach(input);
  return {
    explanations,
    adAngles: angles(input, category).slice(0, 3),
    outreach: outreach.slice(0, 8),
  };
}
