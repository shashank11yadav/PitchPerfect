import type { AttemptView, ScenarioPrivate, SkillSlug } from "@pitchperfect/shared";

/**
 * What the static demo remembers, in this tab only: `sessionStorage` when the browser allows it,
 * memory otherwise. Nothing here is ever sent anywhere. Closing the tab forgets it.
 */

export interface StoredAttempt {
  /** The attempt with `scorecard` always null: the scorecard is worked out from the transcript. */
  view: AttemptView;
  /** Never shown; the partner reads it. Kept here because the partner runs in this browser. */
  scenarioPrivate: ScenarioPrivate;
  guardFlags: number;
  /** The scripted provider's seed for this call, so a resumed call keeps its voice. */
  seed: number;
}

export interface DemoState {
  attempts: StoredAttempt[];
  consentAt: string | null;
  lessonsDone: SkillSlug[];
}

const KEY = "pitchperfect-demo";
const EMPTY: DemoState = { attempts: [], consentAt: null, lessonsDone: [] };

let memory: DemoState | undefined;
const listeners = new Set<() => void>();

const isState = (value: unknown): value is DemoState =>
  typeof value === "object" &&
  value !== null &&
  Array.isArray((value as DemoState).attempts) &&
  Array.isArray((value as DemoState).lessonsDone);

function storage(): Storage | undefined {
  try {
    return typeof sessionStorage === "undefined" ? undefined : sessionStorage;
  } catch {
    // Access can throw when site data is blocked.
    return undefined;
  }
}

/** The state as last written: this tab's storage first, then memory, then nothing yet. */
export function readDemoState(): DemoState {
  if (memory) return memory;
  try {
    const raw = storage()?.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : undefined;
    memory = isState(parsed) ? parsed : EMPTY;
  } catch {
    memory = EMPTY;
  }
  return memory;
}

/** Replaces the state and tells subscribers (the demo session) about it. */
function writeDemoState(next: DemoState): void {
  memory = next;
  try {
    storage()?.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: memory still holds it for this page.
  }
  for (const listener of listeners) listener();
}

export function updateDemoState(change: (state: DemoState) => DemoState): DemoState {
  const next = change(readDemoState());
  writeDemoState(next);
  return next;
}

/** For `useSyncExternalStore`: called after every write. */
export function subscribeDemoState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Forgets everything; tests start from here. */
export function resetDemoState(): void {
  memory = undefined;
  try {
    storage()?.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
  for (const listener of listeners) listener();
}
