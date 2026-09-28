# Video Subtitle Overlay

一个用来给网页里的 `video` 加载本地或在线字幕并覆盖显示的浏览器插件。

## 功能

- 自动识别当前页面中的视频元素
- 支持同域、跨域、嵌套和动态加载的 iframe 播放器；字幕和面板显示在播放器所在的 frame 内
- 默认不在任何网站启用，按站点单独开启
- 未启用时只监听站点开关，启用后才创建面板和扫描视频；关闭时释放视频监听和 DOM 观察器
- 在视频右上角悬浮一个“字幕”按钮
- 支持加载本地字幕文件：
  - `.srt`
  - `.vtt`
  - `.ass`
  - `.ssa`
  - `.json`，格式为 `[{ "start": 1.2, "end": 3.4, "text": "..." }]`
- 支持加载在线字幕直链，例如 `.srt` / `.vtt` 地址
- 在视频上方覆盖渲染字幕
- 支持调整字幕样式和时序：
  - 字体颜色
  - 背景颜色
  - 背景透明度
  - 字体大小
  - 通过按钮以 `0.5s` 步进调整字幕提前或延后
- 支持在面板的“预览”页签中查看和滚动浏览字幕时间线，高亮会和当前播放位置同步
- 字幕列表按可视区域渲染，长字幕不会一次创建全部行；隐藏面板时停止列表刷新
- 点击字幕可选中并查看全文，点击“跳转到这句”按当前校准跳转到视频时间
- 支持“这句现在说”一键对齐，以及前后两句的两点校准，修正逐渐累积的时间差
- 字体、颜色、背景、隐私开关、历史和收藏在已启用的标签页及 iframe 间同步；后台按操作顺序保存，避免不同页面的修改互相覆盖
- 设置保存到 `chrome.storage.local`

## 工程结构

```text
.
├── src/
│   ├── manifest.json
│   ├── content.js
│   └── content.css
├── scripts/
│   └── build.mjs
├── dist/
│   └── chrome/      # 构建输出，加载扩展时用这个目录
├── package.json
├── .gitignore
└── README.md
```

## 开发

```bash
npm run build
```

构建后会生成：

```text
/Users/leoon/Documents/video-subtitle-overlay-extension/dist/chrome
```

Chrome 或 Edge 里加载扩展时，选择这个 `dist/chrome` 目录。

## Release 安装

如果你是从 GitHub Release 下载插件：

1. 下载 `video-subtitle-overlay-extension.zip`
2. 先解压 zip 文件
3. 打开 Chrome 或 Edge 的扩展管理页
4. 打开“开发者模式”
5. 选择“加载已解压的扩展程序”
6. 选择解压后的目录

不要直接选择 zip 文件本身，必须先解压后再加载。

## 使用方式

1. 在项目根目录执行 `npm run build`
2. 打开扩展管理页
3. 打开“开发者模式”
4. 选择“加载已解压的扩展程序”
5. 选择 `/Users/leoon/Documents/video-subtitle-overlay-extension/dist/chrome`
6. 打开任意带有 `video` 的网页
7. 左键点击浏览器顶部扩展图标
8. 在弹窗里查看当前网站，并打开“在当前网站启用”开关
9. 鼠标移动到视频区域，点击右上角“字幕”按钮
10. 选择本地字幕文件，或粘贴在线字幕直链后点击“加载链接”
11. 通过“字幕提前 0.5s”或“字幕延后 0.5s”按钮微调时序
12. 切换到“字幕”页签，查看当前字幕高亮和后续台词，手动滚动后可点击“跟随播放”

## 字幕时间校准

- **整体早了或晚了**：在字幕列表选中即将说出的台词，听到这句开始时点击“这句现在说”。选句本身不会跳转视频；需要跳转时使用“跳转到这句”。
- **越播越不同步**：在靠前的一句说出时选中并点击“标记第一句”，再在靠后的一句说出时选中并点击“标记第二句并校准”。两个点同时确定整体偏移和时间比例，间隔较远的台词更适合校准。
- **恢复原时间**：点击“重置时间校准”。原有 0.5 秒微调仍可使用。
- 时间校准只影响当前播放器，不同步到其他影片。开启保留记录后会随当前页面的字幕来源保存；重新加载同一份本地字幕可继续使用记住的校准，换另一份字幕或清空字幕会重置校准。
- 两点校准适合匀速累积的时间差；片源有删减或插播造成的突然错位，需要分段重新对齐。

## Git

当前目录已经是一个 Git 仓库。发布时不需要提交 `dist/`，推荐通过 GitHub Release 下载打包产物。

推送版本 tag 后，GitHub Actions 会自动：

- 执行 `npm run package:release`
- 生成 `dist/release/video-subtitle-overlay-extension.zip`
- 从 `CHANGELOG.md` 提取当前 tag 对应的更新说明
- 生成 `dist/release/release-notes.md`
- 上传到对应的 GitHub Release

发布前，在 `CHANGELOG.md` 增加一个与 tag 匹配的段落，例如：

```md
## v1.1.0

- 新增字幕菜单
- 优化当前字幕高亮
```

`.gitignore` 已忽略：

- `dist/`
- `node_modules/`
- `.DS_Store`

## 说明

- 某些站点如果使用复杂自定义播放器或特殊全屏层，按钮定位可能还需要针对性适配。
- 当前逻辑优先选择鼠标悬停的视频，否则选择页面中可见面积最大的 `video`。
- 站点开关按 hostname 保存，例如 `www.youtube.com` 和 `m.youtube.com` 会分别记录。
- iframe 播放器跟随地址栏网站的开关，无需单独启用播放器域名；刷新页面或后加载的 iframe 也会读取这个开关。每个 frame 独立选择视频和加载字幕。
- 开启保留记录后，iframe 的字幕记忆按外层页面和播放器地址共同保存，避免不同页面的空白播放器误恢复同一字幕；同一页面中地址相同的多个 frame 仍共用记忆。
- 较小的 iframe 中，字幕面板会限制高度并支持滚动；快捷键在播放器所在的 frame 获得焦点时使用。
- 更新扩展后，需要在扩展管理页重新加载，并刷新已打开的视频页面，新的 iframe 注入配置才会生效。
- iframe 内播放器容器全屏可保留字幕；浏览器原生 `video` 全屏、画中画和不允许扩展注入的页面仍可能无法显示 HTML 字幕层。
- 在线字幕需要可直接访问的文本文件链接；如果目标站点本身有鉴权或防盗链限制，可能无法下载。

## iframe 回归测试

`npm test` 包含站点继承和异步状态更新测试。另有真实浏览器测试覆盖 iframe 注入、字幕显示、短面板、播放器容器全屏和开关切换；需自行准备 `playwright-core` 和支持加载扩展的 Chromium / Chrome for Testing：

```bash
VSO_PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core/index.mjs \
VSO_CHROMIUM_EXECUTABLE=/absolute/path/to/chromium \
node tests/iframe-browser.test.mjs
```

测试使用临时浏览器配置和本地页面，不访问外部播放器网站，不影响日常浏览器数据。

相同环境变量下运行 `node tests/optimizations-browser.test.mjs`，可验证按需启动与清理、一万句字幕的可视区域渲染、真实媒体时钟校准、跨页面设置与记录同步以及隐私行为。
