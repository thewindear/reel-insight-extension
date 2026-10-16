import { defineConfig } from 'wxt';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  srcDir: 'src',
  entrypointsDir: '../entrypoints',
  vite: () => ({ plugins: [react(), tailwindcss()] }),
  manifest: {
    name: 'Reel Insight',
    description: '采集 Instagram Reels 视频与达人资料，查看互动数据和账户简介，管理记录并导出 Excel。',
    permissions: ['activeTab', 'storage'],
    action: { default_title: '打开 Reel 采集抽屉', default_icon: {
      16: 'icon-16.png', 32: 'icon-32.png', 48: 'icon-48.png', 128: 'icon-128.png',
    } },
    icons: { 16: 'icon-16.png', 32: 'icon-32.png', 48: 'icon-48.png', 128: 'icon-128.png' },
    web_accessible_resources: [{ resources: ['viewer.html'], matches: ['https://www.instagram.com/*'] }],
  },
});
