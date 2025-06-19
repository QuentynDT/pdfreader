import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'


// https://vite.dev/config/
export default defineConfig({
  optimizeDeps: {
  include: ['pdfjs-dist/build/pdf.worker.mjs'],
},
  plugins: [vue()],
})
