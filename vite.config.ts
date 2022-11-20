import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
console.log(process.env.BASE_URL);
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_URL
})
