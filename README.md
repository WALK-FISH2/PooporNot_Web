# 拉了么（Poopornot）

状态：Active

一个以地图为主界面的公共厕所与地铁站厕所信息查询项目。用户可以使用当前位置，或手动选择城市和具体地点作为基准点，查找附近公共厕所并查看地铁站厕所状态。

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
| 网页 | 高德 JS API 2.0 | 后端高德步行路线并在网页绘制 |
| 微信小程序 | 微信 `map` 组件/腾讯地图底图 | `wx.openLocation`，不调用内部路线 |
| Android | 高德 Android SDK | 后端步行路线 + 外部地图导航 |

## 当前功能

- 定位与手动城市/地点双基准模式。
- 300 m、500 m、1 km、3 km 附近厕所查询。
- 厕所地图标记、列表、距离和详情。
- 基准点 20 km 内跨城市地铁站查询。
- 地铁厕所状态：绿色有厕所、红色无厕所、橙色不确定。
- 网页、小程序和 Android 深浅色界面。
- 小程序分享与新版本更新提示。

“附近厕所”来自高德 POI，不保证覆盖现实中的全部厕所。当前没有账号、用户投票、后台管理或自建全国厕所数据库。

## 快速启动

### 1. 配置后端

在根目录创建 `.env`：

```env
AMAP_JS_KEY=replace-with-your-web-js-key
AMAP_SECURITY_JS_CODE=replace-with-your-security-code
AMAP_WEB_SERVICE_KEY=replace-with-your-web-service-key
PORT=5174
AMAP_PAGE_DELAY_MS=260
```

不要使用或提交真实密钥示例。`AMAP_WEB_SERVICE_KEY` 只能位于后端。

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
```

当前只有 Node 语法检查，没有自动化业务测试或 CI。发布前人工测试矩阵见 `docs/testing.md`。

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

## 重要规则

- 当前代码与配置用于确认现状，历史文档用于解释演变。
- 地铁厕所状态只维护在 `data/metro`，不要为客户端复制数据。
- 地铁 JSON 不保存坐标；坐标由后端通过高德解析。
- 每次修改业务代码、配置、数据或正式文档都要追加 `CHANGELOG.md`。
- 不提交 `.env`、Android `local.properties`、签名文件、证书私钥或真实 Key。

参与开发前请阅读 `AGENTS.md` 和 `docs/constitution.md`。
