import type {
  AdAngle,
  ChannelAllocation,
  OutreachScript,
  PlanInput,
  PriceTier,
  ProductIntel,
} from "./types";

/**
 * Template copy (no LLM key). English only. No invented numbers, discounts or
 * results: anything the owner must decide is a {{placeholder}}, and the only
 * numbers allowed come from the plan (e.g. the audience age the user typed).
 */
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

/** The form language describes the audience, never the output language. */
function speakers(input: PlanInput): string | null {
  const l = (input.language || "").trim();
  return l && !/^english$/i.test(l) ? `${l}-speaking` : null;
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
  const regional = speakers(input);
  const map: Record<string, string> = {
    google_search: `Capture people in ${city} already looking for ${p} or a close substitute. Search is the high-intent slice of a ${category} plan.`,
    google_display: `Cheap reminder ads around ${city} browsing. Use Display to stay visible after someone hits your site or a competitor.`,
    youtube: `Short video of ${p} in a real ${city} setting. A strong first-second hook beats a polished brand film on this budget.`,
    instagram_reels: `Reels is where ${city} buyers aged ${input.audience_age} linger. Shoot ${p} in-hand, with local audio, and a WhatsApp sticker.`,
    instagram_feed: `Feed carousels for proof: price, product shots, reviews. Retarget Reel viewers who did not tap through.`,
    facebook: `Still the neighbourhood graph in ${city} for parents and older buyers. Boost a simple offer + map pin.`,
    whatsapp: `Click-to-chat is the conversion event. Run Click-to-WhatsApp from ads and a status/broadcast for repeat buyers of ${p}.`,
    sharechat: `Regional short video puts ${p} in front of ${regional ? `${regional} ` : ""}buyers at a low CPM, useful when Instagram saturates.`,
    linkedin: `Sponsored content and InMail to job titles that buy ${p}. Tight audience, high CPC, so we only use it when the ticket supports it.`,
    telegram: `Pin a launch note in relevant ${city} / industry groups. Treat Telegram as community, not a performance buy.`,
    reddit: `Promote in subs where people already argue about tools like ${p}. Native tone; no banner-speak.`,
    x: `Founder-led posts and a light promote around launch hours. Good for tech chatter, weak for local impulse.`,
  };
  const base =
    map[row.channelId] ??
    `Allocated because the model score (${row.score}) cleared the cutoff for this brief.`;
  return `${base}${extra}`;
}

function angles(input: PlanInput, category: string): AdAngle[] {
  const p = product(input);
  const city = cityOf(input);
  if (category === "food") {
    return [
      {
        headline: `${p}, made in ${city}`,
        primaryText: `A local snack break in ${city}. ${p} is the pocket-friendly pick your friends will steal. Order on WhatsApp; we pack it fresh.`,
        cta: "Order on WhatsApp",
        channelHint: "Instagram Reels, WhatsApp",
      },
      {
        headline: `${p}, picked up nearby`,
        primaryText: `No grand launch. Just ${p}, made for people in ${city} who are done with overpriced canteen food.`,
        cta: "Find us nearby",
        channelHint: "Facebook, Google Display",
      },
      {
        headline: `The group-chat snack`,
        primaryText: `When the group chat goes quiet, drop ${p}. Share the pack, split it, win the evening.`,
        cta: "Send this to your group",
        channelHint: "ShareChat, WhatsApp",
      },
    ];
  }
  if (category === "saas" || input.goal === "b2b") {
    return [
      {
        headline: `${p}: one owner for every lead`,
        primaryText: `Teams in ${city} still stitch this together with sheets and Slack. ${p} gives you one workflow, one owner, one weekly number.`,
        cta: "Book a demo",
        channelHint: "LinkedIn, Google Search",
      },
      {
        headline: `Stop losing the same lead twice`,
        primaryText: `If your CRM is a graveyard, ${p} is the follow-up system your team will actually use.`,
        cta: "See a live pipeline",
        channelHint: "LinkedIn, Reddit",
      },
      {
        headline: `Built for Indian B2B reality`,
        primaryText: `GST, WhatsApp threads, multi-GSTIN chaos. ${p} was built for how Indian teams actually work.`,
        cta: "Start a trial",
        channelHint: "Google Search, X",
      },
    ];
  }
  return [
    {
      headline: `${p} for people in ${city}`,
      primaryText: `A straightforward offer for buyers aged ${input.audience_age}. See why locals pick ${p}.`,
      cta: "Learn more",
      channelHint: "Instagram, Google",
    },
    {
      headline: `Try ${p} this week`,
      primaryText: `Clear price, clear next step, no mystery funnel. Message us and we reply with the details.`,
      cta: "Get started",
      channelHint: "WhatsApp, Feed",
    },
    {
      headline: `What ${city} is switching to`,
      primaryText: `Social proof first, then the offer: show a real customer from ${city} using ${p}.`,
      cta: "Talk to us",
      channelHint: "Facebook, YouTube",
    },
  ];
}

