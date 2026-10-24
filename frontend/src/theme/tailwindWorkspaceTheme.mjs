import colors from "tailwindcss/colors.js";
import plugin from "tailwindcss/plugin.js";

const variables = {};
const rgb = hex => hex.slice(1).match(/../g).map(part => parseInt(part, 16)).join(" ");
const token = (name, dark, light) => {
  variables[`--workspace-${name}`] = rgb(light);
  return `rgb(var(--workspace-${name}, ${rgb(dark)}) / <alpha-value>)`;
};

// Only the light workspace defines these properties. Every fallback is the
// original Tailwind/brand colour, including opacity, hover and focus variants.
const textColor = { white: token("text", "#ffffff", "#0f172a") };
const backgroundColor = { white: token("wash", "#ffffff", "#64748b") };
const gradientColorStops = {};
for (const family of ["neutral", "gray", "slate", "zinc", "stone"]) {
  textColor[family] = {}; backgroundColor[family] = {}; gradientColorStops[family] = {};
  for (const shade of [50,100,200,300,400,500,600,700,800,900,950]) {
    const foreground = shade <= 200 ? "#0f172a" : shade <= 300 ? "#334155" : "#475569";
    const surface = shade >= 900 ? "#f8fafc" : shade >= 700 ? "#f1f5f9" : "#e2e8f0";
    textColor[family][shade] = token(`text-${family}-${shade}`, colors[family][shade], foreground);
    backgroundColor[family][shade] = token(`bg-${family}-${shade}`, colors[family][shade], surface);
    gradientColorStops[family][shade] = backgroundColor[family][shade];
  }
}
for (const family of ["red", "rose", "orange", "amber", "yellow", "lime", "green", "emerald", "teal", "cyan", "sky", "blue", "indigo", "violet", "purple", "pink", "fuchsia"]) {
  textColor[family] = {};
  for (const shade of [50,100,200,300,400,500]) textColor[family][shade] = token(`text-${family}-${shade}`, colors[family][shade], colors[family][shade <= 200 ? 900 : 800]);
}
textColor.dune = {
  amber: token("accent", "#d97706", "#92400e"),
  amberLight: token("accent-light", "#f59e0b", "#92400e"),
  sand: token("sand", "#e7d9c4", "#57534e"),
};
backgroundColor.dune = {
  black: token("brand-black", "#000000", "#f8fafc"),
  ink: token("brand-ink", "#0a0908", "#f8fafc"),
  surface: token("brand-surface", "#121110", "#ffffff"),
};
const edge = token("edge", "#ffffff", "#475569");
export const workspaceColorExtension = {
  textColor, backgroundColor, gradientColorStops,
  borderColor: { white: edge, dune: { border: token("brand-border", "#2a2320", "#cbd5e1") } },
  divideColor: { white: edge }, ringColor: { white: edge },
  boxShadowColor: { black: token("shadow", "#000000", "#94a3b8") },
};

export const workspaceColorPlugin = plugin(({ addBase }) => {
  addBase({ 'html[data-workspace-theme="light"]': variables });
});
