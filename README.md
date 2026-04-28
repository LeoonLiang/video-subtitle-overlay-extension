# Video Subtitle Overlay

一个用来给网页里的 `video` 加载本地或在线字幕并覆盖显示的浏览器插件。

## 功能

- 自动识别当前页面中的视频元素
- 默认不在任何网站启用，按站点单独开启
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
- 支持点击“预览”页签中的某一条字幕，按当前延迟设置跳转到对应视频时间
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
12. 切换到“预览”页签，查看当前字幕高亮和后续台词，手动滚动后可点击“恢复跟随”

## Git

当前目录已经是一个 Git 仓库。发布时不需要提交 `dist/`，推荐通过 GitHub Release 下载打包产物。

推送版本 tag 后，GitHub Actions 会自动：

- 执行 `npm run package:release`
- 生成 `dist/release/video-subtitle-overlay-extension.zip`
- 上传到对应的 GitHub Release

`.gitignore` 已忽略：

- `dist/`
- `node_modules/`
- `.DS_Store`

## 说明

- 某些站点如果使用复杂自定义播放器或特殊全屏层，按钮定位可能还需要针对性适配。
- 当前逻辑优先选择鼠标悬停的视频，否则选择页面中可见面积最大的 `video`。
- 站点开关按 hostname 保存，例如 `www.youtube.com` 和 `m.youtube.com` 会分别记录。
- 在线字幕需要可直接访问的文本文件链接；如果目标站点本身有鉴权或防盗链限制，可能无法下载。