function foodOutreach(input: PlanInput): OutreachScript[] {
  const p = product(input);
  const city = cityOf(input);
  return [
    {
      channel: "WhatsApp",
      title: "Broadcast to past buyers",
      body: `Hi! A fresh batch of ${p} is ready in ${city} today. {{offer}}. Reply YES to get the menu.`,
    },
    {
      channel: "Instagram DM",
      title: "Reply to story replies",
      body: `Thanks for the reply! ${p} is {{price}}. Want the pickup point or delivery in ${city}?`,
    },
    {
      channel: "Email",
      title: "Campus list / club newsletter",
      body: `Subject: ${city}: a local snack for late study hours\n\n${p} is a local pack made for late study hours. {{offer}}. Pickup points listed below.`,
    },
    {
      channel: "Campus ambassador",
      title: "WhatsApp to class rep",
      body: `Hi, we are testing ${p} in ${city} colleges. Could you share sample packs in your class this week? You get a referral code for your friends. Reply if interested.`,
    },
    {
      channel: "Retailer",
      title: "Kirana / canteen owner",
      body: `Hello, I am from ${p}. Can we keep a jar at your counter for a week, zero risk? Anything unsold we take back.`,
    },
    {
      channel: "Cold call",
      title: "Short canteen pitch",
      body: `Hi, calling from ${p} in ${city}. We make a local snack for the evening rush. Can I drop off a sample? If it does not move, we pick it up. Okay to come by today?`,
    },
    {
      channel: "Telegram / Discord",
      title: "College community post",
      body: `${city} folks: we are a local snack, not a national chips brand. ${p} is made here. {{offer}} for this group. No app install needed.`,
    },
    {
      channel: "SMS",
      title: "Missed-call follow-up",
      body: `${p}: you called us. Menu and today's offer: {{link}}. Reply STOP to opt out.`,
    },
  ];
}

function b2bOutreach(input: PlanInput): OutreachScript[] {
  const p = product(input);
  const city = cityOf(input);
  return [
    {
      channel: "WhatsApp",
      title: "Warm lead, same day as the demo form",
      body: `Hi {{firstName}}, this is {{sender}} from ${p}. Got your note from the ${city} landing page. Can I send a short video of the exact workflow you mentioned, or would a call tomorrow be easier?`,
    },
    {
      channel: "LinkedIn DM",
      title: "Connection note",
      body: `Hi {{firstName}}, I work on ${p}. Not selling in this note. We help ${city} teams replace sheet-and-Slack ops. If that pain is real this quarter, happy to share a teardown of a similar account.`,
    },
    {
      channel: "Email",
      title: "Cold email",
      body: `Subject: ${city} team still doing {{pain}} by hand?\n\n{{firstName}},\nMost {{title}}s we talk to have the same leak: leads come in, nobody owns the next step.\n${p} makes that owner obvious.\nWorth a short teardown of your current stack?\n– {{sender}}`,
    },
    {
      channel: "LinkedIn InMail",
      title: "Sponsored InMail",
      body: `{{firstName}}, skipping the generic SaaS pitch. ${p} is for Indian B2B teams that live in WhatsApp + GSTIN reality. If you own pipeline quality in ${city}, I can walk you through how a team like yours uses it. Yes / No is a fine reply.`,
    },
    {
      channel: "Founder-to-founder",
      title: "Short email / X DM",
      body: `Building ${p} for Indian teams. If you are hiring SDRs in ${city} this half, I will show the playbook we use internally. No deck theatre.`,
    },
    {
      channel: "Cold call",
      title: "Gatekeeper + short pitch",
      body: `Hi, I am {{sender}} from ${p}. I only need whoever owns inbound-to-demo in ${city}. I can send a short note first. Who should I mail?`,
    },
    {
      channel: "Telegram / Slack community",
      title: "Helpful post, not spam",
      body: `Sharing the checklist we use inside ${p} to rank channels before spending. If useful, grab it here. Happy to walk a ${city} founder through it during office hours.`,
    },
    {
      channel: "Webinar invite",
      title: "Calendar + LinkedIn",
      body: `{{date}}, {{time}} IST: "Pipeline without an expensive agency retainer". Live walkthrough of ${p}, with time for ${city} / India-stack questions.`,
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
      body: `Hi, thanks for tapping ${p}. Are you in ${city}? Tell me what you need in one line and I will send the price and next step.`,
    },
    {
      channel: "Instagram DM",
      title: "Story reply",
      body: `Thanks for the reply! ${p} details and {{offer}} are here. Want a call or a WhatsApp catalogue?`,
    },
    {
      channel: "Email",
      title: "Follow-up email",
      body: `Subject: ${p} in ${city}: next step\n\nYou looked at ${p}. Here is a short recap and one clear next step. Reply with your area and we route you.`,
    },
    {
      channel: "Local partner",
      title: "Tie-up text",
      body: `Hello, we are rolling out ${p} in ${city}. Open to a small co-branded push this month? I can send a one-pager.`,
    },
    {
      channel: "SMS",
      title: "Reminder",
      body: `${p}: {{offer}} in ${city} is still live today. {{link}}. Reply STOP to opt out.`,
    },
    {
      channel: "Cold call",
      title: "Short intro",
      body: `Hi, calling from ${p} in ${city}. I will be brief. If this is a bad time I can send a short WhatsApp note instead.`,
    },
    {
      channel: "Facebook comment",
      title: "Public reply",
      body: `Thanks for asking! ${p} is available in ${city}. I have sent the price list by DM so the thread stays clean.`,
    },
    {
      channel: "Referral ask",
      title: "After a happy customer",
      body: `Glad ${p} worked for you. If friends in ${city} would want the same, forward this note and we will thank you both with {{reward}}.`,
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
