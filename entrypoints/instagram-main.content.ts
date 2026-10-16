import { startNetworkCapture } from '../src/content/network';

export default defineContentScript({
  matches: ['https://www.instagram.com/*'],
  runAt: 'document_start',
  world: 'MAIN',
  /** 在页面脚本发起请求前安装响应监听。 */
  main() {
    startNetworkCapture();
  },
});
