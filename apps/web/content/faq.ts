import { LIMITS, type PracticePartnerKind } from "@pitchperfect/shared";
import type { FaqItem } from "@/lib/seo";
import { COPY_LIMITS as L, SESSION_LENGTH, SESSION_QUOTA } from "./limits";

const sentence = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;

/** Questions on the home page: what PitchPerfect is and who it is for. */
export const HOME_FAQ: readonly FaqItem[] = [
  {
    question: "Is the practice partner a real person?",
    answer:
      "No. It’s software that plays a buyer, say a busy operations lead or a skeptical manager. Depending on how the site is set up, that’s a scripted partner or a live model from OpenAI or Anthropic; the public demo uses the scripted one. It’s labeled for what it is wherever it appears, and if you sincerely ask whether it’s human, it tells you.",
  },
  {
    question: "Do I have to talk out loud?",
    answer:
      "No, you can type. Voice uses your browser’s own speech recognition, with captions always on. If your browser can’t do speech, or you’d rather not, text mode is one click away.",
  },
  {
    question: "What does the scorecard measure?",
    answer:
      "Clarity, value and relevance, structure, discovery questions, objection handling, confidence and language, and the call to action. Each gets a score from 1 to 5, a reason, and a quote of what you said when there is one. The rubric line tied to the skill you practiced counts double in the overall score.",
  },
  {
    question: "Who can see my practice sessions?",
    answer: `Only you. When you apply to a job you can share one scorecard with that employer, and it stops being shared if you delete the session or withdraw the application. Transcripts are deleted after ${L.retentionDays} days.`,
  },
  {
    question: "What does it cost?",
    answer: `Nothing. There are no payments or subscriptions. ${SESSION_QUOTA}, which keeps the practice partner quick for everyone.`,
  },
  {
    question: "Who can sign up?",
    answer:
      "Anyone 18 or older. Students sign up to practice and apply for jobs. Employers sign up to post roles and review applicants, and an email on the company’s own domain verifies the company.",
  },
];

/** Questions on the how-it-works page: the practice session itself, for the partner that runs. */
export const practiceFaq = (partner: PracticePartnerKind): readonly FaqItem[] => [
  {
    question: "How long is a practice session?",
    answer: `${sentence(SESSION_LENGTH)} You can end it early, and it’s scored on what you said up to then.`,
  },
  {
    question: "How does the partner decide what to say?",
    answer: `Every session starts from a scenario: a buyer with a name, a job, a personality and ${String(LIMITS.hiddenObjectionsMin)} or ${String(LIMITS.hiddenObjectionsMax)} objections they keep to themselves. The call moves through opening, discovery, pitch, objection and close. Once you’ve pitched, the buyer brings up those objections, and warms up if you handle them well.`,
  },
  {
    question: "Are the quotes in my scorecard real?",
    answer:
      "Yes. Each quote is checked word for word against your transcript. If one doesn’t match, it’s dropped instead of shown.",
  },
  {
    question: "Can I practice for a specific job?",
    answer:
      "Yes. Start a session from a job’s page and the scenario is built from that job’s title, description and skills, so the buyer and their objections fit the role.",
  },
  {
    question: "What happens to my voice?",
    answer: `PitchPerfect never gets your audio. Your browser turns speech into text, and some browsers do that by sending the audio to their maker (Google, Apple or Microsoft). ${partner === "browser" ? "In this demo the text stays in your browser tab too." : "Only the text reaches us."}`,
  },
  {
    question: "What if I go off topic?",
    answer:
      "The partner stays in character and steers you back. If a session keeps going off track, it ends with a short, neutral notice.",
  },
];
