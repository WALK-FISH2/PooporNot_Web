# 拉了么（Poopornot）

状态：Active

一个以地图为主界面的公共厕所与地铁站厕所信息查询项目。用户可以使用当前位置、文字地点或地图长按选点作为查询中心，查找附近公共厕所并按需查看地铁站厕所状态。

## 当前组成

```text
index.html + app.js + styles.css   网页
server.js                          统一 Node 后端与静态服务
WhereToPoop/                       微信小程序
WhereToPoop_apk/                   Android 客户端
data/metro/                        共享地铁厕所状态
docs/                              正式开发文档
```

三个客户端共用 `server.js` 和 `data/metro`，但导航方式按平台区分：

| 平台 | 地图 | 导航 |
| --- | --- | --- |
| 网页 | 国内高德 JS API 2.0；海外 Leaflet 1.9.4 + Geoapify Tiles | 国内绘制高德步行路线；海外打开 Google Maps |
| 微信小程序 | 微信 `map` 组件/腾讯地图底图 | `wx.openLocation`，不调用内部路线 |
| Android | 高德 Android SDK | 后端步行路线 + 外部地图导航 |

## 当前功能

- 定位、文字地点与地图右键/长按选点查询中心（网页和微信小程序支持）。
- 300 m、500 m、1 km、3 km 附近厕所查询。
- 厕所地图标记、列表、距离和详情。
- 专用按钮查询中心 20 km 内最近 10 个地铁站。
- 地铁厕所状态：绿色有厕所、红色无厕所、橙色不确定。
- 网页和微信小程序支持中国大陆与海外模式；首批海外文字搜索城市为新加坡、莫斯科、东京、伦敦、纽约和悉尼。
- 国内业务继续使用高德与 GCJ-02；海外地点与 POI 使用 Geoapify 和 WGS84，网页海外底图使用 Geoapify Tiles。
- 网页、小程序和 Android 深浅色界面。
- 小程序分享与新版本更新提示。

网页版全球支持已实现：国内继续使用高德/GCJ-02，海外使用同源 Leaflet 1.9.4 + Geoapify Tiles/WGS84；详情见 `docs/specs/web-global-support/` 和 ADR-0002。发布前仍需完成真实浏览器定位、移动端长按、外部导航弹窗和六城完整 UI 验收。

“附近厕所”国内来自高德 POI、海外来自 Geoapify/OSM 数据，不保证覆盖现实中的全部厕所。当前没有账号、用户投票、后台管理或自建全国厕所数据库。

## 快速启动

### 1. 配置后端

在根目录创建 `.env`：

```env
AMAP_JS_KEY=replace-with-your-web-js-key
AMAP_SECURITY_JS_CODE=replace-with-your-security-code
AMAP_WEB_SERVICE_KEY=replace-with-your-web-service-key
GEOAPIFY_API_KEY=replace-with-your-geoapify-key
GEOAPIFY_MAP_TILE_KEY=replace-with-your-browser-tile-key
GEOAPIFY_BASE_URL=https://api.geoapify.com
GEOAPIFY_TIMEOUT_MS=4000
GEOAPIFY_SEARCH_TIMEOUT_MS=6000
GEOAPIFY_SEARCH_CACHE_TTL_MS=300000
PORT=5174
AMAP_PAGE_DELAY_MS=260
```

不要使用或提交真实密钥示例。`AMAP_WEB_SERVICE_KEY` 和 `GEOAPIFY_API_KEY` 只能位于后端；`GEOAPIFY_MAP_TILE_KEY` 是浏览器可见的独立瓦片凭据，不得与后端 Key 共用。

### 2. 启动后端与网页

```powershell
npm start
```

默认访问：

```text
http://127.0.0.1:5174/
http://127.0.0.1:5174/api/health
```

`.env` 中的 `PORT` 可以覆盖默认端口。

### 3. 微信小程序

用微信开发者工具导入 `WhereToPoop/`。API 地址在：

```text
WhereToPoop/miniprogram/config/api.ts
```

当前生产基址为 `https://pp.nuanzhualife.cn`。本地调试、真机域名和腾讯地图样式配置见 `docs/configuration.md`。

### 4. Android

用 Android Studio 打开 `WhereToPoop_apk/`，根据 `WhereToPoop_apk/local.properties.example` 创建本机配置。构建需要 JDK 17 和 Android SDK 35。

```powershell
Set-Location WhereToPoop_apk
.\gradlew.bat assembleDebug
```

## 检查

```powershell
npm run check
npm test
npx --yes -p typescript@5.4.5 tsc --noEmit -p WhereToPoop/tsconfig.json
```

当前包含 Node 语法检查、后端供应商/POI 单元测试和小程序 TypeScript 类型检查；地图交互与 `wx.openLocation` 仍需微信真机验收。发布前矩阵见 `docs/testing.md`。

## 开发文档

- 总索引：`docs/README.md`
- 产品规格：`docs/spec.md`
- 系统架构：`docs/architecture.md`
- 后端 API：`docs/api.md`
- 配置：`docs/configuration.md`
- 地铁数据：`docs/metro-data.md`
- 本地开发：`docs/development.md`
- 开发历史：`docs/development-history.md`
- 部署与发布：`docs/deployment.md`、`docs/release.md`
- 安全隐私：`docs/security-privacy.md`
- 路线图：`docs/roadmap.md`
- 网页全球支持：`docs/specs/web-global-support/`

## 重要规则

- 当前代码与配置用于确认现状，历史文档用于解释演变。
- 地铁厕所状态只维护在 `data/metro`，不要为客户端复制数据。
- 地铁 JSON 不保存坐标；国内站点坐标由高德周边结果提供，海外站点来自 Geoapify。
- 每次修改业务代码、配置、数据或正式文档都要追加 `CHANGELOG.md`。
- 不提交 `.env`、Android `local.properties`、签名文件、证书私钥或真实 Key。

参与开发前请阅读 `AGENTS.md` 和 `docs/constitution.md`。
