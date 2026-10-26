import type { ReactNode } from "react";

interface PointerTextProps {
  /** For a mouse and keyboard. */
  fine: ReactNode;
  /** For a touch screen, where there is no Space key to hold. */
  coarse: ReactNode;
}

/**
 * Words that depend on the device. Both versions are in the HTML and a media query shows one, so
 * the server render is already right and nothing swaps after hydration. The hidden one is out of
 * the accessibility tree as well.
 */
export function PointerText({ fine, coarse }: PointerTextProps) {
  return (
    <>
      <span className="pointer-coarse:hidden">{fine}</span>
      <span className="hidden pointer-coarse:inline">{coarse}</span>
    </>
  );
}
