# FrameRelay (VideoTalk)

轻量级、自托管的视频通话服务。视频通过 Canvas 截图 + WebSocket 中继传输，音频通过浏览器原生 WebRTC + TURN TCP 中继传输。

> 如果你也在寻找一个无需注册、打开即用的自建视频聊天方案，这个项目应该很适合你。

---

## 特性

- **极简部署** — 单 Node.js 文件 + Nginx，Docker 镜像仅 ~180MB
- **跨平台** — 所有现代浏览器均可使用（Chrome / Safari / Edge / Firefox）
- **固定房间** — 访问即入，无需创建或分享房间链接
- **两人聊天室** — 同时最多 2 人在线，第 3 人被拒绝
- **网络状态** — 实时显示上传/下载速率
- **音频稳定** — 使用浏览器原生 WebRTC/Opus 音频栈，避免手写音频编解码
- **中国网络友好** — 视频走 HTTPS/WebSocket，音频强制走 TURN TCP，避开 UDP 受限问题

### 与原版区别

本项目采用 **混合架构**，没有把全部音视频都塞进 WebRTC，原因：

| 方案 | 优点 | 缺点 |
|------|------|------|
| WebRTC P2P 视频 | 延迟低、带宽省 | 中国境内 UDP 受限时容易无法建连 |
| MediaRecorder + MediaSource | 压缩率高 | 各浏览器 codec 不兼容，iOS Safari 播放问题多 |
| Canvas + JPEG 视频 | 全平台兼容、实现简单 | 带宽略高（约 1-2 Mbps） |
| **WebRTC + TURN TCP 音频** | **Opus 编码、回声消除、抖动缓冲成熟可靠** | 需要可用的 TURN TCP 服务 |

当前实现：

- **视频**：Canvas 截图 → JPEG → WebSocket/TCP → `<img>` 显示
- **音频**：WebRTC Opus → TURN TCP → `<audio>` 播放

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

> 音频默认使用 `public/index.html` 中配置的 TURN TCP 服务。迁移到自己的 NAS 后，如果不继续使用原 VPS 的 coturn，需要把 `ICE_CONFIG` 改成你自己的 TURN 服务地址、用户名和密码。

### 方式三：本机运行（无 Docker）

```bash
npm install
npm start
```

访问 `http://localhost:3050`。

---

## 架构

```
视频：
浏览器 A ──WebSocket (TCP)──→ 服务器 ──WebSocket (TCP)──→ 浏览器 B
    │                            │                            │
    ├ Canvas 截图 → JPEG        ├ 转发 JPEG 数据             ├ <img> 显示
    └ 每 100ms 一帧              └ Node.js (ws 库)           └ 更新率 10fps

音频：
浏览器 A ──WebRTC/Opus──→ TURN TCP ──WebRTC/Opus──→ 浏览器 B
    │                         │                         │
    ├ 麦克风 MediaStream      ├ coturn 3478/TCP         ├ remote <audio>
    └ 浏览器原生回声消除      └ 不依赖 UDP              └ 浏览器原生解码
```

视频和信令全程走 **HTTPS/WebSocket TCP**。音频强制走 **TURN TCP**，避免 UDP 被运营商限制时无法通话。

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

### 音频 TURN 配置

编辑 `public/index.html` 中的 `ICE_CONFIG`：

```javascript
const ICE_CONFIG = {
  iceServers: [{
    urls: ['turn:你的域名:3478?transport=tcp'],
    username: '你的TURN用户名',
    credential: '你的TURN密码'
  }],
  iceTransportPolicy: 'relay'
};
```

说明：

- `?transport=tcp`：强制使用 TURN TCP，适合 UDP 不稳定或被限制的网络
- `iceTransportPolicy: 'relay'`：强制音频通过 TURN 中继，不尝试 P2P 直连
- 当前项目默认配置指向部署测试用的 VPS TURN 服务；正式迁移到自己的 NAS/VPS 时建议改成自己的 coturn

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

### 5. 音频一直显示 `audio:offer sent` / `PC:new` / `ICE:new`

**现象**：视频正常，但音频状态停在：

```text
audio:offer sent
🎤 audio:⏳ | PC:new | ICE:new
```

**最终排查到的根因**：服务端把 WebRTC 的 JSON 信令误判成了二进制视频帧。

Node.js 的 `ws` 服务端中，浏览器发来的字符串消息在 `data` 形态上也可能是 `Buffer`，但 `isBinary=false`。错误写法：

```javascript
if (isBinary || Buffer.isBuffer(data)) {
  // 错误：会把 wr-offer / wr-answer / wr-can 当成二进制视频帧
}
```

正确写法：

```javascript
if (isBinary) {
  // 只有真正 binary 才转发视频帧
} else {
  const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
  const msg = JSON.parse(text);
}
```

如果看到 `offer sent` 但没有进入 `checking / connected`，优先检查服务端日志中是否出现：

```text
⇄ wr-offer
⇄ wr-answer
⇄ wr-can
```

没有这些日志，说明 WebRTC 音频信令没有被正确解析或转发。

### 6. 音频没有声音，但视频正常

按这个顺序排查：

1. 页面底部是否显示 `🎤 audio:✅ | PC:connected | ICE:connected`
2. 如果停在 `ICE:new`，通常是信令没走通，见上一节
3. 如果停在 `ICE:checking` 后失败，检查 TURN TCP 是否可达
4. 确认浏览器已允许麦克风权限
5. iPhone/Safari 上如果首次播放被拦截，刷新后重新点击允许麦克风

测试 TURN TCP：

```bash
nc -vz 你的TURN域名 3478
```

服务端 coturn 应监听 TCP 3478：

```bash
ss -tlnp | grep 3478
```

### 7. Docker 构建失败：找不到 Dockerfile

```bash
# 确保你在项目根目录（有 Dockerfile 的那个目录）
ls -la Dockerfile
docker compose -f docker-compose.app-only.yml up -d
```

如果是从 GitHub 下载 ZIP，解压后先 `cd FrameRelay` 进入子目录。

### 8. 如何查看运行日志

```bash
# 查看服务日志
docker logs framerelay-app

# 持续跟踪
docker logs -f framerelay-app
```

日志中会显示：

- `[main] xxx joined`：有人加入
- `[main] xxx left`：有人离开
- `⇄ wr-offer / wr-answer / wr-can`：WebRTC 音频信令转发

---

## 从 VPS 迁移到 NAS

若你已在本 VPS 上运行此服务，迁移步骤：

1. 在本机打包项目（包含 server.js + public/index.html + package.json）
2. 传到 NAS，执行 `docker compose -f docker-compose.app-only.yml up -d`
3. 在 NAS 反代后台配置 HTTPS + WebSocket 支持
4. 确认 `public/index.html` 里的 `ICE_CONFIG` 指向可用的 TURN TCP 服务
5. 完成

---

## License

MIT
