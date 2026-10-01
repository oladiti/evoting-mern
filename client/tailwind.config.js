/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#ecfeff',
          100: '#cffafe',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
          800: '#155e75',
          900: '#164e63',
        },
        secondary: {
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
        },
        accent: {
          500: '#8b5cf6',
          600: '#6d28d9',
          700: '#a78bfa',
        },
        success: {
          50: '#ecfdf5',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          900: '#064e3b',
        },
        danger: {
          50: '#fef2f2',
          100: '#fee2e2',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          900: '#7f1d1d',
        },
        // 50 and 900 are needed by the tinted callout panels (bg-warning-50 with
        // dark:bg-warning-900/20). Without them Tailwind silently omits the
        // rules and those panels render with no background at all.
        warning: {
          50: '#fffbeb',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          900: '#78350f',
        },
        info: {
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
        },
        canvas: {
          light: '#f8fafc',
          dark: '#0f172a',
        },
        surface: {
          light: '#ffffff',
          dark: '#1e293b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        sm: '0 1px 2px rgba(0,0,0,0.05)',
        md: '0 4px 12px rgba(0,0,0,0.08)',
        lg: '0 10px 40px rgba(0,0,0,0.12)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #0891b2 0%, #0e7490 50%, #06b6d4 100%)',
        'brand-hover': 'linear-gradient(135deg, #0e7490 0%, #0891b2 50%, #0891b2 100%)',
        'warm-gradient': 'linear-gradient(135deg, #f97316, #ea580c)',
        'accent-gradient': 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
        'success-gradient': 'linear-gradient(135deg, #10b981, #059669)',
      },
      keyframes: {
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(24px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
      animation: {
        fadeInUp: 'fadeInUp 0.6s ease-out both',
      },
    },
  },
  plugins: [],
};