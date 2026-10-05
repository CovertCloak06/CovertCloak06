import { useColorScheme } from 'react-native';

export interface Palette {
  bg: string;
  card: string;
  elevated: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  accentText: string;
  danger: string;
  success: string;
  warning: string;
  overlay: string;
}

const light: Palette = {
  bg: '#F6F5FA',
  card: '#FFFFFF',
  elevated: '#EEECF6',
  text: '#16141F',
  muted: '#5E5A70',
  border: '#DEDBE8',
  accent: '#5B3FD9',
  accentText: '#FFFFFF',
  danger: '#C62D3A',
  success: '#1D8A55',
  warning: '#A86400',
  overlay: 'rgba(10, 8, 20, 0.72)',
};

const dark: Palette = {
  bg: '#0E0D14',
  card: '#191723',
  elevated: '#24212F',
  text: '#F1EFF8',
  muted: '#A6A1B8',
  border: '#2F2B3D',
  accent: '#8B74FF',
  accentText: '#0E0D14',
  danger: '#FF6B78',
  success: '#4CD18F',
  warning: '#F2B04C',
  overlay: 'rgba(0, 0, 0, 0.75)',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}
