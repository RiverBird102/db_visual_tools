import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite' // 1. 引入 tailwind 插件
import path from 'path';

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss()
  ],
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