import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        host: '0.0.0.0',
        port: 5173,
        watch: {
            usePolling: true,
        },
        proxy: {
            '/api': {
                target: 'http://backend:3001',
                changeOrigin: true,
                secure: false,
                ws: true,
                configure: (proxy, _options) => {
                    proxy.on('error', (err, _req, res) => {
                        console.log('proxy error', err);
                        res.writeHead(500, {
                            'Content-Type': 'text/plain',
                        });
                        res.end('Proxy error: ' + err.message);
                    });
                    proxy.on('proxyReq', (proxyReq, req, _res) => {
                        console.log('Proxying request:', req.method, req.url, '->', proxyReq.path);
                    });
                },
            },
            '/uploads': {
                target: 'http://backend:3001',
                changeOrigin: true,
                secure: false,
            },
            '/output': {
                target: 'http://backend:3001',
                changeOrigin: true,
                secure: false,
            },
        },
    },
});
