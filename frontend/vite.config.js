import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Separar las librerías del código de la app: al desplegar un cambio
        // nuestro, el navegador (y la APK) no vuelve a descargar React/Mantine,
        // que apenas cambian.
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-mantine': ['@mantine/core', '@mantine/hooks'],
        },
      },
    },
  },
})
