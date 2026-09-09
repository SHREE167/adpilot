import type { PlanInput } from "./types";

export const SNACK_CHENNAI: PlanInput = {
  domain: "example-snack.local",
  product_name: "Campus Crunch masala peanuts",
  budget: 3000,
  city: "Chennai",
  audience_age: "18-24",
  audience_notes:
    "College students in Anna Nagar / Velachery hostels and PGs. Impulse snack, Tamil + English, price sensitive.",
  goal: "sales",
  language: "Tamil",
};

export const B2B_SAAS: PlanInput = {
  domain: "example-saas.local",
  product_name: "Pipeboard inbound-to-demo CRM for Indian B2B teams",
  budget: 40000,
  city: "Bengaluru",
  audience_age: "25-45",
  audience_notes:
    "Professional buyers: founders, sales heads, RevOps at 10–200 person SaaS/IT services firms. Decision makers, English.",
  goal: "b2b",
  language: "English",
};

export const SAMPLE_FIXTURES: {
  id: string;
  label: string;
  blurb: string;
  input: PlanInput;
}[] = [
  {
    id: "snack-chennai",
    label: "₹3,000 student snack · Chennai",
    blurb: "Tamil-first campus snack. Tiny budget, local chat + Reels.",
    input: SNACK_CHENNAI,
  },
  {
    id: "b2b-saas",
    label: "₹40,000 B2B SaaS · Bengaluru",
    blurb: "Professional pipeline. LinkedIn + Search can actually clear the CPC bar.",
    input: B2B_SAAS,
  },
];
