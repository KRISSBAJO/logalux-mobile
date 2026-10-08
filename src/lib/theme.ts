// The LogaLuxe look, taken from the phone designs in /design. One place for every colour, size and font.

export const c = {
  ink: "#1A1513",
  cream: "#FBF7F2",
  cream2: "#F1E8DD",
  white: "#FFFFFF",
  wine: "#7A1F2B",
  wineDark: "#5A1420",
  gold: "#D4AF5A",
  goldInk: "#7A5A12",
  goldBg: "#F6EBD2",
  line: "#EDE4DA",
  line2: "#E6DCD2",
  muted: "#6B5F57",
  muted2: "#9A8E85",
  tab: "#7A6E66",
  ok: "#1F6B3A",
  okBg: "#E3F2E7",
  bad: "#A3261E",
  badBg: "#FBE9E7",
  wineBg: "#F6E3E6",
  photo: "#3B1D22",
} as const;

// Font family names as loaded in the root layout.
export const f = {
  serif: "BodoniModa_500Medium",
  serifBold: "BodoniModa_600SemiBold",
  serifItalic: "BodoniModa_500Medium_Italic",
  body: "DMSans_400Regular",
  medium: "DMSans_500Medium",
  semi: "DMSans_600SemiBold",
  bold: "DMSans_700Bold",
} as const;

export const pad = 20; // the side gutter on every screen
export const radius = { card: 20, field: 16, pill: 999 } as const;
