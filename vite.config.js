import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: 'BASE_PATH' in process.env ? (process.env.BASE_PATH || '/') : '/FOCAL/',
});
