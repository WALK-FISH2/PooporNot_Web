# 配置说明

状态：Active

本文只说明配置位置、作用和当前默认值，不记录真实密钥。所有路径均相对于项目根目录。

## 1. 后端配置

后端启动时由 `server.js` 读取根目录 `.env`。已有进程环境变量优先；只有变量尚未定义时，才使用 `.env` 中的值。

建议从 `.env.example` 创建本地 `.env`，并确保 `.env` 不提交到版本库。

```env
AMAP_JS_KEY=replace-with-web-js-key
AMAP_SECURITY_JS_CODE=replace-with-security-js-code
AMAP_WEB_SERVICE_KEY=replace-with-web-service-key
PORT=5174
AMAP_PAGE_DELAY_MS=260
```

| 变量 | 必需 | 代码默认值 | 用途 |
| --- | --- | --- | --- |
| `AMAP_JS_KEY` | 网页必需 | 空 | 通过 `/api/config` 发送给浏览器，用于高德 JS API 2.0 |
| `AMAP_SECURITY_JS_CODE` | 视高德配置 | 空 | 通过 `/api/config` 发送给浏览器 |
| `AMAP_WEB_SERVICE_KEY` | 业务 API 必需 | `AMAP_KEY` 回退后为空 | 后端调用高德 Web Service |
| `AMAP_KEY` | 否 | 空 | `AMAP_WEB_SERVICE_KEY` 的兼容别名 |
| `PORT` | 否 | `5174` | Node 监听端口 |
| `AMAP_PAGE_DELAY_MS` | 否 | `260` | 厕所和地铁多页请求间隔，单位毫秒 |

当前 `.env` 存在上述前三个高德变量和 `PORT`，具体值不应写入文档。

### 已知不一致

- `server.js` 的默认端口是 `5174`。
- 旧版根 `README.md` 和部分小程序注释曾写 `5173`；本次文档以当前代码默认值为准。
- `.env.example` 当前包含看起来像真实 Key 的值，而不是占位符。是否仍有效无法确认；应按已泄露处理并轮换，详见 `security-privacy.md`。

## 2. 网页配置

网页没有独立构建步骤，也没有独立 API 基址。浏览器从当前站点访问以下相对路径：

- `/api/config`
- `/api/location/reverse`
- `/api/places`
- `/api/toilets`
- `/api/navigation`
- `/api/metro/nearby`

因此网页应和 `server.js` 部署在同一源，或由反向代理确保这些路径进入统一后端。

高德 JS Key 会暴露到浏览器，这是 JS API 的正常工作方式，但必须在高德控制台绑定允许的生产域名。`AMAP_WEB_SERVICE_KEY` 只能保存在后端环境中。

## 3. 微信小程序配置

配置文件：`WhereToPoop/miniprogram/config/api.ts`。

### 3.1 `API_BASE_URL`

当前有效值：

```ts
export const API_BASE_URL = "https://pp.nuanzhualife.cn"
```

历史开发地址仍以注释保留，包括 `127.0.0.1:5173`、局域网 IP 和公网 HTTP IP。它们只适合开发环境，不是正式发布配置。

规则：

- 微信开发者工具模拟器访问本机后端可临时使用 `http://127.0.0.1:<port>`。
- 真机无法把 `127.0.0.1` 解释为开发电脑；局域网测试需使用电脑局域网 IP，并允许防火墙访问。
- 二维码预览和正式版本应使用有效 HTTPS 域名。
- 域名必须在微信公众平台“服务器域名”的 `request` 合法域名中配置。
- 微信后台配置域名时不要附加 `/api` 路径。

### 3.2 地铁调试

```ts
export const DEBUG_METRO_CITY = "";
```

仅用于跨城市调试。空字符串表示使用逆地理编码结果。生产环境应保持为空；当前后端的 `debugCity` 只覆盖城市名，不改变按距离筛选的核心逻辑。

### 3.3 腾讯地图样式

```ts
export const TENCENT_MAP_SUBKEY = "";
export const TENCENT_MAP_STYLE_LIGHT = "";
export const TENCENT_MAP_STYLE_DARK = "";
```

- `TENCENT_MAP_SUBKEY`：腾讯位置服务小程序 subkey。
- `TENCENT_MAP_STYLE_LIGHT`、`TENCENT_MAP_STYLE_DARK`：腾讯位置服务控制台创建的个性化地图样式 ID。
- 未配置时必须保留空字符串。填写 `0` 会触发“个性化样式 style0 并未找到”。
- 样式为空时，小程序 UI 可以切换深浅色，但地图底图不会随之切换。

### 3.4 微信项目标识

`WhereToPoop/project.config.json` 包含当前小程序 `appid`、基础库版本 `3.13.0`、TypeScript 编译插件和 `miniprogram/` 根目录。复制项目或切换账号时必须核对 `appid`，不要把个人 `project.private.config.json` 作为团队配置依据。

## 4. Android 配置

### 4.1 本机配置

从 `WhereToPoop_apk/local.properties.example` 创建或维护 `WhereToPoop_apk/local.properties`：

```properties
sdk.dir=replace-with-android-sdk-path
API_BASE_URL=https\://pp.nuanzhualife.cn/
AMAP_ANDROID_KEY=replace-with-your-amap-android-key
```

`local.properties` 是本机配置，不应提交。实际是否已经改用生产 HTTPS 域名无法从受控代码确认。

### 4.2 构建默认值

`WhereToPoop_apk/app/build.gradle.kts` 当前默认：

- `API_BASE_URL`：`http://124.220.73.65:5174/`
- `AMAP_ANDROID_KEY`：空字符串
- `compileSdk` / `targetSdk`：35
- `minSdk`：24
- Java/Kotlin 目标：17
- `versionCode`：1
- `versionName`：`1.0.0`

`API_BASE_URL` 会在构建时写入 `BuildConfig`。Android Key 同时写入 `BuildConfig` 和 manifest placeholder，必须在高德控制台限制包名 `com.poopornot.wheretopoop` 与正确签名 SHA1。

### 4.3 明文网络

Android manifest 和 `network_security_config.xml` 当前允许明文 HTTP，以兼容旧公网 IP 地址。正式发布应优先切换 HTTPS，并评估关闭 `usesCleartextTraffic`；当前是否已有发布版 HTTPS 配置为“待确认”。

## 5. 配置变更检查

修改配置时至少检查：

1. 不把 `.env`、Android Key 或证书私钥提交到仓库。
2. `/api/health` 能通过目标 HTTPS 域名访问。
3. 网页能加载高德地图，且 JS Key 域名白名单正确。
4. 小程序在关闭“跳过域名校验”后能够调用 API。
5. Android 地图 Key 的包名和签名匹配。
6. 同步更新本文件和 `CHANGELOG.md`。

## 6. 待确认

- `.env.example` 中疑似真实 Key 是否已全部吊销和轮换。
- 生产 Node 进程实际使用的 `PORT` 和环境变量注入方式。
- Android `local.properties` 的生产 API 地址与 release 签名配置。
- 腾讯个性化地图 subkey 和深浅色样式是否已在控制台创建。
