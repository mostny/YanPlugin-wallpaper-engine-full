# Wallpaper Engine 壁纸桥接（完整版）

让 Yan Agent 的壁纸系统直接使用你 Wallpaper Engine 里的壁纸。

> **完整版**：保留 Yan「设置 → 壁纸」里的 WE 面板、视频守护和遮罩热切换。官方市场核心版不包含这个设置页面板；两个版本不要同时安装（工具名和 43197 端口会冲突）。

> 新手先看 **[TUTORIAL.md](TUTORIAL.md)**：安装、打开浏览器面板、导入、内置到设置页、遮罩模式、常见问题。安装后在 Yan 插件页 → 插件详情 →「新手教程」也能打开。

## 功能

- 浏览创意工坊订阅壁纸与 WE 本地项目（`projects/myprojects`），支持关键词/类型检索
- 一键导入并应用为 Yan 当前壁纸
- **视频统一转成壁纸安全规格**：H.264 / 8-bit / ≤1920px / ≤60fps / ≤24Mbps / 无音轨。4K、HEVC、10-bit 视频不再原样塞给 Yan，避免黑屏、卡顿和无法播放
- **静态备用图**：每个视频导入时生成 `*.poster.jpg`；Yan 内置注入的守护逻辑会在视频解码失败/卡住时自动显示备用图，不再黑屏
- **一键修复旧视频**：旧版本导入的 4K/HEVC 视频可用 `we_optimize_imported` 或面板按钮重新转码，无需重新挑选
- 场景/网页类壁纸**自动提取高清原图**（从 scene.pkg/项目目录，可达 4K）；无原图时退回预览图
- 管理已导入壁纸：查看、移除、替换
- 遮罩控制：`restore` **跟随 Yan 材质强度滑杆**（推荐，滑杆可正常调明显度）；`off` / `fusion` / `full` 为固定效果，会接管滑杆

## 环境要求

- Windows + 已安装 Wallpaper Engine（Steam 431960），并有创意工坊订阅或本地项目
- Yan Agent（壁纸数据位于 `%APPDATA%\yan-agent\YanData`）
- 可选：ffmpeg / ffprobe（用于转码、压缩与生成备用图）
  - 自动从 PATH、winget、scoop、chocolatey、`C:\ffmpeg\bin`、插件目录查找
  - 仍找不到时可在插件配置填写 `ffmpegPath`
  - 没有 ffmpeg 时：普通 MP4/WebM 会原样导入；超过 50MB 或编码不兼容的视频自动改用静态备用图（GIF 预览会用 Windows 原生解码取首帧）

Steam 库与 Yan 数据目录默认自动检测；检测不到时可在插件配置中填写 `steamLibrary` / `yanDataDir`。

## 安装（自己或别人拿到包后）

1. 让 Yan 安装：在 Yan 的插件安装入口（插件页 /「插件与智能体」）选择 `.yan-plugin` 目录——即解压后**直接包含 `yan-plugin.json` 的那一层**；或直接对 Yan 说「安装这个插件」并把目录路径给它（`install_plugin`）。安装后启用插件，必要时重启/刷新 Yan 让 MCP 工具加载。
2. 第一次使用先对 Yan 说「检查 WE 壁纸环境」或调用 `we_status`，确认 Steam 库 / YanData / ffmpeg。
3. 想把它做进 Yan「设置 → 壁纸」页：调用 `we_embed install`，或打开浏览器自选面板点顶部的「内置到设置页」按钮（会弹确认，完成后重启 Yan）。这一步会修改 Yan 的 `app.asar`（有备份、校验、失败自动回滚），重启 Yan 生效；Yan 升级后需要重新 install。只使用聊天/浏览器面板则不需要这一步。
4. 没有 ffmpeg 也能导入普通视频；需要处理大视频 / HEVC / 4K 时再安装 ffmpeg。

> 分发包不包含个人路径或账号信息；`steamLibrary` / `yanDataDir` / `ffmpegPath` 留空会自动检测。

## 兼容性说明（重要）

- 仅 Windows；已在 **Yan 2.0.0-beta.1-rc.1** + **Wallpaper Engine（Steam 431960）** 上验证。
- 浏览、导入、视频转码、备用图、修复、独立自选面板主要依赖 Yan 的壁纸配置和本地文件，跨小版本较稳。
- `we_embed` / 设置页面板 / 视频守护 / 遮罩热切换依赖当前 Yan 的 renderer 结构，属于对 Yan 本体的注入（非官方稳定 API）。Yan 大版本升级后可能失效，需要重新 `we_embed install`；如果 renderer 结构变化较大，可能需要适配新版本。
- `scene` / `web` / `application` 只能导入静态图；`video` 统一转为 1080p / H.264 / ≤60fps / ≤24Mbps / 无音轨。这不是 4K 动态壁纸方案。
- 固定遮罩模式（关闭遮罩 / 融合 / 全透）会接管「材质强度」滑杆；选「跟随滑杆」立即恢复。
- 插件修改 `app.asar` 前会备份；可用 `we_embed restore` 还原。Yan 升级或卸载插件时注意内置补丁状态。

## 使用方式

### 方式一：自选面板（推荐，自己点）

对 Yan 说「打开壁纸自选面板」，Yan 会启动本地后端并打开浏览器面板（`http://127.0.0.1:43197`）；后端启动后也可以手动访问该地址：

- 预览图卡片墙，支持关键词搜索、类型过滤
- 每张卡片一键「导入并应用」或「仅入库」
- 顶部管理已导入壁纸：移除、移除并删文件、**一键修复视频兼容性**
- 面板仅绑定本机回环地址，30 分钟无操作自动关闭

