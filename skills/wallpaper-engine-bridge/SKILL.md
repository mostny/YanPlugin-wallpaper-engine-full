---
name: wallpaper-engine-bridge
description: 浏览 Wallpaper Engine 创意工坊与本地壁纸，把视频/图片壁纸导入 Yan Agent 壁纸库并应用；管理已导入壁纸、修复黑屏/卡顿的旧视频壁纸。用户提到 Wallpaper Engine、壁纸引擎、创意工坊壁纸、把 WE 壁纸设为 Yan 壁纸时使用。
---

# Wallpaper Engine 壁纸桥接

把本机 Wallpaper Engine 的壁纸导入 Yan Agent 壁纸系统。工具由本插件的本地 MCP 服务暴露，描述前缀为 `[Wallpaper Engine 壁纸桥接 / wallpaper-engine / <工具名>]`，按工具名后缀识别调用。

## 新手教程

用户问「怎么安装/怎么用/浏览器面板怎么打开/新手教程在哪」时，指向插件资源 `TUTORIAL.md`（Yan 插件页 → 插件详情 →「新手教程」），或包内 `TUTORIAL.md`；`README.md` 是完整使用说明。不要把它当成模型工作流。

## 关键事实

- Yan 壁纸库：JPG/PNG/MP4/WebM，单文件 ≤ 50MB，最多 48 个自定义条目。
- WE `video` 类 → 完整动态视频导入，但**统一转为壁纸安全规格**：H.264 / 8-bit yuv420p / 最长边 ≤1920px / ≤60fps / ≤24Mbps / 无音轨。4K、HEVC、10-bit 不会被原样塞给 Yan。
- 每个视频生成同名 `*.poster.jpg` 静态备用图；内置 renderer 守护逻辑在视频解码失败或卡住 9 秒时自动显示备用图，避免黑屏。
- 转码失败、无 ffmpeg 且视频超限时，自动改用静态备用图（`fallbackStatic` 默认 true）。返回结果 `media.fallbackFromVideo` 与 `fallbackReason` 说明原因。
- WE `scene`/`web` 类 → **自动从 scene.pkg/项目目录提取高清原图**（静态，可达 4K），而非缩略预览图；仅当无高清原图时退回预览图。面板里的 `preview.gif` 可能播放动画，但导入的是静帧，不要把它当成动态壁纸。导入结果的 `media.resolution`/`media.quality` 会标明实际清晰度。
- 极少数纯 .tex 纹理场景（如 Black Hole）无法提取高清原图，只能退回预览图，清晰度有限——如实告知用户，可建议换视频类壁纸。
- 导入后**打开 Yan 设置页或重启应用才生效**（内置面板导入会即时刷新），务必告知用户。
- 预览图路径（previewPath）可用读图工具直接展示给用户挑选。

## 自助挑选（优先推荐）

用户想自己浏览、挑选、导入时：调用 `we_open_gallery`，会在浏览器打开本地自选面板（127.0.0.1:43197）。
面板里可搜索/过滤、看预览图、点击「导入并应用 / 仅入库 / 移除 / 一键修复视频兼容性」，全程无需口述。
面板 30 分钟无操作自动关闭；再次调用本工具会重新打开。后端启动后也可以手动访问 `http://127.0.0.1:43197`。

## 对话式流程（用户直接指定壁纸时）

1. **环境检查**：调用 `we_status`。
   - 若 `wallpaperEngineInstalls`/`workshopDirs` 为空：请用户确认 WE 已安装并订阅壁纸，或在插件配置填写 `steamLibrary`（Steam 库根目录，如 `D:\Steam`）。
   - 若 `yanConfigFound=false`：请用户确认 Yan Agent 运行过，或配置 `yanDataDir`。
   - `ffmpeg.available=false` 时：普通 MP4 仍可原样导入；>50MB 或不兼容视频会降级为静态备用图，提前说明。

2. **浏览挑选**：调用 `we_list_wallpapers`（可加 `query` 关键词、`type` 过滤）。
   - 向用户展示候选：标题、类型、大小、note；需要时用读图工具展示 `previewPath` 预览。
   - 用户未指定时，优先推荐 `type=video` 且 `importable=true` 的条目（动态效果最好）。
   - 用户说「随便/推荐一个」：选一个体积适中（<50MB）的视频壁纸。

3. **导入应用**：调用 `we_import_wallpaper`，传 `id`；用户给了昵称则传 `name`。
   - 默认 `apply=true`、`mode=auto`、`fallbackStatic=true`。
   - 用户只想入库不应用：`apply=false`。
   - 场景类壁纸用户仍想要动态效果时：说明提取的是高清静态原图，动态需选视频类壁纸。
   - 大视频转码可能耗时较长（工具调用上限 120 秒，内部预算 105 秒）；超时/失败会自动降级静态图。仍要动态可换更小的视频或安装 ffmpeg。

