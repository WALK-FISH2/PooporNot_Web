# 部署说明

状态：Draft

本文给出与当前代码兼容的部署方式。代码只确认小程序使用 `https://pp.nuanzhualife.cn`，无法确认线上主机、进程管理和证书的实际配置，因此基础设施细节保持“待确认”。

## 1. 目标拓扑

```text
浏览器 / 微信小程序 / Android
                |
              HTTPS 443
                |
        Nginx 或 Caddy 反向代理
                |
       http://127.0.0.1:5174
                |
          node server.js
             /      \
     高德 Web API   data/metro
```

统一后端同时提供 API 和网页静态文件。生产环境不需要让公网直接访问 Node 的 `5174` 端口。

## 2. 部署前准备

- 可解析到服务器的域名；当前小程序代码使用 `pp.nuanzhualife.cn`。
- 有效 HTTPS 证书和完整证书链。
- Node.js 18 或更高版本。
- 项目根目录完整代码和 `data/metro`。
- 生产 `.env`，不来自版本库。
- 高德 Key 已配置对应服务与域名/来源限制。
- 云安全组开放 80/443；Node 端口只监听本机或限制内网访问。

## 3. 部署统一后端

在服务器项目根目录准备 `.env`：

```env
AMAP_JS_KEY=production-web-js-key
AMAP_SECURITY_JS_CODE=production-security-code
AMAP_WEB_SERVICE_KEY=production-web-service-key
PORT=5174
AMAP_PAGE_DELAY_MS=260
```

启动前检查：

```bash
npm run check
npm start
```

本机健康检查：

```bash
curl http://127.0.0.1:5174/api/health
```

预期：

```json
{"ok":true}
```

当前仓库没有 systemd、PM2、Docker 或容器编排配置。生产环境应选择一种可自动重启并持久记录日志的进程管理方式，实际选择待确认。

## 4. HTTPS 反向代理

以下 Nginx 片段是推荐模板，不代表线上当前配置：

```nginx
server {
    listen 80;
    server_name pp.nuanzhualife.cn;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name pp.nuanzhualife.cn;

    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/private.key;

    location / {
        proxy_pass http://127.0.0.1:5174;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

上线前验证：

```bash
curl https://pp.nuanzhualife.cn/api/health
```

应同时验证证书域名、过期时间、TLS 链、HTTP 到 HTTPS 跳转和 API JSON。

建议由反向代理补充：

- HSTS、`X-Content-Type-Options` 和合理 CSP。
- 请求速率限制与并发限制。
- 访问日志脱敏，避免长期记录精确坐标查询字符串。
- 请求体/响应大小限制和超时。

## 5. 网页发布

`server.js` 从项目根目录提供 `index.html`、`app.js`、`styles.css` 和资源。部署完整项目并访问域名根路径即可加载网页。

网页依赖同源 `/api/config` 和其他 `/api/*`，不需要单独修改 API 基址。必须确认 `AMAP_JS_KEY` 的高德域名白名单包含实际网页域名。

## 6. 微信小程序发布

### 6.1 代码配置

确认 `WhereToPoop/miniprogram/config/api.ts`：

```ts
export const API_BASE_URL = "https://pp.nuanzhualife.cn"
export const DEBUG_METRO_CITY = "";
```

不要发布局域网 IP、`127.0.0.1`、公网 HTTP IP 或调试城市。

### 6.2 微信公众平台

在开发设置中把以下地址加入 `request` 合法域名：

```text
https://pp.nuanzhualife.cn
```

不要附加 `/api` 或端口。上传前在开发者工具关闭“不校验合法域名、TLS 版本以及 HTTPS 证书”，重新编译并真机预览。

### 6.3 发布后更新

小程序 `WhereToPoop/miniprogram/app.ts` 已接入 `UpdateManager`。微信仍采用异步更新机制；新版本下载完成后，应用会提示用户“立即更新”并调用 `applyUpdate()`。

## 7. Android 发布

当前 Android 默认构建地址仍是旧 HTTP IP。正式构建前必须在安全的构建配置中覆盖：

```properties
API_BASE_URL=https\://pp.nuanzhualife.cn/
AMAP_ANDROID_KEY=production-android-key
```

发布前还需：

- 配置 release keystore；不要提交 keystore 或密码。
- 在高德控制台绑定 `com.poopornot.wheretopoop` 与 release SHA1。
- 更新 `versionCode` 和 `versionName`。
- 评估关闭 `usesCleartextTraffic` 和 `network_security_config.xml` 中的明文流量。
- 生成 release APK/AAB 并在真实设备验证定位、地图、API 和外部导航。

当前仓库没有 release signing 配置，Android 实际发布状态待确认。

## 8. 部署后冒烟检查

1. `GET /api/health` 返回 200。
2. `GET /api/config` 返回非空网页 JS Key，但不包含 Web Service Key。
3. 选择一个已知坐标调用 `/api/location/reverse`。
4. 调用 `/api/toilets`，确认 `pois`、`partial` 和响应时间。
5. 调用 `/api/metro/nearby`，确认首次和缓存后响应。
6. 网页地图加载、定位、厕所搜索和路线可用。
7. 小程序关闭域名跳过校验后，定位、厕所、地铁和 `wx.openLocation` 可用。
8. Android 使用 HTTPS 构建，地图、定位、路线与外部导航可用。

## 9. 回滚

- 发布前保留上一版本代码、配置备份和地铁数据快照。
- 后端回滚代码后重启进程；进程内地铁缓存随之清空。
- 不要用旧 `.env` 覆盖已轮换密钥。
- 小程序无法直接让所有用户瞬间回退；需要在微信平台重新提交可用版本，具体平台回退能力待确认。
- Android 回滚需要发布更高 `versionCode` 的修复版本，不能简单重新上传旧包。

## 10. 常见部署故障

### 手机提示 `url not in domain list`

检查 API 基址是否为 HTTPS、微信后台域名是否完全一致、证书是否有效。开发者工具正常不代表手机预览配置正确。

### 502 Bad Gateway

检查 Node 是否监听正确端口、反向代理 `proxy_pass`、防火墙和 Node 日志。若 Node 正常但 API 返回 JSON 502，则继续检查高德 Key、配额和错误信息。

### 地铁首次请求很慢

首次会建立城市地铁站索引；部署后重启会清空缓存。若持续慢，检查高德 QPS、`AMAP_PAGE_DELAY_MS` 和已维护城市数量。

### 网页底图加载失败

检查 `/api/config`、`AMAP_JS_KEY`、`AMAP_SECURITY_JS_CODE`、域名白名单和浏览器控制台。

## 11. 待确认

- 线上服务器操作系统、Node 版本和项目目录。
- 实际使用 Nginx、Caddy 或云网关中的哪一种。
- Node 进程管理、日志采集、监控、告警和备份方案。
- HTTPS 证书申请、自动续期和负责人。
- 当前公网 IP 是否仍开放 `5174`。
- Android 生产构建与商店发布流程。
