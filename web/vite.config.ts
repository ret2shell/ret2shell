import { defineConfig } from 'vite'
import solidPlugin from 'vite-plugin-solid'
import path from 'path'
import viteCompression from 'vite-plugin-compression'

export default defineConfig({
  plugins: [solidPlugin(), viteCompression()],
  server: {
    port: 5173,
  },
  build: {
    target: 'esnext',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@lib': path.resolve(__dirname, 'src/lib'),
      '@api': path.resolve(__dirname, 'src/lib/api'),
      '@assets': path.resolve(__dirname, 'src/lib/assets'),
      '@blocks': path.resolve(__dirname, 'src/lib/blocks'),
      '@models': path.resolve(__dirname, 'src/lib/models'),
      '@storage': path.resolve(__dirname, 'src/lib/storage'),
      '@widgets': path.resolve(__dirname, 'src/lib/widgets'),
      '@routes': path.resolve(__dirname, 'src/routes'),
    },
  },
})
