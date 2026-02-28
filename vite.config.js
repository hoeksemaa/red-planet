import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';
import { resolve } from 'path';

export default defineConfig({
    plugins: [cesium()],
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                qr: resolve(__dirname, 'qr/index.html'),
            },
        },
    },
});
