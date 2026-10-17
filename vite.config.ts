import { defineConfig } from 'vite';
export default defineConfig({ optimizeDeps: { exclude: ['@ffmpeg/ffmpeg'] }, build: { target: 'es2022' } });
