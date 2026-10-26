import { describe, expect, it } from "vitest";
import { ATTACK_LINES, BENIGN_LINES } from "./guard-corpus.fixtures.js";
import { maySignalSelfHarm, signalsSelfHarm } from "@pitchperfect/shared";

/** A student saying they might hurt themselves: each one gets the support message. */
const SIGNALS: readonly string[] = [
  "I want to kill myself",
  "honestly I want to kill myself",
  "how can I kill myself",
  "Sorry, I can't focus. I've been thinking about killing myself.",
  "I want to end my life",
  "I'm going to take my own life",
  "I've been thinking about suicide a lot this week",
  "I feel suicidal",
  "Thinking of committing suicide after this call",
  "I don't want to live anymore",
  "I dont want to be alive",
  "There's no reason to live",
  "I have nothing left to live for",
  "Everyone would be better off without me",
  "I'd be better off dead",
  "I wish I were dead",
  "I just want to die",
  "I wanna die",
  "I want to end it all",
  "I've been cutting myself again",
  "I keep hurting myself on purpose",
  "I want to hurt myself",
  "I'm going to take all my pills tonight",
  "I've been self-harming again",
  "k1ll mys3lf",
  "I might hang myself",
  "I want to shoot myself",
  // A method or being ready.
  "I have the pills ready and I'm done with life",
  "I've been saving up my sleeping pills",
  "I swallowed a bottle of pills last night",
  "I've got the rope ready",
  "I tied a noose this morning",
  "I'm going to jump off the bridge tonight",
  "Thinking about throwing myself in front of a train",
  "I already wrote my suicide note",
  "I'm done with life",
  "Honestly I'm done living",
  "I'm so tired of living",
  // Abbreviations.
  "kms",
  "honestly kms",
  "imma kms after this call",
  "ugh i should kys",
  "I'm gonna kys",
  "thinking about sewer slide",
  // Hopelessness and being a burden.
  "There's no point in living",
  "no point living anymore",
  "What's the point of living?",
  "Nobody would care if I was gone",
  "No one would even notice if I died",
  "Nobody would care if I disappeared",
  "My family would be better off without me",
  "I'm just a burden to everyone",
  "I don't deserve to live",
  "I wish I'd never been born",
  "I've given up on life",
  // Spanish.
  "Quiero morirme",
  "Me voy a matar",
  "Ya no quiero vivir",
  "Estoy pensando en suicidarme",
  "Quiero quitarme la vida",
  "Todos estarían mejor sin mí",
  // Hindi, in Latin and in Devanagari script.
  "Main marna chahta hoon",
  "Mujhe marna hai",
  "Ab jeene ka mann nahi karta",
  "Main jeena nahi chahti",
  "Main suicide kar lunga",
  "Khudkushi karne ka mann karta hai",
  "Apni jaan le lunga",
  "मैं मरना चाहता हूँ",
  "आत्महत्या के बारे में सोच रहा हूँ",
  // French.
  "Je veux mourir",
  "Je vais me suicider",
  "Je ne veux plus vivre",
  "J'ai envie d'en finir avec la vie",
  "Je pense à mettre fin à mes jours",
  // Portuguese.
  "Quero morrer",
  "Vou me matar",
  "Não quero mais viver",
  "Penso em tirar minha própria vida",
  // German.
  "Ich will sterben",
  "Ich will nicht mehr leben",
  "Ich bringe mich um",
  "Ich denke an Selbstmord",
  "Ich möchte mir das Leben nehmen",
  // Italian.
  "Voglio morire",
  "Voglio togliermi la vita",
];

