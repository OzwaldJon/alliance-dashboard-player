import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

export default defineConfig({
  plugins: [
    monkey({
      entry: 'src/main.ts',
      userscript: {
        name: 'Alliance Dashboard Player',
        namespace: 'https://cncapp*.alliances.commandandconquer.com/*/index.aspx*',
        version: '0.1.0',
        description:
          'Alliance dashboard for Tiberium Alliances. Player part of the script.',
        author: 'OzwaldJon',
        match: ['https://*.alliances.commandandconquer.com/*/index.aspx*'],
        grant: 'none',
        'run-at': 'document-end'
      },
      build: {
        fileName: 'AllianceDashboardPlayer.user.js'
      }
    })
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      format: {
        comments: /==UserScript==/i
      }
    },
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true
      }
    }
  },
  server: {
    fs: {
      allow: ['..']
    }
  }
});
