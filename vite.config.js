// import { defineConfig } from 'vite'
// import react from '@vitejs/plugin-react'

// // https://vite.dev/config/
// export default defineConfig({
//   plugins: [react()],
//   server: {
//     port: 5175, // Replace 5173 with the desired port number
//   },
// })

// frontend/vite.config.js
// frontend/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    proxy: {
      '/api': {
        // target: 'http://localhost:3001',
        target: 'https://coupon-distributer-1.onrender.com', 
        changeOrigin: true,
        secure: false,
      },
    },
  },
});