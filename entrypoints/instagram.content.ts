import { startReelReader } from '../src/content/reel-reader';
import { startFloatingButton } from '../src/content/floating-button';
import { startDrawer } from '../src/content/drawer';

export default defineContentScript({
  matches: ['https://www.instagram.com/*'],
  runAt: 'document_start',
  /** 在隔离环境启动 Reel 读取、常驻抽屉与页面悬浮按钮。 */
  main(ctx) {
    startFloatingButton(startReelReader(ctx.signal), startDrawer(ctx.signal), ctx.signal);
  },
});
