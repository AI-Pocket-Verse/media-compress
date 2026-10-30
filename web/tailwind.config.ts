import type { Config } from 'tailwindcss'
// @ts-expect-error -- shared preset is plain CJS
import preset from '@media-compress/tailwind-preset'

/**
 * media-compress overrides the shared preset's default palette to keep the original
 * light + indigo look while still inheriting fontFamily, radii, animations.
 * Remove the `theme.extend.colors` block to align with the global purple theme.
 */
export default {
  presets: [preset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../packages/auth-client-web/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#f0f4ff',
        surface: '#ffffff',
        fg: '#1f2937',
        muted: '#9ca3af',
        line: '#e5e7eb',
        primary: { DEFAULT: '#6366f1', foreground: '#ffffff' },
        accent: { DEFAULT: '#8b5cf6', foreground: '#ffffff' },
      },
    },
  },
} satisfies Config
