import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stubReducedMotion } from "@/components/motion/test-utils";

const dispose = vi.fn();
const mountGrainGradient = vi.fn<(parent: HTMLElement) => Promise<() => void>>(() =>
  Promise.resolve(dispose),
);

vi.mock("./grain-gradient", () => ({ mountGrainGradient }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  mountGrainGradient.mockClear();
  dispose.mockClear();
  // The WebGL check is cached per page load; a fresh module stands in for a fresh page.
  vi.resetModules();
});

const loadField = async () => (await import("./ShaderField")).ShaderField;

const renderField = async (className?: string) => {
  const ShaderField = await loadField();
  return render(
    <h1>
      Get hired.
      <ShaderField data-testid="field" className={className}>
        <span>Mic</span>
      </ShaderField>
    </h1>,
  );
};

const webGl = (context: Partial<WebGL2RenderingContext> | null) =>
  vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(context as WebGL2RenderingContext | null);

describe("ShaderField", () => {
  it("is a span, so it can sit inside a heading, and is always positioned", async () => {
    stubReducedMotion(true);
    await renderField("inline-flex");
    const field = screen.getByTestId("field");
    expect(field.tagName).toBe("SPAN");
    expect(field).toHaveClass("relative", "inline-flex");
  });

  it("shows only the static gradient when reduced motion is preferred", async () => {
    stubReducedMotion(true);
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext");
    await renderField();
    expect(screen.getByTestId("field")).toHaveAttribute("data-shader", "static");
    expect(getContext).not.toHaveBeenCalled();
    expect(mountGrainGradient).not.toHaveBeenCalled();
    expect(screen.getByText("Mic")).toBeInTheDocument();
  });

  it("shows only the static gradient when WebGL is unavailable", async () => {
    stubReducedMotion(false);
    webGl(null);
    await renderField();
    expect(screen.getByTestId("field")).toHaveAttribute("data-shader", "static");
    expect(mountGrainGradient).not.toHaveBeenCalled();
  });

  it("releases the WebGL context it opened to check for support", async () => {
    stubReducedMotion(false);
    const loseContext = vi.fn();
    webGl({
      getExtension: ((name: string) =>
        name === "WEBGL_lose_context" ? { loseContext } : null) as never,
    });
    await renderField();
    expect(loseContext).toHaveBeenCalledTimes(1);
  });

  it("mounts the shader into its own span when allowed, and disposes of it on unmount", async () => {
    stubReducedMotion(false);
    webGl({ getExtension: (() => null) as never });
    const { unmount } = await renderField();
    const field = screen.getByTestId("field");
    expect(field).toHaveAttribute("data-shader", "live");
    await waitFor(() => {
      expect(mountGrainGradient).toHaveBeenCalledWith(field);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("renders the static gradient on the server, before any script runs", async () => {
    const { renderToString } = await import("react-dom/server");
    const ShaderField = await loadField();
    const html = renderToString(<ShaderField>Mic</ShaderField>);
    expect(html).toContain('data-shader="static"');
    expect(html).not.toContain("<canvas");
  });
});
