# Video Subtitle Overlay

一个 用来给网页里的 `video` 加载本地字幕并覆盖显示的浏览器插件。

## 功能

- 自动识别当前页面中的视频元素
- 在视频右上角悬浮一个“字幕”按钮
- 支持加载本地字幕文件：
  - `.srt`
  - `.vtt`
  - `.ass`
  - `.ssa`
  - `.json`，格式为 `[{ "start": 1.2, "end": 3.4, "text": "..." }]`
- 在视频上方覆盖渲染字幕
- 支持调整字幕样式和时序：
  - 字体颜色
  - 背景颜色
  - 背景透明度
  - 字体大小
  - 字幕延迟时间，支持正负毫秒
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
/Users/leoon/Documents/New project/dist/chrome
```

Chrome 或 Edge 里加载扩展时，选择这个 `dist/chrome` 目录。

## 使用方式

1. 在项目根目录执行 `npm run build`
2. 打开扩展管理页
3. 打开“开发者模式”
4. 选择“加载已解压的扩展程序”
5. 选择 `/Users/leoon/Documents/New project/dist/chrome`
6. 打开任意带有 `video` 的网页
7. 鼠标移动到视频区域，点击右上角“字幕”按钮
8. 选择本地字幕文件并调整样式或延迟

## Git

当前目录已经是一个 Git 仓库。现在这个结构适合直接提交：

```bash
git add .
git commit -m "feat: add video subtitle overlay browser extension"
```

`.gitignore` 已忽略：

- `dist/`
- `node_modules/`
- `.DS_Store`

## 说明

- 某些站点如果使用复杂自定义播放器或特殊全屏层，按钮定位可能还需要针对性适配。
- 当前逻辑优先选择鼠标悬停的视频，否则选择页面中可见面积最大的 `video`。
