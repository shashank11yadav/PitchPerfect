import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stubReducedMotion } from "@/components/motion/test-utils";

vi.mock("./grain-gradient", () => ({
  GrainGradient: () => <canvas data-testid="shader-canvas" />,
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // The WebGL check is cached per page load; a fresh module stands in for a fresh page.
  vi.resetModules();
});

const loadField = async () => (await import("./ShaderField")).ShaderField;

const renderField = async () => {
  const ShaderField = await loadField();
  return render(
    <ShaderField data-testid="field">
      <span>Mic</span>
    </ShaderField>,
  );
};

describe("ShaderField", () => {
  it("shows only the static gradient when reduced motion is preferred", async () => {
    stubReducedMotion(true);
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext");
    await renderField();
    expect(screen.getByTestId("field")).toHaveAttribute("data-shader", "static");
    expect(screen.queryByTestId("shader-canvas")).not.toBeInTheDocument();
    expect(getContext).not.toHaveBeenCalled();
    expect(screen.getByText("Mic")).toBeInTheDocument();
  });

  it("shows only the static gradient when WebGL is unavailable", async () => {
    stubReducedMotion(false);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    await renderField();
    expect(screen.getByTestId("field")).toHaveAttribute("data-shader", "static");
    expect(screen.queryByTestId("shader-canvas")).not.toBeInTheDocument();
  });

  it("releases the WebGL context it opened to check for support", async () => {
    stubReducedMotion(false);
    const loseContext = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      getExtension: (name: string) => (name === "WEBGL_lose_context" ? { loseContext } : null),
    } as unknown as WebGL2RenderingContext);
    await renderField();
    expect(loseContext).toHaveBeenCalledTimes(1);
  });

  it("loads the animated shader when motion is allowed and WebGL works", async () => {
    stubReducedMotion(false);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      getExtension: () => null,
    } as unknown as WebGL2RenderingContext);
    await renderField();
    expect(screen.getByTestId("field")).toHaveAttribute("data-shader", "live");
    expect(await screen.findByTestId("shader-canvas")).toBeInTheDocument();
  });

  it("renders the static gradient on the server, before any script runs", async () => {
    const { renderToString } = await import("react-dom/server");
    const ShaderField = await loadField();
    const html = renderToString(<ShaderField>Mic</ShaderField>);
    expect(html).toContain('data-shader="static"');
    expect(html).not.toContain("<canvas");
  });
});
