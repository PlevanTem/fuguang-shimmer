import { defineConfig, loadEnv } from 'vite';

// Deploy strategy:
// - Default base is "./" so the build works on any static host (Vercel / Netlify / CF Pages / S3).
// - For GitHub Pages under a subpath, set VITE_BASE=/<repo-name>/ when building
//   (the Pages GitHub Actions workflow does this automatically using the repo name).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = env.VITE_BASE && env.VITE_BASE.trim() !== '' ? env.VITE_BASE : './';

  return {
    base,
    server: { host: true, port: 5173, open: false },
    build: {
      target: 'es2020',
      sourcemap: false,
      cssCodeSplit: false,
      chunkSizeWarningLimit: 600,
    },
  };
});
