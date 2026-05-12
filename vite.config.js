import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
// https://vite.dev/config/
export default defineConfig({
    plugins: [vue()],
    server: {
        port: 8080
    },
    resolve: {
        alias: {
            '@app': path.resolve(__dirname, './src'),
            events: 'events'
        }
    },
    optimizeDeps: {
        include: ['events']
    },
    build: {
        rollupOptions: {
            external: [
                'puppeteer'
            ]
        }
    }
});
