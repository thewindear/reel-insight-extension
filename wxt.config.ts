import { defineConfig } from 'wxt';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  srcDir: 'src',
  entrypointsDir: '../entrypoints',
  vite: () => ({ plugins: [react(), tailwindcss()] }),
  manifest: {
    name: 'Reel Insight',
    description: 'Collect Instagram Reels and creator profiles, view engagement and account details, manage records, and export to Excel.',
    permissions: ['activeTab', 'storage'],
    action: { default_title: 'Open Reel collection drawer', default_icon: {
      16: 'icon-16.png', 32: 'icon-32.png', 48: 'icon-48.png', 128: 'icon-128.png',
    } },
    icons: { 16: 'icon-16.png', 32: 'icon-32.png', 48: 'icon-48.png', 128: 'icon-128.png' },
    web_accessible_resources: [{ resources: ['viewer.html'], matches: ['https://www.instagram.com/*'] }],
  },
});
