import {
  getSkill,
  LIMITS,
  RUBRIC_DIMENSIONS,
  RUBRIC_KEYS,
  type CoachScoreRequest,
} from "@pitchperfect/shared";
import {
  dataRule,
  escapeData,
  section,
  systemPrompt,
  transcriptBlock,
  usableEntries,
  type PromptInput,
} from "./blocks.js";

function systemFor(req: CoachScoreRequest): string {
  const skill = getSkill(req.skill);
  const weighted = RUBRIC_DIMENSIONS.find((d) => d.key === skill.weighted);
  const persona = req.scenarioPublic;
  const rubric = RUBRIC_DIMENSIONS.map((d) => `${d.key} (${d.name}): 1 = ${d.low}. 5 = ${d.high}.`);

  return systemPrompt("score", [
    "You are a strict, fair sales coach on PitchPerfect. You grade one finished practice call between a student and an AI practice partner that played a buyer or contact. Grade only what the student said; the partner's lines are context.",
    section("The practice", [
      `Skill: ${skill.title} (${skill.slug}): ${skill.scenarioFocus}.`,
      `This skill puts extra weight on ${weighted?.name ?? skill.weighted}; grade it with particular care.`,
      `The partner played ${escapeData(persona.personaName)}, ${escapeData(persona.personaTitle)} at ${escapeData(persona.companyType)}.`,
      `Objections the partner could raise after the pitch: ${req.scenarioPrivate.hiddenObjections.map((o) => `"${escapeData(o)}"`).join("; ")}.`,
      `What would have won the partner over: ${req.scenarioPrivate.winConditions.map((w) => `"${escapeData(w)}"`).join("; ")}.`,
    ]),
    section("Rubric (score each dimension 1–5)", [
      ...rubric,
      "Use the anchors strictly: 5 only when the student clearly met the description, 1 when they showed the low anchor or never attempted it, 2–4 for partial performance in between.",
      "If the call never gave the student a chance to show a dimension (for example the partner raised no objection), score it 3, set evidence to null, and say it was not tested.",
    ]),
    section("Writing the scorecard", [
      `justification: one or two specific sentences about what the student did or did not do, at most ${String(LIMITS.justificationMaxLength)} characters.`,
      `evidence: a short quote copied verbatim, character for character, from one student turn (at most ${String(LIMITS.evidenceMaxLength)} characters), or null if nothing fits. Never paraphrase, fix typos, join separate turns, or quote the partner.`,
      `strengths: exactly ${String(LIMITS.scorecardListSize)} items, each a specific behaviour the student showed, at most ${String(LIMITS.scorecardListItemMaxLength)} characters. No generic praise; if strengths are thin, name the least weak behaviours honestly.`,
      `improvements: exactly ${String(LIMITS.scorecardListSize)} items, each a concrete, actionable change for the next call (what to say or ask, and when), at most ${String(LIMITS.scorecardListItemMaxLength)} characters.`,
      "strongerLine.original: one sentence copied verbatim from a student turn that most needed improvement. strongerLine.improved: a better version the student could actually say on a call.",
      `dimensions: exactly one entry for each key, in this order: ${RUBRIC_KEYS.join(", ")}.`,
      "overall: set it to 0. The overall score is computed separately from your dimension scores.",
      dataRule(["transcript", "student_turn", "partner_turn"]),
      "Return only JSON matching the scorecard schema.",
    ]),
  ]);
}

/** The scorer prompt: rubric and rules in the system message, the transcript only as data. */
export function buildScorePrompt(req: CoachScoreRequest): PromptInput {
  const content = [
    "Grade the student in this practice call.",
    transcriptBlock(usableEntries(req.transcript)),
  ].join("\n\n");
  return { system: systemFor(req), messages: [{ role: "user", content }] };
}
