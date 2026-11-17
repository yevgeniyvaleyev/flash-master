export interface Palette {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  onPrimary: string;
  success: string;
  danger: string;
  /** Secondary accent (target arc, timeline ticks). */
  accent: string;
  /** Work left / not yet met (amber). */
  warning: string;
}

export const light: Palette = {
  background: '#F5F6F8',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF0F3',
  border: '#DADDE2',
  text: '#16181D',
  textMuted: '#6B7280',
  primary: '#3B5BDB',
  onPrimary: '#FFFFFF',
  success: '#2F9E44',
  danger: '#E03131',
  accent: '#00AF9B',
  warning: '#E59F00',
};

export const dark: Palette = {
  background: '#0F1115',
  surface: '#181B21',
  surfaceAlt: '#20242C',
  border: '#2C313A',
  text: '#E8EAED',
  textMuted: '#9AA0A6',
  primary: '#748FFC',
  onPrimary: '#0F1115',
  success: '#51CF66',
  danger: '#FF6B6B',
  accent: '#00B8A3',
  warning: '#FFC01E',
};
