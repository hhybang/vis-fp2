import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    base: process.env.GITHUB_ACTIONS ? '/vis-fp2/' : '/',
    plugins: [react()],
    define: {
      'import.meta.env.VITE_OPENROUTE_KEY': JSON.stringify(env.OPENROUTE_KEY),
      'import.meta.env.VITE_TRAVELTIME_APP_ID': JSON.stringify(env.TRAVELTIME_APP_ID),
      'import.meta.env.VITE_TRAVELTIME_API_KEY': JSON.stringify(env.TRAVELTIME_API_KEY),
    },
  }
})
