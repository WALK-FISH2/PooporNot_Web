# 配置说明

状态：Active

本文只记录配置位置、作用和非敏感默认值。真实密钥不得写入文档或受控文件。

## 1. 后端 `.env`

`server.js` 启动时读取项目根目录 `.env`；已存在的进程环境变量优先。`.env` 被 Git 忽略，`.env.example` 是可提交的纯占位模板。

```env
AMAP_JS_KEY=
AMAP_SECURITY_JS_CODE=
AMAP_WEB_SERVICE_KEY=
GEOAPIFY_API_KEY=
GEOAPIFY_MAP_TILE_KEY=
GEOAPIFY_BASE_URL=https://api.geoapify.com
GEOAPIFY_TIMEOUT_MS=4000
GEOAPIFY_SEARCH_TIMEOUT_MS=6000
GEOAPIFY_SEARCH_CACHE_TTL_MS=300000
PORT=5174
AMAP_PAGE_DELAY_MS=260
```

| 变量 | 必需范围 | 代码默认值 | 用途 |
| --- | --- | --- | --- |
| `AMAP_JS_KEY` | 网页地图 | 空 | 经 `/api/config` 返回浏览器，加载高德 JS API |
| `AMAP_SECURITY_JS_CODE` | 视高德配置 | 空 | 经 `/api/config` 返回浏览器 |
| `AMAP_WEB_SERVICE_KEY` | 国内业务 | `AMAP_KEY` 后为空 | 国内地点、厕所、地铁和路线 |
| `AMAP_KEY` | 否 | 空 | Web Service Key 的兼容别名 |
| `GEOAPIFY_API_KEY` | 全球识别/海外 | 空 | 海外逆地理、文字地点、厕所和地铁；仅后端 |
| `GEOAPIFY_MAP_TILE_KEY` | 网页海外底图 | 空 | 经 `/api/config` 返回浏览器，仅用于 Geoapify Tiles |
| `GEOAPIFY_BASE_URL` | 否 | `https://api.geoapify.com` | Geoapify API 根地址 |
| `GEOAPIFY_TIMEOUT_MS` | 否 | `4000` | Geoapify 逆地理、厕所和地铁请求超时，毫秒 |
| `GEOAPIFY_SEARCH_TIMEOUT_MS` | 否 | `6000` | 海外文字地点搜索专用超时，毫秒 |
| `GEOAPIFY_SEARCH_CACHE_TTL_MS` | 否 | `300000` | 相同海外城市、关键词和数量的成功搜索结果进程内缓存时间；`0` 禁用 |
| `PORT` | 否 | `5174` | Node 监听端口 |
| `AMAP_PAGE_DELAY_MS` | 否 | `260` | 国内厕所分页间隔，毫秒 |

当前本机 `.env` 已配置这些变量；具体值不进入文档。本地开发和用户验收使用开发 Geoapify 项目 Key；部署服务器前再切换生产 Key，并重启后端使环境变量生效。

## 2. 网页

网页没有独立 API 基址，通过同源相对路径访问后端。国内使用高德/GCJ-02，海外使用 Leaflet/Geoapify Tiles/WGS84。高德 JS Key 和独立瓦片 Key 在浏览器可见是客户端地图的工作方式，必须按供应商能力限制来源和额度；`AMAP_WEB_SERVICE_KEY` 与后端 `GEOAPIFY_API_KEY` 不得发给浏览器。

### 2.1 海外瓦片配置

当前配置：

```env
GEOAPIFY_MAP_TILE_KEY=replace-with-dedicated-browser-tile-key
```

- `server.js`、`.env.example` 和 `/api/config` 已接入该变量。
- 真实值只写入被忽略的 `.env`，源码和文档只写占位符。
- 它是浏览器直接请求 Geoapify Tiles 时可见的客户端凭据，不得复用仅服务器使用的 `GEOAPIFY_API_KEY`。
- `/api/config` 返回 `geoapifyMapTileKey`，以便服务器轮换而不修改静态源码。
- 来源限制是否可在当前 Geoapify 项目中配置、生产日额度和告警阈值仍待确认。

