// Lessons in `content/lessons` are MDX: each file is a component with no props of its own.
declare module "*.mdx" {
  import type { ComponentType } from "react";

  const Content: ComponentType;
  export default Content;
}
