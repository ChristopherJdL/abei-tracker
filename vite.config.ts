import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const lambdaUrl =
    env.VITE_LAMBDA_URL ||
    env.LAMBDA_URL ||
    'https://bhg6bgyrcgjotsjf437k435ioa0gcfes.lambda-url.eu-west-2.on.aws/'

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_LAMBDA_URL': JSON.stringify(lambdaUrl),
    },
  }
})
