/** The first focusable element on every page. Pages render `<main id="main">`. */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only rounded-control bg-surface px-4 py-2 font-semibold text-primary shadow-card focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100]"
    >
      Skip to main content
    </a>
  );
}
