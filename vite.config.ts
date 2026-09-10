import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [{
    name: 'early-attendance',
    // Inject after Vite processes HTML modules. Otherwise Vite merges the async
    // attendance module with the deferred main entry and delays it behind data scripts.
    transformIndexHtml: {
      order: 'post',
      handler(_html, context) {
        const entry = Object.values(context.bundle ?? {}).find(
          item => item.type === 'chunk' && item.isEntry && item.name === 'attendance',
        );
        const src = context.server ? '/src/attendance/bootstrap.ts' : entry ? `/${entry.fileName}` : null;
        if (!src) throw new Error('Missing independent attendance entry');
        return [{ tag: 'script', attrs: { type: 'module', async: true, src }, injectTo: 'head-prepend' }];
      },
    },
  }],
  build: {
    rollupOptions: {
      input: {
        attendance: resolve(__dirname, 'src/attendance/bootstrap.ts'),
        main: resolve(__dirname, 'index.html'),
        lite: resolve(__dirname, 'lite.html'),
      },
    },
  },
});
