/**
 * The scripted practice partner: a deterministic `LlmProvider` for the engine in
 * `@pitchperfect/partner`. It plans a seeded persona, answers each turn in that persona's voice and
 * scores the call with text heuristics, so local dev, tests, e2e and the static demo run without
 * a model or keys. The coach selects it with `COACH_PROVIDER=fake`; the demo runs it in the
 * browser.
 */
export { FakeProvider, type FakeProviderOptions } from "./provider.js";
/** Every line each voice can say, for the corpora that check them against the reply rules. */
export { VOICES } from "./voices.js";
