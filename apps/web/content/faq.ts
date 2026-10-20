import type { FaqItem } from "@/lib/seo";

/** Questions on the home page: what PitchPerfect is and who it is for. */
export const HOME_FAQ: readonly FaqItem[] = [
  {
    question: "Is the practice partner a real person?",
    answer:
      "No. The practice partner is an AI that plays a buyer, such as a busy operations lead or a skeptical manager. It is always labelled as AI, and if you sincerely ask whether it is human, it tells you.",
  },
  {
    question: "Do I have to use my voice?",
    answer:
      "No. You can talk or type. Voice uses your browser's own speech recognition and captions are always on. If your browser doesn't support it, or you'd rather type, text mode is one click away.",
  },
  {
    question: "What does the scorecard measure?",
    answer:
      "Seven things: clarity, value and relevance, structure, discovery questions, objection handling, confidence and language, and call to action. Each gets a score from 1 to 5 with a reason and, where there is one, a quote from what you said. The skill you practiced counts double in the overall score.",
  },
  {
    question: "Who can see my practice sessions?",
    answer:
      "Only you. When you apply to a job you can choose to share one scorecard with that employer. It stops being shared if you delete the session or withdraw the application, and transcripts are deleted automatically after 180 days.",
  },
  {
    question: "What does it cost?",
    answer:
      "Nothing. PitchPerfect has no payments or subscriptions. To keep the AI practice partner available for everyone, each student can start up to 5 practice sessions a day and 30 a month.",
  },
  {
    question: "Who can sign up?",
    answer:
      "Anyone 18 or older. Students sign up to learn, practice and apply. Employers sign up with a work email to post jobs and review applicants.",
  },
];

/** Questions on the how-it-works page: the practice session itself. */
export const PRACTICE_FAQ: readonly FaqItem[] = [
  {
    question: "How long is a practice session?",
    answer:
      "Up to 20 of your turns or 20 minutes, whichever comes first. You can end a session at any time, and it is scored on what you said.",
  },
  {
    question: "How does the partner decide what to say?",
    answer:
      "Each session starts with a scenario: a buyer with a name, a role, a personality and a few objections they keep to themselves. The conversation moves from opening to discovery, pitch, objection and close. The buyer raises objections once you have pitched, and warms up when you handle them well.",
  },
  {
    question: "Are the quotes in my scorecard real?",
    answer:
      "Yes. Every quote is checked word for word against what you said. A quote that doesn't match is removed rather than shown.",
  },
  {
    question: "Can I practice for a specific job?",
    answer:
      "Yes. From a job's page you can start a session built from that job's title, description and skills, so the buyer and their objections fit the role.",
  },
  {
    question: "What happens to my voice?",
    answer:
      "PitchPerfect never receives or stores audio. Your browser turns your speech into text, and some browsers do that by sending the audio to their maker (Google, Apple or Microsoft). Only the text reaches PitchPerfect.",
  },
  {
    question: "What if I go off topic?",
    answer:
      "The partner stays in character and steers you back to the conversation. If a session keeps going off track, it ends with a short, neutral notice.",
  },
];
