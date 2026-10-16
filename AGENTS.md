# Chrome 扩展开发规范

本项目使用 WXT、TypeScript、React、shadcn/ui 和 Manifest V3。新增功能沿用现有层次，先改已有模块；只有职责确实不同才新增文件。

## 目录与职责

| 目录 | 职责 |
| --- | --- |
| `entrypoints/` | WXT 自动发现的入口。只放入口配置与启动代码；后台入口校验悬浮按钮消息并响应来源标签页，插件图标通知内容脚本打开抽屉。记录页的 HTML 与脚本入口可同目录放置。 |
| `src/content/` | Instagram 页面读取和抽屉控制。`network.ts` 仅在 MAIN world 监听响应；`reel-reader.ts` 在 ISOLATED world 缓存数据并回应记录页；`page.ts` 读取 DOM 兜底字段；`floating-button.ts` 展示采集状态；`drawer.ts` 挂载常驻抽屉。 |
| `src/reel/` | 不依赖浏览器扩展 API 的类型、数据解析、合并与 caption 解析。 |
| `src/popup/` | 抽屉记录页的 React 数据读取 hook、展示组件和 Tailwind 样式。 |
| `src/components/ui/` | 通过 shadcn/ui 官方 CLI 加入的本地组件，按项目主题调整。 |
| `tests/` | 对真实风险有意义的解析与边界检查。 |

WXT 会将 `entrypoints/` 下的文件视为入口；不要把普通模块直接放在该目录，也不要在入口文件顶层访问 DOM 或扩展运行时 API。需要普通代码时放入 `src/`，由入口调用。

## 权限与运行环境

1. 只匹配 `https://www.instagram.com/*`，权限以当前的 `activeTab` 为限。新增权限前先证明现有权限不能完成需求，不预留 `<all_urls>`、`tabs`、`storage` 等权限。
2. MAIN world 与 Instagram 页面共享执行环境，页面可干扰该脚本。这里仅监听页面已有响应并传递必要的规范化字段，不调用扩展特权 API，不读取或保存 Cookie、令牌、请求头和完整响应。
3. ISOLATED world 负责 DOM 读取与消息处理。来自页面的事件和接口数据都按 `unknown` 校验后再使用；跨世界对象不能直接作为可信数据传给记录页。
4. 记录页仅向当前 Instagram 标签页或抽屉绑定的来源标签页发送固定的 `GET_REEL` 消息。后台只接受 Instagram 内容脚本的 `OPEN_REEL_DRAWER`，校验消息类型、真实来源、点击时提交的当前 Reel 地址与 shortcode 或达人主页地址与用户名；页面内导航后不能依赖可能过期的 `sender.url` 路径或无权限读取的 `tab.url`。插件图标只通知当前标签页的内容脚本打开抽屉。不扩大权限。
5. 不使用 `eval`、动态执行远程代码或把页面文字作为 HTML 注入。展示文字写入 `textContent`；外链校验协议，使用 HTTPS 与 `noopener noreferrer`。

## 数据与页面生命周期

1. 用 `Reel` 和 `ReelReply` 作为采集端到记录页的数据契约。无法取得的值用 `null`，界面显示 `—`；作者、视频标记用户和 caption 的 @提及分别保存，不能混为一类。发布时间只取页面提供的时间戳，统一保存为 UTC ISO 8601，展示时按浏览器本地时区格式化。转发数优先读取 `repost_count` 等明确的转发字段，再兼容 `reshare_count`。不要估算播放、点赞、评论或转发数。
2. 网络响应只读取可能包含 Reel 的 JSON，并限制体积与缓存条数。不要持久化页面原始响应或用户资料。
3. Instagram 使用页面内导航和预加载视频。始终按当前 URL 或视口中的视频确认 shortcode，不能把上一个 Reel 的缓存展示为当前视频。
4. 页面加载、未打开 Reel、字段缺失和扩展更新后的状态都要在记录页中明确显示。页面结构变更时，优先修改解析模块并补对应样例。
5. 悬浮按钮在 Reel 详情页、达人主页及其 Reels 标签页显示；Reel 采集结果必须与当前 shortcode 一致，未取得数据持续显示加载，切换时短暂读取异常保持加载，持续异常显示错误。按钮可在视口内拖动，页面内切换视频时保留位置；拖动不能误触点击。使用 Shadow DOM 隔离站点样式，点击后打开当前页面的常驻抽屉，抽屉只由用户主动关闭。

## 代码与注释

1. **每个新写或修改的函数、方法都在声明前加中文注释**，一句话说明用途。复杂分支、遍历或回退逻辑再用中文注释解释原因与边界；简单代码不写逐行复述。
2. 入口保持薄；解析、DOM 读取、状态控制和渲染各归其层。共享类型集中定义，不复制数据结构。
3. 先复用项目现有代码与平台 API，不为少量逻辑添加依赖、抽象层或配置项。
4. 修改数据模型时同步检查调用方、记录页、测试样例和 README；保持错误处理、字段缺失处理与安全校验。
5. 记录页使用 `components.json` 中配置的 shadcn/ui 组件和 Tailwind v4 主题。优先复用已有 Button、Badge、Avatar、Separator、Skeleton；不要把普通页面组件写进入口，也不要混用第二套组件系统。

## 验证

提交前运行 `npm run typecheck`、`npm test`、`npm run build`。涉及 Instagram 页面结构或记录页展示的变更，能访问实际 Reel 时还应手动检查加载、切换视频和缺失字段；无法实际验证时明确记录限制。

## CodeGraph

若仓库根目录存在 `.codegraph/`，定位或理解代码时先用 `codegraph explore "问题或符号"`（或对应 MCP 工具），再使用文本搜索。没有该目录则直接使用 `rg`。

参考：[Chrome 内容脚本](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)、[Chrome 消息安全](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)、[Chrome 最小权限](https://developer.chrome.com/docs/extensions/develop/security-privacy/user-privacy)、[WXT 入口约定](https://wxt.dev/guide/essentials/entrypoints)。