## 3. 微信小程序

配置文件：`WhereToPoop/miniprogram/config/api.ts`。

### 3.1 API 地址

生产发布目标地址：

```ts
export const API_BASE_URL = "https://pp.nuanzhualife.cn"
```

当前工作区为真机局域网测试，`WhereToPoop/miniprogram/config/api.ts` 的活动值是 `http://192.168.1.14:5174`。该地址不是可提交发布的生产配置；发布前必须切回上述 HTTPS 域名。

- 开发者工具可临时使用 `http://127.0.0.1:<port>`。
- 真机中的 `127.0.0.1` 指手机本身；局域网测试应使用电脑局域网 IP 并放行防火墙。
- 二维码预览和发布必须使用 HTTPS 域名，并在微信公众平台配置为 `request` 合法域名；后台只填域名，不附加 `/api`。
- Geoapify Key 和高德 Web Service Key 均不放在小程序配置中。

### 3.2 地铁调试

```ts
export const DEBUG_METRO_CITY = "";
```

只影响国内响应城市显示，不能改变按查询中心 20 km 查询的空间规则。生产保持空字符串。

### 3.3 腾讯地图样式

```ts
export const TENCENT_MAP_SUBKEY = "";
export const TENCENT_MAP_STYLE_LIGHT = "";
export const TENCENT_MAP_STYLE_DARK = "";
```

当前页面使用单一微信原生默认 `<map>`，这三个字段为预留配置，暂未传给地图组件。夜间按钮只切换页面 UI；填写 `0` 会触发 `style0` 不存在。重新接入个性化底图前必须验证同一个常驻地图实例不会出现空白瓦片。

### 3.4 微信项目

`WhereToPoop/project.config.json` 保存团队项目配置和 AppID；`project.private.config.json` 是个人配置。当前基础库目标为 `3.16.2`，与开发者工具当前可选版本一致。全球功能使用 `map` 的长按、callout 和 `MapContext.fromScreenLocation`，必须用实际基础库与真机复核。

## 4. 海外城市配置

文件：`data/global/cities.json`。每项包含：

- 稳定 `id` 和两位 `countryCode`；
- `nameZh`、`nameLocal`；
- WGS84 `center` 与 `defaultScale`；
- 仅后端使用的矩形 `bounds` 与 `boundarySource`。

当前六城：新加坡、莫斯科、东京、伦敦、纽约、悉尼。修改边界前必须通过 Geoapify 返回和实际地点抽查验证；东京使用排除远岛的都市区测试矩形。

## 5. Android

从 `WhereToPoop_apk/local.properties.example` 建立本机 `local.properties`：

```properties
sdk.dir=replace-with-android-sdk-path
API_BASE_URL=https\://pp.nuanzhualife.cn/
AMAP_ANDROID_KEY=replace-with-your-amap-android-key
```

Android 本轮不发送海外参数。`app/build.gradle.kts` 的受控 fallback 仍是旧 HTTP 地址，构建要求 JDK 17、Android SDK 35；发布前应以本机/CI 配置覆盖为 HTTPS，并评估关闭明文流量。

## 6. 配置检查

1. `.env`、`local.properties`、keystore 和真实 Key 未被 Git 跟踪。
2. `.env.example` 只有空值或明确占位符。
3. 当前 `/api/config` 不返回 Web Service Key 或后端 `GEOAPIFY_API_KEY`，只返回网页所需的高德 JS 配置和独立浏览器瓦片凭据。
4. `/api/health` 能从目标 HTTPS 域名访问。
5. 微信关闭“跳过域名校验”后可调用 API。
6. 生产日志不包含完整 Key。
7. 修改后同步本文与 `CHANGELOG.md`。
8. 确认浏览器只获得独立瓦片 Key，不获得后端 Geoapify Key。

## 7. 待确认

- 生产 Node 进程的环境变量注入、重启和密钥轮换流程。
- 腾讯小程序深浅地图样式是否已经创建。
- Android release HTTPS、签名和 JDK 17 CI 环境。
- Geoapify 瓦片 Key 的域名来源限制、日额度和轮换流程。
