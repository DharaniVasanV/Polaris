import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    open: true,
  },
  resolve: {
    // Ensure .tsx is resolved before .ts so React components are never
    // shadowed by legacy forwarding .ts files with the same basename.
    extensions: ['.tsx', '.ts', '.jsx', '.js', '.json'],
  },
});
