import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Client bundle reads import.meta.env.VITE_* (see src/utils/api.js).
 * CI / GitHub secrets: OPENROUTE_KEY, TRAVELTIME_APP_ID, TRAVELTIME_API_KEY
 * (same as early Vite config). Optional VITE_* in .env.local for local dev.
 */
function pickEnv(fileEnv, ...keys) {
  for (const key of keys) {
    const v = process.env[key] ?? fileEnv[key]
    if (v != null && String(v).trim() !== '') return String(v).trim()
  }
  return ''
}

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), '')
  const openRouteKey = pickEnv(
    fileEnv,
    'OPENROUTE_KEY',
    'VITE_OPENROUTE_KEY',
  )
  const traveltimeAppId = pickEnv(
    fileEnv,
    'TRAVELTIME_APP_ID',
    'VITE_TRAVELTIME_APP_ID',
  )
  const traveltimeApiKey = pickEnv(
    fileEnv,
    'TRAVELTIME_API_KEY',
    'VITE_TRAVELTIME_API_KEY',
  )

  const pagesBaseFromCi =
    process.env.GITHUB_ACTIONS === 'true' &&
    process.env.GITHUB_REPOSITORY?.includes('/')
      ? `/${process.env.GITHUB_REPOSITORY.split('/')[1]}/`
      : '/'

  return {
    base: process.env.GITHUB_ACTIONS === 'true' ? pagesBaseFromCi : '/',
    plugins: [react()],
    define: {
      'import.meta.env.VITE_OPENROUTE_KEY': JSON.stringify(openRouteKey),
      'import.meta.env.VITE_TRAVELTIME_APP_ID': JSON.stringify(traveltimeAppId),
      'import.meta.env.VITE_TRAVELTIME_API_KEY': JSON.stringify(traveltimeApiKey),
    },
  }
})
