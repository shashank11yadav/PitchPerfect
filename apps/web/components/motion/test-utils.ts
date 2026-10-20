import { vi } from "vitest";

/** Stubs `matchMedia` so `(prefers-reduced-motion: reduce)` matches or not. */
export function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: reduce && query.includes("reduce"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

interface FakeEntry {
  isIntersecting: boolean;
  /** The element's top edge relative to the viewport, in px. */
  top: number;
}

interface Instance {
  callback: IntersectionObserverCallback;
  targets: Element[];
  disconnected: boolean;
}

/** Replaces IntersectionObserver with one the test drives by hand through `fire`. */
export function observeEntries() {
  const instances: Instance[] = [];

  class FakeIntersectionObserver {
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds = [];
    private readonly instance: Instance;

    constructor(callback: IntersectionObserverCallback) {
      this.instance = { callback, targets: [], disconnected: false };
      instances.push(this.instance);
    }

    observe(target: Element) {
      this.instance.targets.push(target);
    }

    unobserve() {
      // Not used by the components under test.
    }

    disconnect() {
      this.instance.disconnected = true;
    }

    takeRecords() {
      return [];
    }
  }

  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);

  return {
    observed: () => instances.reduce((count, instance) => count + instance.targets.length, 0),
    disconnected: () => instances.every((instance) => instance.disconnected),
    fire({ isIntersecting, top }: FakeEntry) {
      for (const instance of instances) {
        if (instance.disconnected) continue;
        const entries = instance.targets.map(
          (target) =>
            ({
              target,
              isIntersecting,
              boundingClientRect: { top, bottom: top + 100 },
            }) as unknown as IntersectionObserverEntry,
        );
        instance.callback(entries, instance as unknown as IntersectionObserver);
      }
    },
  };
}