/** Sales-call hyperbole and ordinary talk that only sounds like it. */
const ORDINARY: readonly string[] = [
  "This deal is killing me.",
  "I'd die for that discount.",
  "You're killing me with these prices.",
  "We're killing it this quarter.",
  "I'm dying to see the demo.",
  "I'm dead tired after the trade show.",
  "That price would be career suicide for me.",
  "Cutting the price that far is commercial suicide.",
  "I hurt myself skiing last month, so I'm on crutches.",
  "I cut myself shaving this morning, sorry about the plaster.",
  "Our app flags self-harm content for school counselors.",
  "I could die laughing at that pitch deck.",
  "I'm going to die of embarrassment if the demo crashes.",
  "This commute will be the death of me.",
  "We want to kill the manual spreadsheet process.",
  "Let's end it here and pick up on Thursday.",
  "I'm going to end the call now and send a summary.",
  "My old manager would kill me if I missed quota.",
  "Our crisis line software routes calls to counselors.",
  "The pilot will take on a life of its own once your team sees it.",
  "Kill two birds with one stone: one tool for routing and billing.",
  "I want to make sure this doesn't die in procurement.",
  "Your team won't want to live without it after a week.",
  "I'd kill for a budget like yours.",
  "Let me shoot myself an email reminder about the follow-up.",
  "I'll shoot myself a note to send the deck.",
  "I'll shoot myself a reminder for Thursday.",
  "I'll shoot myself a calendar invite so I don't forget.",
  "I shot myself in the foot with that discount.",
  "I'd drown myself in paperwork without this tool.",
  "I'm dying to know what your team thinks.",
  "That would be career suicide for any buyer.",
  "This deal is killing me, can we split the difference?",
  // Distances, products and plans that share words with the abbreviations and methods.
  "We've added 400 kms of new routes this month.",
  "The depot is 12 kms from the port.",
  "How many kms do your trucks cover each day?",
  "Kms per driver dropped 8 percent after the pilot.",
  "Our pharmacy has the pills ready for pickup by noon.",
  "The tablets are ready to ship on Monday.",
  "We sell rope and rigging to the bridge crews.",
  "Our rope is ready to ship from the warehouse.",
  "We inspect every bridge on the route twice a year.",
  "I'm done with the old vendor, honestly.",
  "I'm done living out of a suitcase for trade shows.",
  "I'm tired of living with spreadsheets.",
  "There's no point in living with a manual process when the fix is this cheap.",
  "Nobody would care if I was gone for a week; my team covers the calls.",
  "What's the point of life insurance if the claims take a year?",
  "I'm done with my life insurance provider.",
  "Your team will feel like a burden is lifted.",
  // Hyperbole in the other languages.
  "Me muero por ver la demo.",
  "Este precio me va a matar.",
  "Quiero morir de risa con ese video.",
  "Ce prix va me tuer.",
  "Je vais en finir avec ce dossier demain.",
  "Esse preço vai me matar.",
  "Quero morrer de rir com isso.",
  "Der Preis bringt mich um.",
  "Mein Chef wird mich umbringen, wenn das schiefgeht.",
  "Das wäre kommerzieller Selbstmord.",
  "Is project ke liye main jaan de dunga.",
];

/**
 * Lines that may or may not mean self-harm. The scripted partner, with no model to read them,
 * checks in gently instead of replying; they are never scored.
 */
const UNCLEAR: readonly string[] = [
  "I can't do this anymore",
  "I just want to disappear",
  "What's the point of anything anymore",
  "Nothing matters anymore",
  "I feel so hopeless",
  "I feel like a burden",
  "I might hurt myself",
  "I won't be around much longer",
  "I want it all to stop",
  "I hate my life",
  "Nobody would miss me",
];

/** Unclear-sounding sales talk that stays ordinary. */
const ORDINARY_TOO: readonly string[] = [
  "I can't do Thursdays anymore, can we try Friday?",
  "We can't do this price anymore.",
  "I want to disappear for a week after the trade show.",
  "I won't be around tomorrow, I'm at a conference.",
  "I want this to end on a good note for both teams.",
  "Our product makes the hopeless backlog manageable.",
];

describe("signalsSelfHarm", () => {
  it.each(SIGNALS)("hears %j", (text) => {
    expect(signalsSelfHarm(text)).toBe(true);
  });

  it.each(ORDINARY)("leaves %j alone", (text) => {
    expect(signalsSelfHarm(text)).toBe(false);
  });

  it("leaves every line of the guard corpora alone", () => {
    expect([...BENIGN_LINES, ...ATTACK_LINES].filter(signalsSelfHarm)).toEqual([]);
  });

  it("leaves the unclear lines to the gentler check", () => {
    expect(UNCLEAR.filter(signalsSelfHarm)).toEqual([]);
  });

  it("sees through zero-width characters and accents", () => {
    expect(signalsSelfHarm("I want to ki\u200bll mysélf")).toBe(true);
  });
});

describe("maySignalSelfHarm", () => {
  it.each([...SIGNALS, ...UNCLEAR])("hears %j", (text) => {
    expect(maySignalSelfHarm(text)).toBe(true);
  });

  it.each([...ORDINARY, ...ORDINARY_TOO])("leaves %j alone", (text) => {
    expect(maySignalSelfHarm(text)).toBe(false);
  });

  it("leaves every line of the guard corpora alone", () => {
    expect([...BENIGN_LINES, ...ATTACK_LINES].filter(maySignalSelfHarm)).toEqual([]);
  });
});
