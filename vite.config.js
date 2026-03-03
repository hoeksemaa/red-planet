import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';
import { resolve } from 'path';

export default defineConfig({
    plugins: [react(), cesium()],
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                qr: resolve(__dirname, 'qr/index.html'),
            },
        },
    },
});
