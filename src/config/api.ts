/**
 * POLARIS — Central API Base URL Configuration
 *
 * In production (Vercel), set the env variable:
 *   VITE_API_BASE_URL=https://YOUR-HF-USERNAME-polaris-backend.hf.space
 *
 * In local dev, leave VITE_API_BASE_URL unset and it falls back to localhost.
 */
export const API_BASE_URL: string =
  ((import.meta as any).env?.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://127.0.0.1:8000';
