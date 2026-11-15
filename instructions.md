# Wallpaper Engine 壁纸桥接

把用户本机 Wallpaper Engine（Steam 应用 431960）的创意工坊订阅壁纸与本地项目壁纸，导入 Yan Agent 的壁纸系统并应用。

## 资源

- `TUTORIAL.md`：面向用户的新手教程（安装、打开浏览器面板、导入、内置设置页、遮罩、常见问题）。用户问怎么用时指向它。
- `README.md`：完整使用说明。

## 何时使用

用户提到「Wallpaper Engine / 壁纸引擎 / 创意工坊壁纸」并希望 Yan 界面用上这些壁纸时，读取 `wallpaper-engine-bridge` 技能并按其流程执行。用户抱怨导入的视频黑屏、卡顿、无法播放时，也使用本插件修复。

## 能力与边界（已按 Yan 源码核实）

- Yan 自定义壁纸仅支持 JPG/PNG 图片与 MP4/WebM 视频，单文件 ≤ 50MB，壁纸库上限 48 个；媒体文件必须位于 `YanData/uploads`。
- 视频导入时统一转换为壁纸安全规格：H.264 High / 8-bit yuv420p / 最长边 ≤1920px / ≤60fps / ≤24Mbps / 无音轨。4K、HEVC、10-bit、4:2:2 视频不会再原样导入，避免 Chromium 解码黑屏或卡顿。
- 每个视频生成同名 `*.poster.jpg` 静态备用图；内置注入的 renderer 守护逻辑在解码失败/卡住时自动显示备用图。
- 转换失败或没有 ffmpeg 且视频超限时，自动改用静态备用图（`fallbackStatic` 默认 true），导入结果会带 `fallbackFromVideo` 与原因。
- Wallpaper Engine 的 `video` 类壁纸可直接导入视频；`scene`/`web` 类自动从 scene.pkg/项目目录提取高清原图（静态，可达 4K），无原图时退回预览图。
- 超过 50MB 的视频在检测到 ffmpeg 时自动压缩；长视频会按目标码率单次转码，避免反复缩小。
- 导入通过写入 `YanData/config.json` 的 `wallpaper` 段完成；**打开 Yan 设置页或重启应用后生效**。内置面板导入会即时刷新。
- 首次使用看 `we_status.embedded`：为 false 且用户想在设置页看到面板时，先说明会修改 `app.asar`、需要重启、有备份/回滚，用户同意后调用 `we_embed install`；浏览器自选面板顶部也有「内置到设置页」按钮。
- 导入写配置期间，避免用户同时在设置页保存设置，防止写入冲突。

## 工具

本插件通过本地 MCP 服务 `wallpaper-engine` 暴露工具（工具描述前缀为 `[Wallpaper Engine 壁纸桥接 / wallpaper-engine / <工具名>]`）：

- `we_status`：环境检测（WE 安装、创意工坊、Yan 配置、ffmpeg/ffprobe、视频策略）。
- `we_open_gallery`：打开浏览器自选面板，用户自己点击挑选导入（推荐）。
- `we_list_wallpapers`：浏览/检索壁纸，返回 id、标题、类型、预览图路径。
- `we_import_wallpaper`：导入并可选应用；视频自动转码 + 生成备用图。
- `we_optimize_imported`：一键修复已导入的 4K/HEVC/旧视频，补齐备用图。
- `we_list_imported`：查看已导入条目、视频编码/分辨率/是否兼容（needsFix）。
- `we_remove_imported`：移除已导入条目（可选删文件与备用图）。
- `we_scrim`：遮罩/材质强度控制。restore=跟随 Yan 的材质强度滑杆（推荐，滑杆可正常调节）；off/fusion/full=固定遮罩，会接管滑杆；status 查询。运行时生效，不修改 app.asar，不需要重启。
- `we_embed`：把面板内置进 Yan 设置页或完全还原（改 Yan 本体，重启生效）。

不要直接编辑 YanData 或应用目录；一切写入都通过上述工具完成。