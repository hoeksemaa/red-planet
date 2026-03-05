import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';
import { resolve } from 'path';

export default defineConfig({
    plugins: [
        react(),
        cesium(),
        {
            name: 'cesium-defer',
            enforce: 'post',
            transformIndexHtml(html) {
                return {
                    html: html.replace(
                        '<script src="/cesium/Cesium.js">',
                        '<script defer src="/cesium/Cesium.js">'
                    ),
                    tags: [
                        {
                            tag: 'link',
                            attrs: { rel: 'preload', as: 'script', href: '/cesium/Cesium.js' },
                            injectTo: 'head-prepend',
                        },
                    ],
                };
            },
        },
    ],
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                qr: resolve(__dirname, 'qr/index.html'),
            },
        },
    },
});
