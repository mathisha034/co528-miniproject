import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Ingress path pattern: /api/v1/{service-name}/{rest}
// Ingress rewrite-target: /api/v1/$2 (strips service name prefix)
// So frontend calls: /api/v1/user-service/health
//   → ingress routes to user-service:3001/api/v1/health
// Use HTTPS by default because ingress enforces TLS and redirects HTTP requests.
const BACKEND = process.env.VITE_BACKEND_URL || 'https://miniproject.local';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
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

