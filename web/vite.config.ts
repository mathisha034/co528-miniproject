import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// Ingress path pattern: /api/v1/{service-name}/{rest}
// Ingress rewrite-target: /api/v1/$2 (strips service name prefix)
// So frontend calls: /api/v1/user-service/health
//   → ingress routes to user-service:3001/api/v1/health
// Use HTTPS by default because ingress enforces TLS and redirects HTTP requests.
const BACKEND = process.env.VITE_BACKEND_URL || 'https://miniproject.local';
const USE_HTTPS_DEV = process.env.VITE_DEV_HTTPS === '1';

export default defineConfig({
  plugins: [react(), ...(USE_HTTPS_DEV ? [basicSsl()] : [])],
  server: {
    port: USE_HTTPS_DEV ? 5174 : 5173,
    strictPort: true,
    host: true,
    https: USE_HTTPS_DEV ? {} : undefined,
    proxy: {
      '/api/v1': {
        target: BACKEND,
        changeOrigin: true,
        secure: false,
      },
      '/auth': {
        target: BACKEND,
        changeOrigin: true,
        secure: false,
      },
      // Proxy MinIO object storage — rewrites /minio/... → https://miniproject.local/minio/...
      // which the minio-ingress then strips to just /... before hitting MinIO
      '/minio': {
        target: BACKEND,
        changeOrigin: true,
        secure: false,
      },
    },
  },
})

