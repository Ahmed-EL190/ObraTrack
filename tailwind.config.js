/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f4f6f8',
          100: '#e6eaef',
          200: '#c7d0db',
          300: '#9aa9bd',
          400: '#647389',
          500: '#42506a',
          600: '#2f3b53',
          700: '#212a3d',
          800: '#171e2c',
          900: '#0f1420',
          950: '#0a0e17'
        },
        gold: {
          50: '#fbf6ea',
          100: '#f4e7c4',
          200: '#e9cd85',
          300: '#deb455',
          400: '#cf9a34',
          500: '#b17f26',
          600: '#8e651e',
          700: '#6b4c17',
          800: '#4a3410',
          900: '#2c1e09'
        },
        clay: {
          500: '#b4552f'
        },
        moss: {
          500: '#3f7a56'
        }
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace']
      },
      boxShadow: {
        panel: '0 1px 2px rgba(15,20,32,0.04), 0 8px 24px -12px rgba(15,20,32,0.18)'
      }
    }
  },
  plugins: []
}
