/**
 * The web app's colours (frontend/src/index.css), so the phone and the browser read as one product:
 * navy for structure, a copper accent for actions, warm paper behind white cards.
 */
export const colors = {
  navy950: '#0c1a33',
  navy900: '#142848',
  navy800: '#1e3a5f',
  navy700: '#2b4b7c',
  navy600: '#3d609a',
  navy100: '#d5dce6',

  accent700: '#733b1a',
  accent600: '#8c4820',
  accent500: '#a9602d',
  accent400: '#e8a06a',
  accent100: '#f3e6d8',
  accent50: '#fcf7f2',

  paper: '#f8f4f0',
  card: '#ffffff',
  line: '#e5ddd5',
  lineSoft: '#efe7df',
  lineStrong: '#d6ccc1',
  ink: '#1f2937',
  inkSoft: '#4b5563',
  white: '#ffffff',

  danger600: '#b91c1c',
  danger100: '#fce0e0',
  success600: '#15803d',
  success100: '#eaf6ea',
  warning600: '#92400e',
  warning100: '#f8ecd8',
  info600: '#1e4e8c',
  info100: '#e0ecf8',
} as const;

/** Severity is always colour AND words; these are the bar and chip colours for each level. */
export const severityColors = {
  LOW: { bar: '#1f7a4d', background: colors.info100, text: colors.info600 },
  MEDIUM: { bar: '#9a6700', background: colors.warning100, text: colors.warning600 },
  HIGH: { bar: '#c2410c', background: colors.danger100, text: colors.danger600 },
  CRITICAL: { bar: '#9b1c1c', background: colors.danger600, text: colors.white },
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

/** The smallest a tap target may be (Android and iOS guidelines agree on about this much). */
export const MIN_TOUCH = 48;

export const fontSize = { caption: 13, body: 16, label: 14, heading: 20, title: 28 } as const;