### 方式二：聊天让 Yan 代办

安装启用后，直接对 Yan 说：

- 「把我 Wallpaper Engine 里的壁纸列出来」
- 「把那个纽约夜景的壁纸设为 Yan 壁纸」
- 「随便挑一个 WE 视频壁纸用上」
- 「之前导入的视频有点卡，帮我修复一下」
- 「移除我导入的 WE 壁纸」

## 生效方式与限制

- 导入写入 Yan 配置后，**打开 Yan 设置页或重启应用即可看到新壁纸**。内置面板导入会即时刷新。
- Yan 壁纸规格：JPG/PNG/MP4/WebM，单文件 ≤ 50MB，自定义壁纸上限 48 个，声音始终静音。
- 视频会统一降到最长边 1920px（横屏即 1080p）并去除音轨。这是为了保证在任何显卡上都能稳定循环播放；想要 4K 原画质请直接用 Wallpaper Engine 桌面壁纸。
- WE 场景类（scene.pkg）/网页类壁纸会自动提取内嵌高清原图（静态）；极少数纯 .tex 纹理场景无法提取，退回预览图（清晰度有限）。
- 导入过程中请不要同时在 Yan 设置页保存设置，避免配置写入冲突。
- 每次写入配置前会在 `YanData/config.json.we-bridge.bak` 保留一份滚动备份。

## 主题遮罩与「材质强度」滑杆（we_scrim）

Yan 会按「材质强度」滑杆在壁纸上叠主题色遮罩。插件提供几种固定遮罩模式，但**不再修改 `app.asar/styles.css`**，而是由内置面板在运行时应用，并把选择保存在 `YanData/we-bridge/scrim-mode.json`：

- `restore`（**跟随滑杆**，推荐）：不接管任何东西，Yan 的「材质强度」滑杆完全正常，可自己调壁纸明显度。
- `off`：固定去掉壁纸全屏遮罩，保留面板磨砂；**会接管材质强度滑杆**。
- `fusion`：固定壁纸通透 + 消息/报告玻璃卡；**会接管材质强度滑杆**。
- `full`：壁纸 + 面板全通透，文字可读性可能下降；**会接管材质强度滑杆**。
- `status`：查询当前模式。

**关键点**：

- 模式切换**即时生效，不需要重启 Yan**；点击「跟随滑杆」会立刻把材质强度滑杆的控制权还给 Yan。
- 固定模式会用 `!important` 覆盖 Yan 写入的 `--wall-scrim / --mat-*` 变量，所以滑杆在固定模式下无法改变壁纸明显度——这是固定效果的代价，不是滑杆坏了。
- 内置的 Wallpaper Engine 面板始终保留一层可读玻璃背景，即使选 `full` 也不会把面板文字一起弄糊。
- 这套模式不改 `app.asar`；但内置面板/视频守护仍通过 `we_embed` 注入，**Yan 升级后需要重新执行 `we_embed install`**。保存的遮罩模式会保留。
- 如果发现「材质强度」滑杆没反应，先在面板点「跟随滑杆」（或调用 `we_scrim action=restore`）。

## 常见问题

### 为什么场景壁纸导入后不动？

Wallpaper Engine 的 `scene` / `web` / `application` 类型是实时场景，不是视频文件。Yan 没有运行 WE 场景渲染器的能力，插件只能从 `scene.pkg` / 项目目录提取一张最高清的静态图。面板里的 `preview.gif` 可能会动，那只是预览动画；导入结果仍是静帧。想要动态壁纸请选 `video` 类型（面板筛选“video 动态”）。

### 材质强度滑杆没反应 / 壁纸明显度调不了？

说明当前处于 `off` / `fusion` / `full` 固定遮罩模式，这些模式会接管 Yan 写入的材质变量。在 WE 面板点「跟随滑杆」，或调用 `we_scrim action=restore`，滑杆会立即恢复。

### 视频壁纸黑屏 / 只有第一帧 / 卡顿

1. 先调用 `we_status` 确认 `ffmpeg.available=true`；没有就安装 ffmpeg 或配置 `ffmpegPath`。
2. 运行 `we_optimize_imported`（面板里有「一键修复视频兼容性」）。它会把 4K/HEVC/10-bit 视频重新转成 1080p H.264 并补备用图。
3. 确保已用最新版执行过 `we_embed install`（内置守护逻辑需要注入 renderer）。Yan 升级后也要重打。
4. 仍失败时，重新导入该壁纸并选 `mode="preview"`，先用静态图顶上。

### 视频导入失败但壁纸库显示的是图片

这是自动降级：视频超过 50MB 且没有 ffmpeg，或转码失败时，插件会改用静态备用图。返回结果的 `media.fallbackFromVideo` 与 `fallbackReason` 会说明原因。

## 技术说明

插件包含一个零依赖的本地 MCP 服务（`server.cjs`，由 Yan 的 Node 运行时启动），工具：
`we_status`、`we_open_gallery`、`we_list_wallpapers`、`we_import_wallpaper`、`we_optimize_imported`、`we_list_imported`、`we_remove_imported`、`we_scrim`、`we_embed`。
自选面板由 `gallery.cjs` + `gallery.html` 提供（本地 HTTP，复用同一套导入逻辑与安全校验）。

导入流程与 Yan 官方上传流程一致：媒体复制到 `YanData/uploads`，条目写入 `config.json` 的 `wallpaper.custom`（id 形如 `custom-we-<创意工坊ID>`），并按需设为当前选中。视频旁边的 `*.poster.jpg` 为静态备用图，移除壁纸时会一并清理。