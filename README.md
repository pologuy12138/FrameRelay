# FrameRelay (VideoTalk)

轻量级、自托管的视频通话服务。通过 Canvas 截图 + WebSocket 中继实现跨平台视频通话。

> 如果你也在寻找一个无需注册、打开即用的自建视频聊天方案，这个项目应该很适合你。

---

## 特性

- **极简部署** — 单 Node.js 文件 + Nginx，Docker 镜像仅 ~180MB
- **跨平台** — 所有现代浏览器均可使用（Chrome / Safari / Edge / Firefox）
- **固定房间** — 访问即入，无需创建或分享房间链接
- **两人聊天室** — 同时最多 2 人在线，第 3 人被拒绝
- **网络状态** — 实时显示上传/下载速率
- **无依赖** — 不依赖任何第三方服务（STUN / TURN / 信令）

### 与原版区别

本项目采用 **Canvas 截图 + JPEG 传输** 而非传统的 WebRTC，原因：

| 方案 | 优点 | 缺点 |
|------|------|------|
| WebRTC P2P | 延迟低、带宽省 | **从中国境内 UDP 受限，无法建连** |
| MediaRecorder + MediaSource | 压缩率高 | 各浏览器 codec 不兼容，iOS Safari 无法播放 |
| **Canvas + JPEG（本项目）** | **全平台兼容、实现简单** | 带宽略高（~1-2 Mbps） |

---

## 快速开始

### 方式一：Docker + Nginx（外网 HTTPS）

适合有域名、需要外网访问的用户。

```bash
# 1. 克隆项目
git clone https://github.com/你的用户名/FrameRelay.git
cd FrameRelay

# 2. 修改配置
#    将 nginx.conf 中的 DOMAIN 全部替换为你的域名
#    例如：sed -i 's/DOMAIN/你的域名/g' nginx.conf

# 3. 第一次先申请 SSL 证书
docker compose run --rm certbot certonly --webroot \
  -w /var/www/certbot -d 你的域名

# 4. 启动服务
docker compose up -d

# 5. 访问
#    https://你的域名:8444
```

### 方式二：纯 Node.js（内网 / NAS）

适合群晖、威联通等 NAS 内网部署，或套已有反代。

```bash
docker compose -f docker-compose.app-only.yml up -d
```

访问 `http://你的NAS-IP:3050`。如需外网访问，在 NAS 的反代管理后台配置：

- 来源：你的域名 / HTTPS 端口
- 目标：http://127.0.0.1:3050
- ✅ 开启 WebSocket 支持

### 方式三：本机运行（无 Docker）

```bash
npm install
npm start
```

访问 `http://localhost:3050`。

---

## 架构

```
浏览器 A ──WebSocket (TCP)──→ 服务器 ──WebSocket (TCP)──→ 浏览器 B
    │                            │                            │
    ├ Canvas 截图 → JPEG        ├ 转发 JPEG 数据             ├ <img> 显示
    ├ 每 100ms 一帧              └ Node.js (ws 库)           └ 展示对方画面
    └ 通过 WS 发送                                             更新率 10fps
```

全程走 **TCP**，不依赖 UDP，在中国境内可正常连通。

---

## 配置说明

### 限制聊天室人数

编辑 `server.js`，修改 `MAX_PEERS` 值：

```javascript
const MAX_PEERS = 2;  // 改为 4 则允许 4 人同时在线
```

### 修改端口

- 纯 Node.js 模式：编辑 `server.js` 中的 `PORT`（默认 3050）
- Docker + Nginx 模式：编辑 `docker-compose.yml` 中 nginx 的端口映射

### 编码参数

编辑 `public/index.html` 中的常量：

```javascript
const FPS = 10;          // 帧率（帧/秒），调低可减少带宽
// CV.toBlob(..., 'image/jpeg', 0.4)  // 0.4 = JPEG 质量（0-1），调低可减少带宽
```

---

## 项目结构

```
FrameRelay/
├── server.js                 # 信令 + 中继服务（Node.js）
├── package.json
├── Dockerfile                # Docker 镜像构建
├── docker-compose.yml        # 完整方案（Nginx + SSL）
├── docker-compose.app-only.yml # 纯净方案（仅 Node.js）
├── nginx.conf                # Nginx 反代配置模板
├── .dockerignore
├── public/
│   └── index.html            # 前端页面（所有逻辑在此）
└── README.md
```

---

## 故障排查

### 1. 页面反复显示"连接服务器"→"断开"

**现象**：页面能加载，状态在"连接服务器"和"断开"之间反复切换。

**原因**：WebSocket 握手被反向代理切断。

**群晖 NAS 反代修复方法**：

在 **控制面板 → 登录门户 → 高级 → 反向代理** 中编辑你的规则，在"自定义标题"中添加：

| 标头名称 | 标头值 |
|---------|--------|
| `Upgrade` | `$http_upgrade` |
| `Connection` | `$connection_upgrade` |
| `X-Forwarded-For` | `$proxy_add_x_forwarded_for` |

这三条是 WebSocket 代理的关键，缺少则连接无法保持。

**Nginx 修复方法**（如果自己配 Nginx）：

```nginx
location / {
    proxy_pass http://127.0.0.1:3050;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 86400s;
    proxy_send_timeout 86400s;
}
```

### 2. 页面一直卡在"连接服务器..."

**现象**：页面停留在"连接服务器..."，状态不再变化。

**原因**：WebSocket 从未成功建立，或浏览器卡在 getUserMedia 权限请求。

**检查**：

- 确保域名/端口正确（内网用 `http://NAS-IP:3050`，外网需先确认反代配好）
- 浏览器是否弹出了摄像头权限提示？如果不点允许或拒绝，8 秒后会超时降级
- 浏览器开发者工具 Console 中是否有红色错误信息

### 3. iPhone 看不到对方画面

已通过 Canvas + JPEG 方案彻底解决。如果还不行：

- 检查"接收中"状态是否出现 — 没出现说明 WebSocket 数据没到
- 刷新页面，确保两端都在同一个房间（页面顶部显示"2 人在线"）

### 4. 对方画面比例失调（被拉伸）

已修复。Canvas 截图尺寸会自动匹配手机摄像头的原始宽高比（16:9 / 4:3 / 20:9 等）。

### 5. Docker 构建失败：找不到 Dockerfile

```bash
# 确保你在项目根目录（有 Dockerfile 的那个目录）
ls -la Dockerfile
docker compose -f docker-compose.app-only.yml up -d
```

如果是从 GitHub 下载 ZIP，解压后先 `cd FrameRelay` 进入子目录。

### 6. 如何查看运行日志

```bash
# 查看服务日志
docker logs videochat-app

# 持续跟踪
docker logs -f videochat-app
```

日志中会显示 `[main] xxx joined`（有人加入）和 `[main] xxx left`（有人离开），以及转发的消息数量。

---

## 从 VPS 迁移到 NAS

若你已在本 VPS 上运行此服务，迁移步骤：

1. 在本机打包项目（包含 server.js + public/index.html + package.json）
2. 传到 NAS，执行 `docker compose -f docker-compose.app-only.yml up -d`
3. 在 NAS 反代后台配置 HTTPS + WebSocket 支持
4. 完成

---

## License

MIT
