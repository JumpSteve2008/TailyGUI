# sillyTaily Desktop — 项目计划书

## 项目概述

将 [SillyTavern](https://github.com/SillyTavern/SillyTavern) 包装为 Windows 桌面应用程序，打包成安装程序 (.exe)，用户无需安装 Node.js 或任何命令行操作，双击即可使用。

---

## 一、技术选型

| 决策项 | 选择 | 理由 |
|---|---|---|
| 桌面框架 | **Electron** | 零改造兼容 ST 的 Node.js 后端；社区已有成功案例 (EazySillyTavern) |
| 集成方式 | **内嵌运行时** | Node.js + ST 源码 + 全部 npm 依赖打包进安装包，用户无需任何环境 |
| 外壳功能 | **自动更新** | 通过 GitHub Releases 检测和下载新版本 |
| 目标平台 | **Windows (NSIS 安装程序)** | 覆盖最广用户群 |
| 开发语言 | **TypeScript** | 类型安全，与 ST 前端技术栈一致 |
| 构建工具 | **pnpm + Vite + electron-builder** | 快、节省磁盘、生态成熟 |

### 为什么是 Electron 而非 Tauri？

- SillyTavern 后端是纯 Node.js（Express 服务器），包含大量 Node.js 特有的 API（如 `fs`、`path`、`child_process`、tokenizers 等）
- Tauri 后端是 Rust，需要将整个 ST 后端逻辑重写，工作量巨大且难以跟随上游更新
- Electron 可以直接 `spawn` 运行 ST 的 `server.js`，上游更新只需替换源码

---

## 二、项目结构

```
TailyGUI/
├── package.json                  # 项目根配置 (pnpm workspace)
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── tsconfig.json                 # TypeScript 基础配置
├── tsconfig.main.json            # Main 进程 tsconfig
├── tsconfig.preload.json         # Preload 脚本 tsconfig
├── electron-builder.yml          # electron-builder 打包配置
├── electron.vite.config.ts       # Vite 构建配置
├── .github/
│   └── workflows/
│       └── build.yml             # CI 构建 + 自动发布
├── src/
│   ├── main/                     # Electron 主进程
│   │   ├── index.ts              # 入口：创建窗口、生命周期管理
│   │   ├── st-server.ts          # ST 服务管理器（spawn Node 子进程）
│   │   ├── sandbox.ts            # 沙箱隔离：profile 管理、端口分配、锁文件
│   │   ├── updater.ts            # 自动更新逻辑 (electron-updater)
│   │   └── ipc.ts                # IPC 通信 handler
│   ├── preload/
│   │   └── index.ts              # contextBridge 暴露 API 给渲染进程
│   └── renderer/                 # (预留：以后可添加自定义外壳 UI)
├── resources/
│   ├── icons/                    # 应用图标 (.ico, .png)
│   └── extra/                    # 打包时附加的资源文件
├── scripts/
│   └── bundle-st.js              # 预处理 ST：安装依赖、准备打包资源
├── vendor/
│   └── SillyTavern/              # ST 源码（git submodule 或直接内嵌）
└── dist/                         # 构建输出
```

---

## 三、架构流程

```
用户双击 sillyTaily.exe [--profile <name>]
    │
    ▼
┌───────────────────────────────────────────┐
│         Electron Main Process             │
│                                           │
│  1. 解析 CLI 参数，确定 profile 名称      │
│     (默认 "default")                      │
│                                           │
│  2. 获取 profile 实例锁                   │
│     ├─ 锁空闲 → 写入 PID + 时间戳        │
│     └─ 锁被占用 → 弹窗提示 "该 profile    │
│        已在运行" + 自动激活已有窗口       │
│                                           │
│  3. 分配隔离端口                          │
│     profile 上次使用的端口优先，          │
│     被占用则自动找下一个可用端口          │
│                                           │
│  4. 分配隔离数据目录                      │
│     DATA_ROOT  = profiles/{name}/data/    │
│     CONFIG_DIR  = profiles/{name}/        │
│                                           │
│  5. 启动沙箱化的 Node 子进程              │
│     node <resources>/st-src/server.js     │
│     --port {端口}                          │
│     --dataRoot {profile数据目录}           │
│     --configRoot {profile配置目录}         │
│     --listen false                        │
│                                           │
│  6. 轮询 http://localhost:{port} 等待就绪 │
│     (最多等待 30 秒，超时显示错误)         │
│                                           │
│  7. 创建 BrowserWindow → 加载 ST 页面     │
│                                           │
│  8. 注册自动更新检查 (electron-updater)   │
│     对接 GitHub Releases                 │
└───────────────────────────────────────────┘
    │
    ▼
┌───────────────────────────────────────────┐
│         BrowserWindow (渲染进程)           │
│                                           │
│  SillyTavern 原版前端 (public/)           │
│  所有功能、扩展、API 完全保留不变         │
└───────────────────────────────────────────┘
```

### 生命周期事件

```
app.whenReady()
  → 初始化日志 (electron-log)
  → 解析 CLI 参数 → 确定 profile 名称
  → sandbox.acquireLock(profileName)
      ├─ 成功 → 继续
      └─ 冲突 → app.requestSingleInstanceLock 风格：
            激活已有窗口并退出当前进程
  → sandbox.allocatePort(profileName)    # 动态端口 + 复用上次端口
  → sandbox.ensureProfileDirs(profileName) # 创建隔离目录
  → 启动 ST Server 子进程 (注入隔离环境变量)
  → 等待服务就绪
  → 创建 BrowserWindow
  → 注册 autoUpdater

window.on('close')
  → 保存窗口大小/位置
  → 向 ST Server 发送 SIGTERM
  → 等待子进程退出 (最多 5 秒，超时 SIGKILL)

app.on('window-all-closed')
  → sandbox.releaseLock(profileName)  # 删除锁文件
  → app.quit()

app.on('before-quit')
  → 确保子进程已终止
  → sandbox.releaseLock(profileName)
```

---

## 四、核心模块设计

### 4.1 `st-server.ts` — ST 服务管理器

```
职责：
  - child_process.spawn 启动 ST server.js 子进程
  - 接收 sandbox.ts 分配好的端口和数据路径
  - HTTP 健康检查轮询（GET /），等待 ST 服务就绪
  - 管理 stdout/stderr 日志输出
  - 进程崩溃自动重启（最多 3 次，每次间隔 2 秒）
  - 窗口关闭/应用退出时优雅关闭子进程

注意: st-server.ts 不负责端口分配和数据隔离，
       这些由 sandbox.ts (4.2) 在上游完成。

Extra Resources 路径映射：
  开发模式:  vendor/SillyTavern/
  打包模式:  process.resourcesPath + '/st-src/'

环境变量注入 (由 sandbox.ts 提供):
  PORT         = {sandbox 分配的端口}
  DATA_ROOT    = %APPDATA%/sillyTaily/profiles/{name}/data
  CONFIG_PATH  = %APPDATA%/sillyTaily/profiles/{name}/config.yaml
  LISTEN       = false                           (仅监听 localhost)
```

### 4.2 `sandbox.ts` — 沙箱隔离机制 ★核心安全模块

#### 设计目标

确保多个 sillyTaily 实例可以同时运行而互不干扰。每个实例绑定一个 **Profile**，Profile 之间数据、端口、配置完全隔离。

#### 隔离维度

```
┌─────────────────────────────────────────────────────┐
│                   隔离边界矩阵                        │
├───────────┬──────────────┬────────────────────┬──────┤
│   维度     │  隔离方式     │  默认值/策略        │  冲突│
├───────────┼──────────────┼────────────────────┼──────┤
│ 端口       │ 动态分配      │ 8000 起始, 向上搜寻 │ 不允许│
│ 数据目录    │ per-profile   │ profiles/{name}/data │ 不允许│
│ 配置文件    │ per-profile   │ profiles/{name}/config│ 不允许│
│ 扩展/插件   │ per-profile   │ data/default-user/   │ 不允许│
│ Webpack缓存 │ per-profile   │ data/_webpack/       │ 不允许│
│ 锁文件      │ per-profile   │ profiles/{name}/.lock│ 不允许│
│ 进程        │ per-instance  │ PID                  │ 不允许│
└───────────┴──────────────┴────────────────────┴──────┘
```

#### Profile 目录结构

```
%APPDATA%/sillyTaily/
├── profiles.json                  # 全局 profile 注册表
├── app-settings.json              # 全局设置 (窗体位置、语言等)
├── logs/
│   └── main.log                   # 全局 electron 日志
├── profiles/
│   ├── default/                   # 默认 profile (v1 单实例向后兼容)
│   │   ├── .lock                  # 实例锁 { pid, port, timestamp, hostname }
│   │   ├── config.yaml            # ST 配置 (从 default/config.yaml 初始化)
│   │   └── data/                  # ST DATA_ROOT (完整用户数据树)
│   │       ├── _webpack/          # webpack 编译缓存
│   │       ├── _storage/          # node-persist KV 存储
│   │       ├── _uploads/          # 临时上传
│   │       ├── cookie-secret.txt  # session cookie 密钥
│   │       ├── heartbeat.json     # Docker 心跳 (未使用，保留兼容)
│   │       └── default-user/      # 用户数据
│   │           ├── settings.json
│   │           ├── secrets.json
│   │           ├── characters/
│   │           ├── chats/
│   │           ├── groups/
│   │           ├── extensions/
│   │           └── ... (28 个子目录)
│   └── <custom>/                  # 用户自定义 profile
│       ├── .lock
│       ├── config.yaml
│       └── data/
│           └── ...
```

#### 锁文件机制

```
加锁流程 (acquireLock):
  1. 读取 profiles/{name}/.lock
  2. 如果 .lock 不存在 → 写入 { pid, port, timestamp, hostname } → 返回成功
  3. 如果 .lock 存在:
     a. 检查 PID 是否存活 (process.kill(pid, 0))
        ├─ PID 存活 → 同一 profile 已在运行
        │   ├─ 锁定窗口存在 → 激活已有窗口 → 退出当前进程
        │   └─ 锁定窗口不存在 (异常) → 覆盖锁 (force acquire)
        └─ PID 不存活 → 僵尸锁，清理 .lock → 返回第 2 步

释放流程 (releaseLock):
  1. 发送 SIGTERM 给 ST 子进程
  2. 等待子进程退出
  3. 删除 profiles/{name}/.lock

异常保护:
  - SIGKILL / 电源断电 → 残留 .lock
  - 下次启动检测 PID 是否存活自动清理
  - 超时强制清理：timestamp 超过 24h 且 PID 不存在
```

#### 端口分配策略

```
allocatePort(profileName):
  1. 读取 profiles/{name}/.lock 中记录的 port
     如果存在 → 检查端口是否可用
     如果可用 → 复用该端口 (保持重启后地址不变)
  2. 不可用 → 从 8000 开始递增检测
     每找到一个候选端口: net.createServer().listen() 测试
     找到可用端口 → 记录到 .lock
  3. 返回端口号

关键: port 存储在 .lock 文件中，与 profile 绑定，
      不同的 profile 必定分配到不同端口。
```

#### 环境变量注入

```
spawn ST 子进程时注入:

  PORT          = {分配到的端口}
  DATA_ROOT     = %APPDATA%/sillyTaily/profiles/{name}/data
  CONFIG_PATH   = %APPDATA%/sillyTaily/profiles/{name}/config.yaml
  LISTEN        = false
  WHITELIST     = false
  CSRF_DISABLED = false
```

#### profiles.json 全局注册表

```json
{
  "version": 1,
  "profiles": {
    "default": {
      "name": "Default",
      "createdAt": "2025-07-16T12:00:00Z",
      "lastUsedAt": "2025-07-16T21:00:00Z",
      "lastPort": 8000
    },
    "work": {
      "name": "Work",
      "createdAt": "2025-07-16T14:00:00Z",
      "lastUsedAt": "2025-07-16T18:00:00Z",
      "lastPort": 8001
    }
  }
}
```

#### 冲突场景处理矩阵

| 场景 | 行为 |
|---|---|
| 默认启动 (无 --profile) | 使用 "default" profile |
| 启动 --profile work (work 空闲) | 正常启动，独立数据 |
| 启动 --profile work (work 已在运行) | 弹窗 "Profile 'Work' is already running" → 激活已有窗口 |
| 同一 profile 异常退出后重启 | 自动清理僵尸锁，正常启动 |
| 启动 --profile new (首次) | 自动创建 profile 目录 + 初始化 config.yaml |
| 同时启动 default + work | 两个独立实例，不同端口，不同数据 |
| Ctrl+C 或窗口关闭 | 正常退出发送 SIGTERM → 清理 .lock |

### 4.3 `updater.ts` — 自动更新

```
使用 electron-updater，对接 GitHub Releases：
  - 应用启动 5 秒后静默检查更新
  - 检查频率：每 4 小时一次
  - 有新版本 → 通知弹窗，显示版本号和 changelog
  - 用户确认 → 显示下载进度条
  - 下载完成 → 用户确认 → 退出安装并自动重启
  - 可选：用户可在设置中关闭自动更新

发布流程：
  1. GitHub Actions 触发构建
  2. electron-builder 打包 NSIS 安装器 + latest.yml
  3. 发布到 GitHub Releases
  4. electron-updater 读取 latest.yml 检测更新
```

### 4.4 `index.ts` — 主进程入口

```
核心职责：
  - 应用生命周期管理 (app ready / quit / window-all-closed)
  - 单实例锁 (app.requestSingleInstanceLock)
  - BrowserWindow 创建和配置
  - 加载页面时的错误处理（连接失败、超时）
  - 窗口状态记忆（位置、大小、最大化状态）

BrowserWindow 配置：
  - 最小尺寸: 1024×700
  - 默认尺寸: 1280×800
  - 标题: "sillyTaily"
  - 图标: resources/icons/icon.png
  - 背景色: #1e1e1e (避免白屏闪烁)
  - 支持 DevTools（仅在开发模式）
```

---

## 六、UI 设计规范

### 6.1 外壳风格：Fluent Design (WinUI 3)

选定 Microsoft Fluent Design System 作为外壳 UI 的设计语言，理由：
- Windows 11 原生质感，与系统设置/文件资源管理器一致的视觉体验
- 与 ST 自身暗色主题自然融合（Fluent 拥有成熟的 Dark Mode）
- 亚克力/Acrylic 材质在标题栏形成层次感，不抢夺 ST 内容区注意力
- 圆角窗口 + 细腻阴影，区别于传统 Electron 方框窗口

### 6.2 设计要素

| 要素 | 实现方式 | 说明 |
|---|---|---|
| **Mica 材质标题栏** | Electron `BrowserWindow` + DWM API (Win11) | 半透明材质，取桌面壁纸色调，窗口获得深度感 |
| **Acrylic 亚克力** | 弹窗/设置面板背景 | 模糊 + 噪点纹理，类似原生 WinUI 对话框 |
| **圆角窗口** | Win11 自动圆角 (DWM corner preference) | 系统级圆角，非 CSS hack |
| **暗色主题** | Fluent Dark 色板 | `#1f1f1f` 主背景, `#2d2d2d` 卡片, `#0078d4` 强调色 |
| **图标** | Segoe Fluent Icons (系统字体) | 设置、刷新、关闭、下载等图标直接使用系统原生图标字体 |
| **字体** | Segoe UI Variable (Win11) / Segoe UI (Win10) | 系统 UI 字体，9pt 正文，8pt 辅助 |

### 6.3 色板

```
Fluent Dark 色板:
  页面背景:    #1f1f1f    (与 ST 背景接近)
  卡片/面板:   #2d2d2d    (稍亮于背景，区分层次)
  悬浮:        #3d3d3d    (hover 状态)
  边框:        #404040    (分割线)
  主强调色:    #0078d4    (按钮、开关、链接)
  辅助强调色:  #60cdff    (hover 主按钮)
  文字主色:    #ffffff    (标题/正文)
  文字辅色:    #aaaaaa    (说明文字)
  文字禁用:    #666666    (禁用状态)
  成功:        #6bb700
  警告:        #f7630c
  错误:        #d13438
```

### 6.4 标题栏布局 (Frameless)

```
┌──────────────────────────────────────────────────┐
│  🏷 sillyTaily — Default                ─ ❏ ✕   │  ← Mica 材质, 36px 高
│  ═══════════════════════════════════════════════ │  ← 1px 分割线
│                                                    │
│                                                    │
│         ┌──────────────────────┐                   │
│         │  SillyTavern  Web UI │                   │  ← ST 原版界面,
│         │  (内嵌 BrowserView)  │                   │     完全不变
│         │                      │                   │
│         └──────────────────────┘                   │
│                                                    │
└──────────────────────────────────────────────────┘

标题栏元素:
  - 左: 应用图标 (16px) + "sillyTaily" (Segoe UI, 10pt) +
         Profile 名称标签 (胶囊形, 可点击切换)
  - 右: 最小化 / 最大化 / 关闭 原生窗口按钮 (12px icons)
```

### 6.5 弹窗样式 (设置/更新)

```
┌─────────────────────────────┐
│ ⚙ Settings              ✕   │  ← Acrylic 标题栏
│ ════════════════════════════ │
│                              │
│  Appearance                  │  ← 左侧导航 (仅图标)
│  ├ Theme         [Dark ▼]   │
│  ├ Language      [EN  ▼]   │  ← 右侧内容区
│                              │    背景: #2d2d2d
│  Updates                     │    圆角: 8px
│  ───────────────────────     │
│  ☑ Auto-check for updates   │
│  [  Check Now  ]            │
│                              │
│  About                       │
│  Version 1.0.0               │
│                              │
│                       [OK]  │
└─────────────────────────────┘
```

### 6.6 更新通知 Toast

```
┌──────────────────────────────────┐
│  🔔 New version 1.1.0 available  │  ← Acrylic 面板
│     ────────────────────────     │     右上角滑入
│     [Release Notes]  [Update]    │     3 秒后自动消失
└──────────────────────────────────┘
```

---

## 七、打包方案

### 7.1 electron-builder 配置

```yaml
# electron-builder.yml
appId: com.sillytaily.desktop
productName: sillyTaily
copyright: Copyright © 2025

directories:
  buildResources: resources
  output: dist

extraResources:
  # SillyTavern 源码 + 依赖
  - from: bundle/st-src/
    to: st-src/
    filter:
      - "**/*"
      - "!**/.git"
      - "!**/node_modules/.cache"
  # 内嵌 Node.js 运行时（Windows 便携版）
  - from: bundle/node/
    to: node/

files:
  - "out/**/*"
  - "package.json"

win:
  target:
    - target: nsis
      arch: [x64]
  icon: resources/icons/icon.ico

nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  installerIcon: resources/icons/icon.ico
  uninstallerIcon: resources/icons/icon.ico
  installerHeaderIcon: resources/icons/icon.ico
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: sillyTaily

publish:
  provider: github
  owner: <your-org>
  repo: TailyGUI
  releaseType: release
```

### 7.2 关键路径映射

| 场景 | ST 源码路径 | Node.js 路径 | 用户数据路径 (带沙箱) |
|---|---|---|---|
| 开发 (`pnpm dev`) | `vendor/SillyTavern/` | 系统安装的 Node.js | `vendor/SillyTavern/data-dev/{profile}/` |
| 打包 (`pnpm build`) | `process.resourcesPath/st-src/` | `process.resourcesPath/node/node.exe` | `%APPDATA%/sillyTaily/profiles/{profile}/data/` |

### 7.3 打包流程

```
pnpm build 执行顺序：
  1. pnpm prepare:st        # 安装 ST 依赖 → bundle/st-src/
  2. pnpm prepare:node      # 下载 Node.js 便携版 → bundle/node/
  3. tsc -p tsconfig.main.json  # 编译 main 进程 TypeScript
  4. electron-builder       # 打包 NSIS 安装程序
                             # 输出: dist/sillyTaily-Setup-x.x.x.exe
                             #       dist/latest.yml
```

---

## 八、开发阶段

### Phase 0: 项目搭建

- [ ] pnpm init + 安装 Electron、Vite、TypeScript
- [ ] tsconfig 配置 (main / preload)
- [ ] electron-vite 集成
- [ ] 基础 Electron 窗口运行 (`pnpm dev`)
- [ ] 引入 SillyTavern 为 git submodule

### Phase 1: 核心集成 + 沙箱

- [ ] 实现 `sandbox.ts` — profile 管理、端口分配、锁文件机制
- [ ] 实现 `st-server.ts` — 子进程启动与健康检查
- [ ] 实现 BrowserWindow 加载 ST 页面
- [ ] 多实例测试：同时启动 2+ 不同 profile、验证数据隔离
- [ ] 同一 profile 重复启动 → 激活已有窗口
- [ ] 异常退出后僵尸锁自动清理
- [ ] 窗口状态记忆 (electron-store)
- [ ] 错误处理：连接超时、启动失败
- [ ] 应用图标与基础 UI 打磨

### Phase 2: 打包

- [ ] electron-builder 配置
- [ ] prepare:st 脚本（安装 ST 依赖到 bundle 目录）
- [ ] prepare:node 脚本（下载 Node.js 便携版）
- [ ] NSIS 安装器配置（安装目录选择、快捷方式）
- [ ] 测试全流程：安装 → 运行 → 卸载

### Phase 3: 自动更新

- [ ] electron-updater 集成
- [ ] 更新检测 → 通知 → 下载 → 安装 流程
- [ ] GitHub Actions CI 配置
  - 触发条件：推送 tag `v*.*.*`
  - Matrix: windows-latest
  - 构建 → 打包 → 上传到 GitHub Releases
- [ ] 测试自动更新全流程

### Phase 4: 打磨发布

- [ ] 应用图标设计 (256×256 .ico + .png)
- [ ] 崩溃日志收集 (electron-log)
- [ ] 首次启动引导页（可选）
- [ ] README 编写

---

## 九、后续扩展 (v2+)

以下功能按优先级排列，不在 v1 范围内：

| 优先级 | 功能 | 说明 |
|---|---|---|
| P0 | 系统托盘 + 最小化到托盘 | 常驻后台，不影响任务栏 |
| P0 | macOS / Linux 支持 | 扩展到 .dmg / AppImage / deb |
| P1 | 开机自启动 | 可配置的随系统启动 |
| P1 | 原生菜单栏 | 文件/编辑/视图/帮助菜单 |
| P1 | Profile 管理 GUI | 可视化创建/切换/删除 profile（当前仅 CLI） |
| P1 | 便携版 (.exe) | 免安装，随身携带 |
| P2 | 离线模式 | 无网络时缓存界面，仍然可打开 |
| P2 | 移动端 (Android APK) | 长期目标 |

---

## 十、参考项目

| 项目 | 技术栈 | 参考价值 |
|---|---|---|
| [EazySillyTavern](https://github.com/yuman07/EazySillyTavern) | Electron 42 + Node 24 LTS + electron-builder | **最直接参考** — 相同的架构思路 |
| [TauriTavern](https://github.com/Darkatse/TauriTavern) | Tauri v2 + Rust | 前端桥接方案参考 |
| [sillytavern-desktop](https://github.com/zionfuo/sillytavern-desktop) | Electron | 功能设计参考 |
| [SillyTavern Official](https://github.com/SillyTavern/SillyTavern) | Node.js + Express + Webpack | 上游本体 |

---

> 最后更新: 2025-07-16
