import {
  stripInvisible,
  type CoachPlanRequest,
  type ScenarioPrivate,
  type ScenarioPublic,
} from "@pitchperfect/shared";
import { failsScenarioCheck } from "./guardrails/scenario-check.js";

export interface Scenario {
  scenarioPublic: ScenarioPublic;
  scenarioPrivate: ScenarioPrivate;
}

const NAME = "Jordan Ellis";

/** A hiring manager, for introducing yourself. */
const hiringManager = (role: string | undefined): Scenario => ({
  scenarioPublic: {
    personaName: NAME,
    personaTitle: "Hiring manager",
    companyType: role
      ? `A mid-sized company hiring for the ${role} role`
      : "A mid-sized company growing its sales team",
    personality: "Friendly but probing",
    openingLine: `Hi, I’m ${NAME}${role ? `, the hiring manager for the ${role} role` : ""}. Thanks for reaching out. What did you want to talk about?`,
  },
  scenarioPrivate: {
    hiddenObjections: [
      "You don’t have much direct experience for this role yet.",
      "I’m not sure why you want this role rather than something else.",
    ],
    winConditions: [
      "The student opens with one clear point about themself.",
      "The student backs a claim with a specific result.",
    ],
  },
});

/** Someone who knows the student, for referrals and networking. */
const contact = (role: string | undefined): Scenario => ({
  scenarioPublic: {
    personaName: NAME,
    personaTitle: "A former manager who works in sales",
    companyType: role
      ? `A regional firm with people in the ${role} role`
      : "A regional business services firm",
    personality: "Warm but busy",
    openingLine: `Hey, good to hear from you. It’s Jordan.${role ? ` I heard you’re looking at the ${role} role.` : ""} What’s up?`,
  },
  scenarioPrivate: {
    hiddenObjections: [
      "I haven’t talked to that person in a while.",
      "I’m not sure I know your work well enough to vouch for you.",
    ],
    winConditions: [
      "The student names the exact person they want to meet.",
      "The student suggests a specific follow-up date.",
    ],
  },
});

/** A buyer, for every other skill. */
const buyer = (role: string | undefined): Scenario => ({
  scenarioPublic: {
    personaName: NAME,
    personaTitle: "Operations manager",
    companyType: role
      ? `A mid-sized regional business, the kind of buyer the ${role} role calls on`
      : "A mid-sized regional business",
    personality: "Busy and direct",
    openingLine: `Hi, this is ${NAME}. I have a few minutes. What can I do for you?`,
  },
  scenarioPrivate: {
    hiddenObjections: [
      "The price is higher than what we pay today.",
      "We already use a tool that mostly works.",
    ],
    winConditions: [
      "The student asks about the current process before pitching.",
      "The student proposes a specific next meeting.",
    ],
  },
});

/**
 * A fixed scenario for the skill, used when a planned one fails the scenario check. Only the
 * job's title reaches it, and only when the title passes the same check.
 */
export function safeScenario(req: CoachPlanRequest): Scenario {
  const title = req.job ? stripInvisible(req.job.title).trim() : "";
  const role = title !== "" && !failsScenarioCheck(title) ? title : undefined;
  if (req.skill === "introducing-yourself") return hiringManager(role);
  if (req.skill === "referrals-networking") return contact(role);
  return buyer(role);
}
