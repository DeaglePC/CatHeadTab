# Configuration Guide / 配置指南

CatHeadTab 后端通过环境变量配置所有外部服务。所有配置均为**可选**：
- 不配置 SMTP → 注册时跳过邮箱验证，密码重置不可用
- 不配置 GitHub/Google OAuth → 前端自动隐藏对应的 SSO 按钮
- 不配置微信公众号 → 前端自动隐藏「微信登录」按钮

All backend services are configured via environment variables. Every setting is **optional**:
- No SMTP → email verification is skipped on registration; password reset is unavailable
- No GitHub/Google OAuth → the frontend automatically hides the corresponding SSO buttons
- No WeChat Official Account → the frontend automatically hides the "WeChat login" button

---

## Environment Variables / 环境变量总览

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_DSN` | `postgres://catheadtab:...@localhost:5432/catheadtab?sslmode=disable` | PostgreSQL connection string |
| `JWT_SECRET` | `dev-secret-change-me` | JWT signing secret — **change in production!** |
| `PORT` | `8080` | Server listen port |
| `GIN_MODE` | `debug` | Gin framework mode: `debug` / `release` / `test` |
| `FRONTEND_URL` | `http://localhost:5173` | Frontend URL (used in email links and Google OAuth callback) |
| `BACKEND_URL` | *(empty)* | Backend public URL (used as OAuth redirect_uri) |
| **SMTP** | | |
| `SMTP_HOST` | *(empty)* | SMTP server address |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | *(empty)* | SMTP auth username |
| `SMTP_PASSWORD` | *(empty)* | SMTP auth password |
| `SMTP_FROM` | `noreply@catheadtab.com` | Sender address |
| **OAuth** | | |
| `GITHUB_CLIENT_ID` | *(empty)* | GitHub OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | *(empty)* | GitHub OAuth App Client Secret |
| `GOOGLE_CLIENT_ID` | *(empty)* | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | *(empty)* | Google OAuth Client Secret |
| **WeChat 公众号** | | |
| `WECHAT_TOKEN` | *(empty)* | Token from 服务器配置 (callback signature) — **enables WeChat login** |
| `WECHAT_APP_ID` | *(empty)* | Official Account AppID — optional, only for 安全/兼容 mode |
| `WECHAT_AES_KEY` | *(empty)* | 43-char EncodingAESKey — only for 安全/兼容 mode (empty = 明文 mode) |
| `WECHAT_QR_IMAGE_URL` | *(empty)* | Optional runtime override of the bundled QR asset (`frontend/src/assets/wechat-qr.png`) |
| `WECHAT_ACCOUNT_NAME` | *(empty)* | Account display name shown as a search hint (optional) |
| `WECHAT_AI_REPLY` | *(empty)* | `true` = hand non-login messages back to the official AI reply (keeps AI working in 开发模式) |
| **Wallpaper** | | |
| `WALLHAVEN_API_KEY` | *(empty)* | Wallhaven API key (optional; SFW works without it) |
| `WALLHAVEN_PURITY` | `sfw` | Allowed purity levels: `sfw`, `sketchy`, `nsfw` (comma-separated) |
| `COS_SECRET_ID` | *(empty)* | Tencent Cloud COS Secret ID |
| `COS_SECRET_KEY` | *(empty)* | Tencent Cloud COS Secret Key |
| `COS_BUCKET` | *(empty)* | COS bucket name |
| `COS_REGION` | *(empty)* | COS region (e.g. `ap-guangzhou`) |
| `COS_ORIGINAL_PREFIX` | *(empty)* | COS key prefix for full-size images |
| `COS_THUMB_PREFIX` | *(empty)* | COS key prefix for thumbnails |
| **Token TTL** | | |
| `EMAIL_VERIFY_TOKEN_TTL_HOURS` | `24` | Email verification token lifetime (hours) |
| `PASSWORD_RESET_TOKEN_TTL_HOURS` | `1` | Password reset token lifetime (hours) |
| `JWT_TOKEN_TTL_DAYS` | `30` | JWT login token lifetime (days) |
| `TOKEN_CLEANUP_INTERVAL_HOURS` | `6` | Expired token cleanup interval (hours) |
| **Pro Membership** | | |
| `PRO_GATE_ENABLED` | `false` | Enable Pro role gating (set `true` for SaaS) |
| `PRO_FREE_UNTIL` | *(empty)* | ISO 8601 datetime; users registered before this get Pro automatically |
| **Logging** | | |
| `LOG_LEVEL` | `info` | Minimum log level: `debug` / `info` / `warn` / `error` |
| `LOG_FILE` | *(empty)* | Log file path (empty = console only) |
| `LOG_MAX_SIZE_MB` | `100` | Max size of a single log file before rotation (MB) |
| `LOG_MAX_AGE_DAYS` | `30` | Max days to retain old log files |
| `LOG_MAX_BACKUPS` | `10` | Max number of old log files to keep |
| `LOG_COMPRESS` | `false` | Gzip compress rotated log files |

---

## 1. SMTP Email / SMTP 邮件服务

