import { normalizeWords, stripInvisible } from "@pitchperfect/shared";
import { ruleCheck } from "./guard-rules.js";

const PERSONAL_DATA =
  "(?:ssn|social security(?: number)?|passwords?|passcodes?|pin(?: code| number)?|log ?ins?|credentials|bank (?:account|details|login)|(?:credit |debit )?card (?:number|details)|cvv|routing number|date of birth|birth ?date|home address|phone number|email address|driver s licen[cs]e|passport(?: number)?|national id|tax id|(?:student |employee )?id number|maiden name|(?:verification|security|one time|2fa) code)";

/**
 * What a planned scenario must never contain, matched on normalized words. Employer job text can
 * steer the planner, so these are the things a job post could try to make the persona do.
 */
const SCENARIO_POLICY: readonly RegExp[] = [
  // Asking the student for personal data, credentials or ID numbers.
  new RegExp(`\\b(?:your|their|the student s|students|his|her) (?:\\w+ ){0,2}?${PERSONAL_DATA}\\b`),
  new RegExp(
    `\\b(?:ask|asks|asking|request|requests|requesting|collect|collects|demand|demands) (?:the student |the caller |you |them )?(?:for |to (?:give|share|send|provide|read|confirm) )?(?:\\w+ ){0,2}?${PERSONAL_DATA}\\b`,
  ),
  // Promises or claims about scores.
  /\brubric\b/,
  /\b(?:perfect|full|top|maximum|highest|guaranteed|automatic|bonus|extra) (?:score|scores|marks|grade|grades|rating)\b/,
  /\b(?:you|they|student|students|everyone|everybody)(?: \w+){0,3}? (?:scored|score|scores|get|gets|got|earn|earns|earned|receive|receives) (?:\w+ ){0,2}?(?:perfect|100|full marks|top marks|a hundred|five out of five|5 out of 5)\b/,
  /\b(?:your|their|the student s|his|her) (?:practice )?(?:score|scores|scorecard|grade|grades|rating|ratings)\b/,
  // Ignoring the rules, revealing the prompt, or breaking the persona.
  /\b(?:ignore|ignores|disregard|disregards|forget|forgets|bypass|bypasses|override|overrides) (?:\w+ ){0,3}?(?:rules|instructions|guidelines|prompt)\b/,
  /\b(?:reveal|reveals|share|shares|explain|explains|read|reads|list|lists|tell|tells|recite|recites|repeat|repeats)(?: out)? (?:\w+ ){0,3}?(?:hidden objections|win conditions|instructions|system prompt|prompt|stage tags)\b/,
  /\b(?:break|breaks|breaking|drop|drops|leave|leaves|step|steps|stepping) (?:out of )?(?:the |its |their |her |his )?(?:character|persona)\b/,
];

// Matched on the raw text, since normalizeWords() drops the dots and slashes: urls, bare domains,
// markdown links and email addresses.
const LINK =
  /\bhttps?:\/\/|\bwww\.|\b[a-z0-9-]+\.(?:com|net|org|io|ai|co|app|dev|xyz|info|biz|example|test|ly|me|gg|link|site|online)\b|\[[^\]]*\]\([^)]*\)|[\w.+-]+@[\w-]+\.\w/i;

/**
 * True when a piece of scenario text reads like an attack or harmful text (`ruleCheck`), or breaks
 * the scenario policy: no asking for personal data, credentials or IDs, no claims about scores, no
 * instructions to ignore the rules, reveal the prompt or break the persona, and no links.
 */
export function failsScenarioCheck(text: string): boolean {
  const words = normalizeWords(text);
  return (
    ruleCheck(text) !== null ||
    SCENARIO_POLICY.some((pattern) => pattern.test(words)) ||
    LINK.test(stripInvisible(text))
  );
}
