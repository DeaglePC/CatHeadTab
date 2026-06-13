<div align="center">
  <img src="frontend/store_icon.png" width="128" />

# CatHeadTab

**高颜值、AI 驱动的浏览器新标签页 — 属于你的数字中枢。**

[![Official Website](https://img.shields.io/badge/Website-catheadtab.cn-orange.svg?style=flat-square&logo=icloud&logoColor=white)](https://catheadtab.cn/) [![Chrome Web Store](https://img.shields.io/chrome-web-store/v/mccnfbilnkjfnhfglkfdicddpgjceemj.svg?style=flat-square)](https://chromewebstore.google.com/detail/catheadtab-ai-new-tab/mccnfbilnkjfnhfglkfdicddpgjceemj) [![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg?style=flat-square)](LICENSE) [![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-green.svg?style=flat-square)](https://developer.chrome.com/docs/extensions/mv3/) [![Go](https://img.shields.io/badge/Go-1.25+-00ADD8.svg?style=flat-square)](https://go.dev/) [![React](https://img.shields.io/badge/React-18-61DAFB.svg?style=flat-square)](https://react.dev/) [![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17+-336791.svg?style=flat-square)](https://www.postgresql.org/)

中文 | [English](README_EN.md)

[功能亮点](#功能亮点) | [快速开始](#快速开始) | [自部署](#自部署) | [技术栈](#技术栈) | [许可证](#许可证)

<div align="center">
  <img src=".github/assets/demo2.webp" width="100%" />
  <p><i>智能文件夹整理 — FLIP 动画引擎驱动的丝滑体验</i></p>
</div>

</div>

## 界面预览

| AI 助手 (对话) | AI 助手 (思考) | AI 助手 (移动端) |
| :---: | :---: | :---: |
| ![AI 助手](.github/assets/aiagent1.webp) | ![AI 助手思考](.github/assets/aiagent2.webp) | ![AI 助手移动端](.github/assets/aiagent3.webp) |

| 锁屏界面 | 设置面板 |
| :---: | :---: |
| ![锁屏](.github/assets/lockscreen.webp) | ![设置](.github/assets/setting.webp) |

<div align="center">
  <img src=".github/assets/wallpaper.webp" width="100%" />
  <p><i>壁纸选择 — 支持 Wallhaven 与云端库</i></p>
</div>

| 移动端适配 1 | 移动端适配 2 |
| :---: | :---: |
| ![移动端1](.github/assets/mobile1.webp) | ![移动端2](.github/assets/mobile2.webp) |

---

## 功能亮点

### 桌面体验

<!-- TODO: 添加桌面 GIF -->
<!-- ![桌面](docs/assets/desktop.gif) -->

- **类 iOS/macOS 桌面** — 多页网格布局 + Dock 栏，拖拽排序、拖入合并文件夹、跨页移动，FLIP 动画引擎丝滑过渡
- **锁屏** — 可配置空闲自动锁屏，大时钟显示，上滑/点击解锁
- **多模态搜索栏** — 一键切换 Google、Bing、书签搜索、历史记录搜索、桌面图标过滤

### AI 桌面管家

<!-- TODO: 添加 AI 助手 GIF -->
<!-- ![AI 助手](docs/assets/ai-assistant.gif) -->

真正理解你桌面布局并能执行操作的智能管家 — 不只是聊天。

#### 20 个内置技能

| 分类 | 技能 | 说明 |
|------|------|------|
| **桌面操作** | `listDesktopItems` | 查看桌面所有图标、文件夹、小组件 |
| | `addDesktopItem` | 添加网站快捷方式到桌面 |
| | `removeDesktopItem` | 删除桌面项目 |
| | `createFolder` | 创建新文件夹 |
| | `moveItemToFolder` | 将图标移入文件夹 |
| | `renameItem` | 重命名桌面项目 |
| | `organizeDesktop` | **一键整理桌面** — 自动分析图标 URL 和标题，批量创建分类文件夹并归类 |
| **书签** | `searchBookmarks` | 搜索浏览器书签 |
| | `listBookmarkFolders` | 列出书签文件夹结构 |
| | `getRecentBookmarks` | 获取最近添加的书签 |
| **历史记录** | `searchHistory` | 搜索浏览历史 |
| | `getRecentHistory` | 获取最近访问记录 |
| **设置** | `changeWallpaper` | 通过 URL 更换壁纸 |
| | `changeLanguage` | 切换界面语言（中/英） |
| | `getSystemInfo` | 获取系统配置信息 |
| **热榜资讯** | `getGithubTrending` | GitHub 今日热门仓库 |
| | `getBilibiliHot` | B 站热门视频 |
| | `getWeiboHot` | 微博实时热搜 |
| | `getXiaohongshuHot` | 小红书热搜 |
| | `getBBCNews` | BBC 新闻头条 |

#### 8 大 LLM 提供商

| 提供商 | 默认模型 | Base URL |
|--------|---------|----------|
| OpenAI | `gpt-4o-mini` | `https://api.openai.com/v1` |
| Anthropic | `claude-sonnet-4-20250514` | `https://api.anthropic.com/v1` |
| Google | `gemini-2.0-flash` | `https://generativelanguage.googleapis.com/v1beta/openai` |
| DeepSeek | `deepseek-chat` | `https://api.deepseek.com/v1` |
| 智谱 GLM | `glm-4-flash` | `https://open.bigmodel.cn/api/paas/v4` |
| Kimi (月之暗面) | `moonshot-v1-8k` | `https://api.moonshot.cn/v1` |
| MiniMax | `MiniMax-Text-01` | `https://api.minimax.chat/v1` |
| 通义千问 | `qwen-turbo` | `https://dashscope.aliyuncs.com/compatible-mode/v1` |

所有提供商统一通过 **OpenAI 兼容协议**接入，支持自动拉取 `/models` 列表选择模型。Base URL 和模型均可自定义，兼容任何 OpenAI 兼容 API（如 Ollama、vLLM、LiteLLM 等）。

#### 技术特性

- **流式输出** — 基于 Vercel AI SDK `streamText`，逐字渲染，支持 `<think>` 思考块的折叠展示
- **工具调用链** — 最多 10 步连续工具调用，AI 可以先查看桌面再整理
- **CORS 绕过** — 通过 Chrome 扩展 Service Worker 代理请求，无需后端中转
- **API Key 安全** — 每个提供商的 Key 独立存储在本地，**绝不上传到云端**
- **上下文管理** — 聊天记录本地持久化（最近 50 条），上下文窗口 20 条消息

### 16 种桌面小组件

| 分类 | 小组件 |
|------|--------|
| **时间日期** | 日历、世界时钟（40+ 时区）、倒计时 |
| **生活工具** | 天气（自动定位）、股票行情（美股/港股/A股）、汇率（欧央行数据） |
| **生产力** | 系统监控（CPU/内存）、科学计算器（math.js）、便签（6 种颜色）、IT 工具箱（JSON/Base64/UUID/Hash...）、AI 助手 |
| **资讯热榜** | GitHub Trending、B站热门、微博热搜、小红书热搜、BBC 新闻 |

所有小组件支持 5 种网格尺寸（小/中/大/高/超大）。

### 壁纸系统

- **4 种来源**：内置精选、本地文件夹（File System Access API）、Wallhaven（搜索/排序/分类/纯净度筛选）、腾讯云 COS
- 本地上传自动 WebP 压缩；`idb://` / `cos://` / URL 三协议解析

### 探索世界

- **10,000+ 精选网站**，60 个分类 — 搜索、浏览、一键添加到桌面，或将整个分类以文件夹形式添加

### 账号与云同步

- **5 种认证方式**：邮箱 + 密码、GitHub OAuth、Google OAuth、微信公众号（关注 + 验证码）、CLI 管理员创建
- **智能同步**：基于时间戳自动检测本地/云端变更；布局结构不同时弹出冲突解决面板
- **同步内容**：桌面布局（多页 + Dock）、偏好设置、壁纸（WebP 二进制）、头像

### 自部署友好

- **完全解耦**：前端可连接任意后端 — 官方云服务或你自己的 Homelab/NAS
- **Docker 一键部署**：`docker compose up -d`
- **CLI 用户管理**：免邮件/Web 界面直接创建用户、重置密码、管理角色
- **全部配置可选**：SMTP、OAuth、壁纸 API — 所有功能优雅降级

### 其他亮点

- **双语界面** — 完整中英文国际化
- **书签/历史浏览器** — macOS Finder 风格，树形侧边栏 + 搜索 + 时间筛选
- **扩展弹出窗口** — 一键将当前网页添加到桌面
- **布局导入/导出** — JSON 格式备份和分享桌面
- **智能 Favicon 系统** — 6 源级联 + 磁盘缓存 + 死站自动清理
- **渐进式安全** — 登录渐进式频控、邮箱验证、防枚举、解绑保护

---

## 技术栈

| 层级 | 技术 |
|------|------|
| **前端** | React 18, TypeScript, Vite, Tailwind CSS v4, Framer Motion, Zustand, Vercel AI SDK, @dnd-kit |
| **后端** | Go 1.25+, Gin, jwt-go, zap + lumberjack（结构化日志 + 文件轮转） |
| **数据库** | PostgreSQL 17+（ltree 树形结构, JSONB, GIN 全文搜索） |
| **缓存** | Ristretto（L1 内存 LRU）+ PostgreSQL JSONB（L2 持久化）+ singleflight 防雷群 |
| **部署** | Docker（多阶段构建）, docker-compose |
| **扩展** | Chrome Manifest V3, Service Worker |

---

## 快速开始

### 环境要求

- Node.js v18+
- Go v1.25+
- PostgreSQL v17+（或使用 Docker）

### 开发启动

```bash
# 1. 启动 PostgreSQL（如果本地没有）
docker compose up -d catheadtab-db

# 2. 一键启动前后端
# macOS / Linux:
./dev.sh
# Windows:
.\dev.ps1
```

启动完成：
- 前端页面：`http://localhost:5173`
- 后端 API：`http://localhost:8080/api/v1/health`

### 打包浏览器插件

```bash
cd frontend
npm run build
```

打开 Chrome / Edge 的 `chrome://extensions`，开启「开发者模式」，点击「加载已解压的扩展程序」，选择 `frontend/dist` 目录。

---

## 自部署

### Docker Compose（推荐）

```bash
# 1. 复制并编辑环境变量
cp .env.example .env
vim .env

# 2. 启动所有服务
docker compose up -d
```

`.env` 文件控制所有配置。完整的环境变量参考、SMTP 邮件配置和 OAuth 配置指南见 [docs/configuration.md](docs/configuration.md)。

### CLI 用户管理

自部署时，可通过命令行直接管理用户，无需依赖邮件或 Web 界面。所有命令均为交互式，按提示输入即可。

```bash
# 启动 API 服务器（默认命令，不带参数时自动执行）
./server serve

# 创建新用户（交互式输入用户名、邮箱、密码）
# 通过 CLI 创建的用户自动标记为邮箱已验证 + 管理员角色
./server user create

# 重置用户密码（通过用户名或邮箱查找用户）
./server user reset-password

# 修改用户角色（可选角色：user / pro / admin）
# user = 普通用户，pro = 高级会员（可用 AI 等付费功能），admin = 管理员
./server user set-role
```

**Docker 环境下**，通过 `docker exec` 在运行中的容器内执行 CLI 命令：

```bash
# 创建用户
docker exec -it catheadtab-backend ./server user create

# 重置密码
docker exec -it catheadtab-backend ./server user reset-password

# 修改角色
docker exec -it catheadtab-backend ./server user set-role
```

### 配置要点

所有外部服务均为**可选**，且优雅降级：

| 服务 | 未配置 | 已配置 |
|------|--------|--------|
| SMTP | 注册跳过邮箱验证 | 完整邮箱验证 + 密码重置 |
| GitHub/Google OAuth | SSO 按钮自动隐藏 | 完整 SSO 登录 + 账号关联 |
| 微信公众号 | 「微信登录」按钮隐藏 | 关注 + 验证码登录/注册 + 账号绑定（个人未认证订阅号即可用） |
| Wallhaven API Key | 仅 SFW 壁纸 | SFW + Sketchy 内容 |
| 腾讯云 COS | COS 壁纸源隐藏 | 云端壁纸库可用 |
| 日志文件 (`LOG_FILE`) | 仅控制台输出 | 控制台 + 文件轮转存储 |

---

## 项目结构

```
CatHeadTab/
├── frontend/                  # React Chrome 扩展
│   ├── src/
│   │   ├── ai/               # AI 助手（8 个 LLM 提供商，20 个工具）
│   │   ├── components/        # UI 组件（16 种小组件、弹窗、应用）
│   │   ├── pages/             # 桌面、OAuth 回调、邮箱验证
│   │   ├── store/             # Zustand 状态管理（配置、布局、书签）
│   │   ├── i18n/              # 中英文翻译
│   │   └── utils/             # Favicon 缓存、图片压缩
│   └── public/manifest.json   # Chrome MV3 清单
├── backend/                   # Go API 服务器
│   ├── cmd/server/            # 入口 + CLI 命令
│   ├── internal/
│   │   ├── handler/           # HTTP 处理器（认证、壁纸、热搜、Favicon...）
│   │   ├── service/           # 业务逻辑（Wallhaven、COS、邮件）
│   │   ├── cache/             # 两级壁纸缓存（L1 内存 + L2 PostgreSQL）
│   │   ├── repository/        # PostgreSQL 数据访问
│   │   ├── middleware/         # JWT 认证、CORS、频控
│   │   ├── model/             # 领域模型
│   │   ├── logger/            # 结构化日志（zap + lumberjack）
│   │   └── config/            # 环境变量加载
│   └── migrations/            # 16 个 SQL 迁移文件
├── docker-compose.yml         # 生产部署
├── .env.example               # 环境变量模板
└── docs/
    └── configuration.md       # 完整配置指南（SMTP、OAuth 等）
```

---

## 隐私

CatHeadTab 不收集、传输或出售任何个人数据。所有数据保存在你的设备上，除非你主动开启云同步。AI API Key 仅本地存储，绝不会发送到 CatHeadTab 服务器。完整隐私政策见 [PRIVACY.md](PRIVACY.md)。

---

## 参与贡献

欢迎贡献！请随时提交 Issue 和 Pull Request。

---

## 许可证

本项目基于 [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE) 许可。

你可以自由使用、修改和自部署本软件。如果你修改了源代码并将其作为网络服务提供，你必须以相同许可证向该服务的用户提供修改后的源代码。
