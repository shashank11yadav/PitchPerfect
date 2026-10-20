import {
  defaultObjectSizing,
  getShaderColorFromString,
  getShaderNoiseTexture,
  grainGradientFragmentShader,
  GrainGradientShapes,
  ShaderFitOptions,
  ShaderMount,
} from "@paper-design/shaders";

/** Brand blues only: navy ground, primary blue and one lighter tint of it. */
const COLOR_BACK = "#2d3c90";
const COLORS = ["#3f56d2", "#6f82e6", "#1d275e"];
const SPEED = 0.35;
const MAX_PIXEL_COUNT = 1_200_000;

/**
 * Mounts Paper Shaders' grain gradient into `parent` (any element, so a span inside a heading
 * works) and resolves to a function that disposes of it. Mirrors the uniforms the library's own
 * React wrapper builds, including waiting for the noise texture to load, which the shader needs
 * before it starts. Loaded lazily, so only this shader ends up in the chunk.
 */
export async function mountGrainGradient(parent: HTMLElement): Promise<() => void> {
  const noiseTexture = getShaderNoiseTexture();
  if (noiseTexture && !noiseTexture.complete) await noiseTexture.decode();
  const uniforms = {
    u_colorBack: getShaderColorFromString(COLOR_BACK),
    u_colors: COLORS.map(getShaderColorFromString),
    u_colorsCount: COLORS.length,
    u_softness: 0.85,
    u_intensity: 0.35,
    u_noise: 0.3,
    u_shape: GrainGradientShapes.wave,
    u_noiseTexture: noiseTexture,
    u_fit: ShaderFitOptions[defaultObjectSizing.fit],
    u_scale: 1.4,
    u_rotation: defaultObjectSizing.rotation,
    u_offsetX: defaultObjectSizing.offsetX,
    u_offsetY: defaultObjectSizing.offsetY,
    u_originX: defaultObjectSizing.originX,
    u_originY: defaultObjectSizing.originY,
    u_worldWidth: defaultObjectSizing.worldWidth,
    u_worldHeight: defaultObjectSizing.worldHeight,
  };
  let mount: ShaderMount;
  try {
    mount = new ShaderMount(
      parent,
      grainGradientFragmentShader,
      uniforms,
      undefined,
      SPEED,
      0,
      2,
      MAX_PIXEL_COUNT,
    );
  } catch (error) {
    // The mount adds its canvas before it can fail; take it out so only the static gradient shows.
    parent.querySelector(":scope > canvas")?.remove();
    throw error;
  }
  return () => {
    mount.dispose();
  };
}
