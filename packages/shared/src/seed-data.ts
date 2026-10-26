import type { EmploymentType, JobStatus, Workplace } from "./enums.js";
import type { JobPay } from "./schemas/jobs.js";
import { slugify } from "./text.js";

/**
 * Fictional demo content, shared by the api's seed script and the static demo's job board. Every
 * company lives on a reserved `.example` domain, so no address here can ever reach a real inbox
 * or website.
 */

export interface SeedCompany {
  name: string;
  /** Hostname without scheme; the website and the employer's email domain both come from it. */
  host: string;
  pitch: string;
  verification: "verified" | "unverified";
  employer: { first: string; last: string; jobTitle: string };
}

export const SEED_COMPANIES: readonly SeedCompany[] = [
  {
    name: "Zentrova Analytics",
    host: "zentrova-analytics.example",
    pitch:
      "Dashboards for operations teams that still build their weekly numbers by hand from five spreadsheets.",
    verification: "verified",
    employer: { first: "Devon", last: "Marsh", jobTitle: "Head of talent" },
  },
  {
    name: "Halvane Health Cloud",
    host: "halvane-health-cloud.example",
    pitch:
      "Scheduling and billing software for independent clinics with one to ten providers, so the front desk spends less of the day on paperwork.",
    verification: "verified",
    employer: { first: "Avery", last: "Lindqvist", jobTitle: "Recruiting lead" },
  },
  {
    name: "Cedarloom Realty Tech",
    host: "cedarloom-realty.example",
    pitch: "Listing, lead-routing, and showing tools for independent real estate brokerages.",
    verification: "verified",
    employer: { first: "Jules", last: "Okonkwo", jobTitle: "Sales manager" },
  },
  {
    name: "Orvexa Payments",
    host: "orvexa-payments.example",
    pitch:
      "Card and invoice payments for freelancers and very small shops, paid out the next business day.",
    verification: "unverified",
    employer: { first: "Sasha", last: "Brandt", jobTitle: "Founder" },
  },
  {
    name: "Lumivale Learning Systems",
    host: "lumivale-learning.example",
    pitch:
      "A course builder and completion tracker for company training teams of two to twenty people.",
    verification: "verified",
    employer: { first: "Quinn", last: "Abara", jobTitle: "People operations manager" },
  },
  {
    name: "Quarrow Logistics Software",
    host: "quarrow-logistics.example",
    pitch: "Route planning and proof-of-delivery software for regional freight carriers.",
    verification: "verified",
    employer: { first: "Rowan", last: "Castellano", jobTitle: "Director of sales" },
  },
];

export interface SeedJob {
  /** Index into `SEED_COMPANIES`. */
  company: number;
  title: string;
  location: string;
  workplace: Workplace;
  employmentType: EmploymentType;
  /** Simple HTML (p, ul, li, strong); the seeder runs it through the job sanitizer. */
  descriptionHtml: string;
  skills: string[];
  pay: JobPay;
  status: JobStatus;
}

/** A company's slug: the first label of its host, so "zentrova-analytics.example" is "zentrova-analytics". */
export const seedCompanySlug = (company: SeedCompany): string =>
  company.host.split(".")[0] ?? company.host;

/**
 * A job's slug: its title, then its company's slug, the way a job board names a listing
 * ("sales-development-representative-zentrova-analytics"). A company never lists two jobs under
 * one title, so the slug is unique, and the api seed and the static demo agree on it.
 */
export const seedJobSlug = (job: Pick<SeedJob, "title">, company: SeedCompany): string =>
  slugify(job.title, seedCompanySlug(company));

/** Intro, a bulleted list of duties, and a closing line, as simple allowed HTML. */
export function description(intro: string, duties: readonly string[], closing: string): string {
  const items = duties.map((duty) => `<li>${duty}</li>`).join("");
  return `<p>${intro}</p><p><strong>What you will do</strong></p><ul>${items}</ul><p>${closing}</p>`;
}

export const hourly = (min: number, max: number): JobPay => ({
  type: "range",
  min,
  max,
  currency: "USD",
  frequency: "hourly",
  commission: false,
});

export const salary = (min: number, max: number, commission: boolean): JobPay => ({
  type: "range",
  min,
  max,
  currency: "USD",
  frequency: "annually",
  commission,
});

