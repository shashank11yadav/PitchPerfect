import type { ComponentPropsWithoutRef } from "react";

/**
 * How lesson MDX renders. A lesson's sections are written as `##` but sit under the lesson's
 * own title (an h2 on the page, under the app's h1), so they render one level down, as h3.
 */
const components = {
  h2: ({ children, ...props }: ComponentPropsWithoutRef<"h3">) => (
    <h3 className="mt-10 mb-3 text-h4 text-navy first:mt-0" {...props}>
      {children}
    </h3>
  ),
  p: (props: ComponentPropsWithoutRef<"p">) => <p className="mt-4 first:mt-0" {...props} />,
  ul: (props: ComponentPropsWithoutRef<"ul">) => (
    <ul className="mt-4 flex list-disc flex-col gap-2 pl-6 marker:text-primary" {...props} />
  ),
  ol: (props: ComponentPropsWithoutRef<"ol">) => (
    <ol
      className="mt-4 flex list-decimal flex-col gap-2 pl-6 marker:font-semibold marker:text-primary"
      {...props}
    />
  ),
  strong: (props: ComponentPropsWithoutRef<"strong">) => (
    <strong className="font-semibold text-navy" {...props} />
  ),
};

export function useMDXComponents() {
  return components;
}