4. **汇报结果**：告知导入成功、壁纸昵称、是否已应用、实际分辨率/是否转码/是否用了备用图，并明确说明「打开设置页或重启 Yan 后生效」。失败时原样转述错误原因与可行替代（preview 模式 / 安装 ffmpeg / 清理壁纸库）。

## 修复旧视频（黑屏、卡顿、播不动）

用户反馈之前导入的 WE 视频黑屏/卡顿/只有第一帧时：

1. 调用 `we_list_imported` 看 `needsFix`、`technical`（编码/分辨率/帧率）与 `posterExists`。
2. 调用 `we_optimize_imported`（不传 id 修复全部视频；传 `id` 只修一个）。它会把 4K/HEVC/10-bit 重新转成 1080p H.264、补备用图；当前壁纸会被原子替换。
3. 若 `ffmpeg.available=false`，先让用户安装 ffmpeg 或配置 `ffmpegPath`，否则只能跳过重编码。
4. 修复只替换文件、不改昵称和选中状态。打开设置页或重启后使用新文件。

## 内置设置页（we_embed，推荐）

用户想把功能直接做进 Yan「设置 → 壁纸」页时，用 `we_embed`：
- `action:"install"`：把后端复制到 `YanData/we-bridge`，并改 Yan 程序本体——main.js 自启动钩子、index.html 注入界面脚本、renderer.js 视频守护、styles.css 清理旧遮罩覆盖（unpacked 方式，备份+语法校验+验证+自动回滚）。重启 Yan 后，壁纸设置页会出现「Wallpaper Engine」面板：浏览/搜索/导入/应用/修复/移除 + 遮罩开关。
- `action:"restore"`：完全还原 Yan 原始程序。
- `action:"status"`：查询是否已内置。

首次使用先看 `we_status.embedded`。如果为 false 且用户希望和设置页整合：
1. 先说明这会修改 Yan 的 app.asar、需要重启 Yan、有备份和失败回滚。
2. 用户同意后调用 `we_embed install`；也可以让用户打开浏览器自选面板，点顶部的「内置到设置页」按钮（同样需要确认 + 重启）。
3. 不想改 app.asar 就跳过，继续用浏览器面板/MCP 工具；功能不受影响。

**边界**：改的是 Yan 核心文件（非标准插件能力）；**Yan 升级后失效，需重新 install**；重启生效。安装前确保用户已知情同意。重新 install 是幂等的，不会重复注入。

## 主题遮罩与材质强度滑杆（we_scrim）

Yan 的「材质强度」滑杆会写入 `--wall-scrim / --mat-*` 变量。插件提供固定遮罩模式，但**不再修改 app.asar/styles.css**；模式由内置面板运行时应用，并把选择保存在 `YanData/we-bridge/scrim-mode.json`。

- `action:"status"`：查询当前模式（none/scrim/fusion/full）。
- `action:"restore"`（**跟随滑杆**，推荐）：清除固定样式，Yan 的「材质强度」滑杆立即恢复正常，可自己调壁纸明显度。
- `action:"off"`：固定去掉壁纸全屏遮罩；**会接管材质强度滑杆**。
- `action:"fusion"`：固定壁纸通透 + 消息/报告玻璃卡；**会接管材质强度滑杆**。
- `action:"full"`：壁纸 + 面板全通透，文字可读性可能下降；**会接管材质强度滑杆**。

模式切换**即时生效，不需要重启 Yan**。`off/fusion/full` 用 `!important` 覆盖 Yan 的材质变量，所以滑杆在固定模式下不会改变壁纸明显度——这是固定效果的代价；用户抱怨“滑杆没用/明显度调不了”时，先执行 `restore`。

**边界**：
1. 遮罩模式本身不改 `app.asar`，也不怕 Yan 升级。
2. 内置面板/视频守护仍通过 `we_embed` 注入；**Yan 升级后需重新 install**。保存的遮罩模式会保留。
3. 内置 WE 面板始终有可读玻璃背景，`full` 不会把面板文字一起弄糊。
4. 若模式接口返回错误，先确认内置后端是否在运行（`/api/scrim`）；可调用 `we_open_gallery` 重建面板。

## 管理

- 查看已导入：`we_list_imported`。
- 修复：`we_optimize_imported`。
- 移除：`we_remove_imported`（传 entry id；`deleteFile=true` 同时删视频与备用图）。移除当前壁纸会恢复默认背景。
- 重复导入同一 WE 壁纸会替换旧条目（不会占满 48 个名额）。

## 注意

- 导入期间提醒用户不要同时在 Yan 设置页保存设置（配置写入冲突）。
- 不直接读写 YanData/config.json 或修改应用目录；全部通过工具完成。
- 壁纸声音始终静音是 Yan 的固定行为，无需尝试开启。
- 视频统一 1080p 是刻意的性能取舍，不要向用户承诺 4K 动态壁纸。