export const SEED_JOBS: readonly SeedJob[] = [
  {
    company: 0,
    title: "Sales development representative",
    location: "Boston, MA",
    workplace: "hybrid",
    employmentType: "full_time",
    descriptionHtml: description(
      "Start conversations with operations leaders who lose hours each week to manual reporting.",
      [
        "Research accounts and write short, personal outreach",
        "Run first calls and book demos for our account executives",
        "Keep every conversation logged so the team can follow up",
        "Sit in on the Friday pipeline review and say what you heard that week",
      ],
      "No sales experience needed. You get a two-week ramp, a weekly call review with your manager, and then a target of ten qualified meetings a month.",
    ),
    skills: ["Cold outreach", "Discovery questions", "CRM basics"],
    pay: salary(52_000, 60_000, true),
    status: "active",
  },
  {
    company: 0,
    title: "Account executive intern",
    location: "Boston, MA",
    workplace: "hybrid",
    employmentType: "internship",
    descriptionHtml: description(
      "Shadow our account executives for a semester and run your own small pipeline.",
      [
        "Join discovery and demo calls and write the follow-up notes",
        "Prepare short account briefs before big meetings",
        "Pitch one real prospect by the end of the term",
      ],
      "A good fit for juniors and seniors who want to see a full sales cycle up close.",
    ),
    skills: ["Pitching", "Note taking", "Account research"],
    pay: hourly(18, 22),
    status: "active",
  },
  {
    company: 1,
    title: "Business development representative",
    location: "Austin, TX",
    workplace: "remote",
    employmentType: "full_time",
    descriptionHtml: description(
      "Help small clinics discover how much time their front desk could get back.",
      [
        "Reach out to clinic owners and practice managers",
        "Qualify interest and set up product walkthroughs",
        "Tell us which objections keep coming up",
      ],
      "There are four of us in sales, and the bell on the wall gets rung for every booked meeting.",
    ),
    skills: ["Outbound calling", "Listening", "Objection handling"],
    pay: salary(50_000, 58_000, true),
    status: "active",
  },
  {
    company: 1,
    title: "Customer success associate",
    location: "Austin, TX",
    workplace: "remote",
    employmentType: "full_time",
    descriptionHtml: description(
      "Be the first friendly voice new clinics hear after they sign up.",
      [
        "Run setup calls with each new clinic's front desk and office manager",
        "Check usage at 30 and 60 days and call the clinics that have stalled",
        "Write up the questions that keep coming up so the help center can answer them",
      ],
      "You will look after about forty new clinics a quarter. Good for someone who likes teaching and solving problems one customer at a time.",
    ),
    skills: ["Onboarding", "Empathy", "Clear writing"],
    pay: salary(48_000, 56_000, false),
    status: "active",
  },
  {
    company: 1,
    title: "Sales operations intern",
    location: "Austin, TX",
    workplace: "remote",
    employmentType: "internship",
    descriptionHtml: description(
      "Keep our sales data tidy and help the team see what is working.",
      [
        "Clean up lead lists and fix duplicate records",
        "Build simple weekly reports in a spreadsheet",
        "Suggest small changes that save the team time",
      ],
      "Drafted for next term; applications open soon.",
    ),
    skills: ["Spreadsheets", "Attention to detail", "Reporting"],
    pay: hourly(17, 20),
    status: "draft",
  },
  {
    company: 2,
    title: "Sales development representative",
    location: "Denver, CO",
    workplace: "onsite",
    employmentType: "full_time",
    descriptionHtml: description(
      "Introduce independent brokerages to tools that route leads to the right agent.",
      [
        "Call broker owners and office managers",
        "Explain our lead routing in plain language",
        "Hand warm leads to the senior sales team",
      ],
      "You will sit with the sales team in our Denver office and learn from the people next to you.",
    ),
    skills: ["Outbound calling", "Rapport building", "Resilience"],
    pay: salary(48_000, 55_000, true),
    status: "active",
  },
  {
    company: 2,
    title: "Account executive intern",
    location: "Denver, CO",
    workplace: "hybrid",
    employmentType: "internship",
    descriptionHtml: description(
      "Learn how a brokerage software deal moves from first call to signed order.",
      [
        "Sit in on demos and take clear notes",
        "Draft follow-up emails for your manager to review",
        "Present one short pitch to the team at the end of the term",
      ],
      "Open to students in any major who like talking to people.",
    ),
    skills: ["Pitching", "Follow-up", "Presenting"],
    pay: hourly(18, 21),
    status: "active",
  },
  {
    company: 3,
    title: "Business development representative",
    location: "Remote, US",
    workplace: "remote",
    employmentType: "full_time",
    descriptionHtml: description(
      "Tell freelancers and shop owners how they can get paid faster.",
      [
        "Reach out to small business owners by phone and email",
        "Answer basic questions about fees and setup",
        "Book calls for our founder to close",
      ],
      "We are a very small team, so you will have a say in how we sell.",
    ),
    skills: ["Outbound calling", "Plain language", "Self-direction"],
    pay: salary(44_000, 52_000, true),
    status: "active",
  },
  {
    company: 3,
    title: "Customer success intern",
    location: "Remote, US",
    workplace: "remote",
    employmentType: "internship",
    descriptionHtml: description(
      "Help early customers get their first payment working.",
      [
        "Answer customer questions in chat and email",
        "Write short help articles from the questions you see",
        "Tell the team what confuses people",
      ],
      "A flexible, part-of-the-week commitment with a stipend.",
    ),
    skills: ["Support writing", "Patience", "Curiosity"],
    pay: { type: "exact", amount: 1_200, currency: "USD", frequency: "monthly", commission: false },
    status: "active",
  },
  {
    company: 4,
    title: "Sales operations analyst",
    location: "Chicago, IL",
    workplace: "hybrid",
    employmentType: "full_time",
    descriptionHtml: description(
      "Make our sales team faster by keeping the data and the process in order.",
      [
        "Maintain territories, quotas, and lead assignment rules",
        "Build reports the sales managers use every Monday",
        "Find and fix gaps between marketing and sales handoffs",
        "Sit with a new rep for their first week and watch where the process trips them up",
      ],
      "You like spreadsheets, and you like helping people see what the numbers mean.",
    ),
    skills: ["Spreadsheets", "Reporting", "Process design"],
    pay: salary(58_000, 68_000, false),
    status: "active",
  },
  {
    company: 4,
    title: "Sales development representative",
    location: "Remote, US",
    workplace: "remote",
    employmentType: "part_time",
    descriptionHtml: description(
      "Reach training managers who need a simpler way to build short courses.",
      [
        "Send personal outreach to learning and development leads",
        "Hold short discovery calls",
        "Book demos with our account executives",
      ],
      "Around twenty hours a week, with hours you can shape around classes.",
    ),
    skills: ["Cold outreach", "Time management", "Discovery questions"],
    pay: { type: "exact", amount: 22, currency: "USD", frequency: "hourly", commission: true },
    status: "active",
  },
  {
    company: 4,
    title: "Customer success manager",
    location: "Chicago, IL",
    workplace: "hybrid",
    employmentType: "full_time",
    descriptionHtml: description(
      "Look after a group of training teams and help them finish the courses they start.",
      [
        "Run onboarding and quarterly reviews",
        "Spot risks early and plan a fix with the customer",
        "Work with sales on renewals",
      ],
      "This role has been filled and is no longer open.",
    ),
    skills: ["Account management", "Renewals", "Presenting"],
    pay: salary(65_000, 75_000, false),
    status: "archived",
  },
  {
    company: 5,
    title: "Business development representative",
    location: "Baltimore, MD",
    workplace: "onsite",
    employmentType: "full_time",
    descriptionHtml: description(
      "Open doors at regional freight carriers that still plan routes by hand.",
      [
        "Call dispatch managers and fleet owners",
        "Listen for the problems that cost them time on the road",
        "Book site visits with our senior sales team",
      ],
      "Most of the team drove trucks or ran dispatch before they sold software, so they will teach you the trade.",
    ),
    skills: ["Outbound calling", "Listening", "Persistence"],
    pay: salary(50_000, 60_000, true),
    status: "active",
  },
  {
    company: 5,
    title: "Inside sales representative",
    location: "Baltimore, MD",
    workplace: "hybrid",
    employmentType: "contract",
    descriptionHtml: description(
      "Help us follow up with carriers who tried our route planner and went quiet.",
      ["Call trial users and ask what got in the way", "Report patterns so we can fix the product"],
      "A six-month contract with a clear path to full-time for strong performers.",
    ),
    skills: ["Follow-up", "Discovery questions", "Resilience"],
    pay: hourly(24, 28),
    status: "active",
  },
];