SMTP 用于发送**邮箱验证**和**密码重置**邮件。如果不配置，这两个功能将静默跳过。

SMTP is used for **email verification** and **password reset** emails. If not configured, these features are silently skipped.

### Gmail Example

1. Go to [Google Security Settings](https://myaccount.google.com/security)
2. Enable 2-Step Verification
3. Go to [App Passwords](https://myaccount.google.com/apppasswords)
4. Generate a 16-character app password

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=abcd efgh ijkl mnop    # 16-char app password
SMTP_FROM=noreply@yourdomain.com
```

### Common Providers / 常见邮件服务商

| Provider | SMTP_HOST | SMTP_PORT |
|----------|-----------|-----------|
| Gmail | `smtp.gmail.com` | `587` |
| Outlook / Hotmail | `smtp.office365.com` | `587` |
| QQ Mail | `smtp.qq.com` | `587` |
| 163 Mail | `smtp.163.com` | `465` |
| Alibaba Enterprise Mail | `smtp.mxhichina.com` | `465` |
| Mailgun | `smtp.mailgun.org` | `587` |
| SendGrid | `smtp.sendgrid.net` | `587` |

> **Important:** `FRONTEND_URL` must be set to the actual frontend address (e.g. `https://tab.example.com`). Email verification/reset links are built from this URL.

---

## 2. GitHub SSO

### Step 1 — Create GitHub OAuth App

1. Go to [GitHub Developer Settings → OAuth Apps](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Fill in:

| Field | Value | Notes |
|-------|-------|-------|
| Application name | `CatHeadTab` | Displayed during authorization |
| Homepage URL | `https://tab.example.com` | Your frontend URL |
| Authorization callback URL | `https://tab.example.com` | Frontend URL (receives code) |

4. Get **Client ID** from the app details page
5. Click **Generate a new client secret** (shown once — save it!)

### Step 2 — Set Environment Variables

```env
GITHUB_CLIENT_ID=Iv1.xxxxxxxxxxxx
GITHUB_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### How It Works

```
User clicks "Sign in with GitHub"
    ↓
Frontend redirects to GitHub authorization page (with client_id)
    ↓
User authorizes → GitHub redirects back to frontend (with code)
    ↓
Frontend POSTs code → Backend /api/v1/auth/github
    ↓
Backend exchanges code for access_token via GitHub API
    ↓
Backend fetches GitHub user info → Creates/links account → Returns JWT
```

---

## 3. Google SSO

### Step 1 — Create Google OAuth Credentials

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Create or select a project
3. Click **Create Credentials** → **OAuth client ID**
4. Application type: **Web application**
5. Fill in:

| Field | Value |
|-------|-------|
| Name | `CatHeadTab` |
| Authorized JavaScript origins | `https://tab.example.com` |
| Authorized redirect URIs | `https://tab.example.com/oauth/callback` |

> **The Google redirect URI must match exactly.** The backend callback URL is `{FRONTEND_URL}/oauth/callback`, so your Google Console entry must match `FRONTEND_URL` + `/oauth/callback`.

6. Get **Client ID** and **Client Secret**

### Step 2 — Enable APIs

Ensure these APIs are enabled in Google Cloud Console:
- **Google+ API** or **People API** (for user info)

Path: [APIs & Services → Library](https://console.cloud.google.com/apis/library) → Search "People API" → Enable

### Step 3 — Set Environment Variables

```env
GOOGLE_CLIENT_ID=xxxxxxxxxxxx-xxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx
```

### How It Works

```
User clicks "Sign in with Google"
    ↓
Frontend redirects to Google authorization page (with client_id + redirect_uri)
    ↓
User authorizes → Google redirects to {FRONTEND_URL}/oauth/callback (with code)
    ↓
Frontend POSTs code → Backend /api/v1/auth/google
    ↓
Backend exchanges code for access_token via Google API
    ↓
Backend fetches Google user info → Creates/links account → Returns JWT
```

---

## 4. WeChat Official Account login / 微信公众号关注 + 验证码登录

用户在登录框点「微信登录」→ 后端生成一个**验证码** → 用户微信扫码关注公众号后，**在公众号对话里发送该验证码**
→ 微信把这条文本消息推送到后端回调 → 后端用验证码匹配到本次会话、绑定 openid 完成登录或注册 → 前端轮询拿到 JWT
自动登录。已登录用户也可在个人中心扫码绑定/解绑微信。

The user clicks "Continue with WeChat" → the backend issues a short **verification code** → the user
follows the Official Account and **sends that code as a chat message** → WeChat pushes the text message to
the backend callback → the backend matches the code to the pending session, binds the openid, and logs the
user in (creating an account on first use) → the frontend polls and receives the JWT.

> **为什么是「发验证码」而不是「带参二维码」？** 带参数二维码（`qrcode/create`）需要**微信认证**，而个人主体
> 无法认证。本方案只用「接收文本消息 + 被动回复」，**个人未认证订阅号即可正式使用**，全程后端不调用任何微信
> 出站接口（无需 AppSecret / access_token）。开发自测也可直接用
> [测试号](https://mp.weixin.qq.com/debug/cgi-bin/sandboxinfo)。
>
> *Why "send a code" instead of a parametric QR?* `qrcode/create` requires WeChat verification (个人主体
> can't get it). This flow only uses passive message receive/reply, so a **personal unverified subscription
> account works**. The backend makes no outbound WeChat calls (no AppSecret / access_token needed).

### Step 1 — 配置服务器回调（服务器配置）

公众号后台 → **设置与开发 → 基本配置 → 服务器配置（开发模式）**（测试号为「接口配置信息」）：

| 字段 | 值 |
|------|-----|
| URL（服务器地址） | `{BACKEND_URL}/api/v1/auth/wechat/callback` |
| Token | 自定义字符串，与 `WECHAT_TOKEN` 一致 |
| EncodingAESKey | 安全/兼容模式需要，与 `WECHAT_AES_KEY` 一致（明文模式可随机生成、环境变量留空） |
| 消息加解密方式 | 明文 / 兼容 / 安全 任选，后端均支持 |

> `BACKEND_URL` 必须公网可达。本地开发可用 [ngrok](https://ngrok.com/) / [cpolar](https://www.cpolar.com/)
> 等内网穿透工具把 `http://localhost:8080` 暴露到公网，再把隧道地址填到 URL。

点击「提交」时微信会向该 URL 发起一次 GET 校验（`echostr`），后端会校验签名并回显。提交后需在「服务器配置」**启用**。

### Step 2 — 环境变量

```env
# 必填：启用微信登录、校验回调签名
WECHAT_TOKEN=your_custom_token
# 选填：仅安全/兼容模式用于校验消息 appid
WECHAT_APP_ID=wxxxxxxxxxxxxxxxxx
# 选填：仅安全/兼容模式需要；明文模式留空
WECHAT_AES_KEY=
# 选填：公众号永久二维码图片地址（从公众号后台下载后自行托管），展示给用户扫码关注
WECHAT_QR_IMAGE_URL=
# 选填：公众号名称，没有二维码图片时提示用户搜索关注
WECHAT_ACCOUNT_NAME=
# 选填：设为 true，把"非验证码"消息交还官方AI回复（见下方"保留官方AI"）
WECHAT_AI_REPLY=
```

> 公众号永久二维码：前端已内置一张二维码图片 `frontend/src/assets/wechat-qr.png`，
> 把它替换成你自己公众号的二维码即可（构建时自动打包）。如需运行时覆盖，可把图片托管后填到
> `WECHAT_QR_IMAGE_URL`。

### 保留官方AI回复 / Keep the official AI reply

启用「服务器配置（开发模式）」后，**所有**用户消息只发到你的服务器，公众号后台的「AI回复 / 自动回复 / 自定义菜单」默认失效（一条消息只能投递到一个地方）。

设置 `WECHAT_AI_REPLY=true` 后，回调会这样分流：

- 消息**长得像验证码**（6 位、限定字符集）→ 走登录/绑定；
- **其它任何消息** → 回复被动消息 `MsgType=transfer_biz_ai_ivr`，把消息**交还给微信官方AI回复**。

这样「扫码登录」和「官方AI自动回复」就能在同一个公众号上并存。

> 前提（微信侧）：公众号需已开启**官方AI回复**功能且AI已学习完历史文章；该能力目前在**灰度**中。
> 参考：[被动回复用户消息 · 转接AI回复](https://developers.weixin.qq.com/doc/subscription/guide/product/message/Passive_user_reply_message.html)
>
> 留空 / 不设 `WECHAT_AI_REPLY` 时，非验证码消息不自动回复（只保证登录可用）。

### Flow / 登录流程

```
User clicks "Continue with WeChat"
    ↓
Frontend: POST /api/v1/auth/wechat/login → { code, session, qr_image_url, account_name }
    ↓
Frontend shows the account QR + the code, polls GET /api/v1/auth/wechat/poll?session=...
(session is an opaque high-entropy id; the human code is only sent to WeChat, never used to poll)
    ↓
User follows the account, then sends the code in the chat
    ↓
WeChat POSTs the text message to /wechat/callback
    ↓
Backend matches code → openid, creates/links user, generates JWT, marks session confirmed
    ↓
Frontend poll returns { status: "confirmed", token, user } → signed in
```

WeChat-only accounts have no email and are created with `email_verified = true` (the provider already
authenticated the user), so they are not blocked by the email-verification gate. The username is a random
`wx_xxxxxxxx` (the nickname API requires verification); users can rename later from their profile.

---

## 5. Verify Configuration / 验证配置

```bash
# Health check
curl http://localhost:8080/api/v1/health

# Check OAuth config (returns client_id, never secrets)
curl http://localhost:8080/api/v1/auth/oauth-config
# Expected: {"github_client_id":"Iv1.xxx","google_client_id":"xxx.apps.googleusercontent.com","wechat_enabled":true}
# Empty strings / wechat_enabled=false mean that login method is not configured; frontend hides those buttons automatically.
```
