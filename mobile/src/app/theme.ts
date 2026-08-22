/**
 * Shoprex visual language: green-led, light surfaces, no dark chrome.
 * Emerald drives the main selling action; Kijani marks completed states;
 * Amber warns; red is reserved for destructive or error states.
 *
 * Mirrors web/src/styles/globals.css so both clients look like one product.
 */
export const colors = {
  emerald: '#059669',
  emeraldStrong: '#047857',
  emeraldSoft: '#D1FAE5',
  kijani: '#16A34A',
  amber: '#D97706',
  amberSoft: '#FEF3C7',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  surface: '#FFFFFF',
  surfaceMuted: '#F6F8F7',
  border: '#E2E8E5',
  text: '#14231D',
  textMuted: '#5B6B64',
} as const;

export const radius = {
  card: 14,
  button: 12,
  pill: 999,
} as const;

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 20,
  xl: 32,
} as const;
