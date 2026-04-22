import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    server: {
        proxy: {
            '/health': 'http://127.0.0.1:3000',
            '/documents': 'http://127.0.0.1:3000',
            '/profiles': 'http://127.0.0.1:3000',
            '/ingest': 'http://127.0.0.1:3000',
            '/rag': 'http://127.0.0.1:3000',
        },
    },
});
