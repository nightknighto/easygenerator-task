/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // loadEnv reads the repo-root .env (two levels up from apps/frontend) with no
  // prefix filter, so BACKEND_PORT can live next to the backend's own vars.
  // Real process.env entries win over the file.
  const env = loadEnv(mode, '../../', '')
  const backendPort = env.BACKEND_PORT || '3000'

  return {
    plugins: [
      // Must come before the react plugin (TanStack Router docs).
      TanStackRouterVite(),
      react(),
      tailwindcss(),
    ],
    server: {
      proxy: {
        // Same-origin proxy keeps the httpOnly auth cookies flowing without
        // any CORS/credentials configuration.
        '/api': {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
    },
  }
})
