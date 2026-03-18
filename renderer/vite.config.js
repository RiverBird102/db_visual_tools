import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  plugins: [vue()],
  root: path.join(__dirname),
  base: './',
  build: {
    outDir: path.join(__dirname, 'dist'),
    assetsDir: 'assets'
  },
  server: {
    port: 3000,
    strictPort: true
  },
  resolve: {
    alias: {
      '@': path.join(__dirname, 'src')
    }
  }
});