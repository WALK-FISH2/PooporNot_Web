# 本地开发

状态：Active

所有命令默认从项目根目录执行。文本文件使用 UTF-8；不要因终端字体或编码显示异常而把正常中文重新编码。

## 1. 前置条件

### 后端与网页

- Node.js 18 或更高版本，原因是 `server.js` 使用全局 `fetch`。
- 有效的高德 JS API Key、安全密钥和 Web Service Key。

根 `package.json` 当前没有第三方依赖，因此不需要安装运行时包。

### 微信小程序

- 微信开发者工具，基础库与项目配置当前为 `3.13.0`。
- 有权访问 `WhereToPoop/project.config.json` 中 AppID 的开发者账号。
- 真机测试需要可访问的 HTTPS 后端，或开发阶段可访问的局域网后端。

### Android

- Android Studio。
- JDK 17；Android Gradle Plugin 8.7.3 不支持 Java 14。
- Android SDK Platform 35。
- 有效的高德 Android Key，绑定包名和当前签名 SHA1。

## 2. 后端与网页

### 2.1 创建本地配置

在根目录创建 `.env`，不要把现有 `.env.example` 中的非占位值直接当作安全密钥：

```env
AMAP_JS_KEY=replace-with-your-key
AMAP_SECURITY_JS_CODE=replace-with-your-code
AMAP_WEB_SERVICE_KEY=replace-with-your-key
PORT=5174
AMAP_PAGE_DELAY_MS=260
```

### 2.2 启动

```powershell
npm start
```

等价命令：

```powershell
node server.js
```

代码默认监听 `5174`；`.env` 中的 `PORT` 可以覆盖。启动后访问：

```text
http://127.0.0.1:5174/
http://127.0.0.1:5174/api/health
```

如果本地 `.env` 使用其他端口，应同步替换上述端口。

### 2.3 基础检查

```powershell
npm run check
```

该命令只对 `server.js` 和 `app.js` 执行 Node 语法检查，不是自动化业务测试。

## 3. 微信小程序开发

### 3.1 导入项目

在微信开发者工具中导入 `WhereToPoop/`。`miniprogramRoot` 已配置为 `miniprogram/`，TypeScript 由开发者工具编译。

### 3.2 选择 API 地址

修改 `WhereToPoop/miniprogram/config/api.ts`：

```ts
export const API_BASE_URL = "http://127.0.0.1:5174";
```

这只适用于开发者工具模拟器。真机中的 `127.0.0.1` 指手机本身。

真机局域网调试可临时使用开发电脑的局域网 IP，但需满足：

- 手机和电脑在同一网络。
- Windows 网络配置为“专用网络”，防火墙允许 Node 端口。
- 微信开发者工具在开发阶段允许跳过合法域名检查。

二维码预览和正式发布应恢复为：

```ts
export const API_BASE_URL = "https://pp.nuanzhualife.cn";
```

并关闭“跳过域名校验”，验证微信后台合法域名。

### 3.3 地图夜间样式

界面夜间模式无需额外配置。若要让腾讯地图底图同时变暗，需要在腾讯位置服务控制台创建个性化样式，然后填写：

```ts
export const TENCENT_MAP_SUBKEY = "...";
export const TENCENT_MAP_STYLE_LIGHT = "...";
export const TENCENT_MAP_STYLE_DARK = "...";
```

不要使用猜测的样式号，也不要填 `0`。

### 3.4 验证重点

- 首次授权定位后自动查询 500 m 内厕所。
- 拒绝定位后能选择城市和地点。
- 改变半径后自动查询。
- 厕所和地铁站只显示“导航”，没有“路线”。
- 地铁按钮列出最近 10 站。
- 分享和版本更新提示可用。

## 4. Android 开发

### 4.1 本机配置

从 `WhereToPoop_apk/local.properties.example` 创建 `WhereToPoop_apk/local.properties`，填写 SDK、后端和 Android Key：

```properties
sdk.dir=replace-with-android-sdk-path
API_BASE_URL=https\://pp.nuanzhualife.cn/
AMAP_ANDROID_KEY=replace-with-your-amap-android-key
```

### 4.2 构建

```powershell
Set-Location WhereToPoop_apk
.\gradlew.bat assembleDebug
```

输出：

```text
WhereToPoop_apk/app/build/outputs/apk/debug/app-debug.apk
```

如果 Gradle 报“requires Java 17”，在 Android Studio 的 Gradle JDK 中选择 JDK 17 或更新 `JAVA_HOME`，不要继续使用 Java 14。

### 4.3 验证重点

- 首次定位、拒绝权限和手动城市三条路径。
- 厕所查询、地点选择和最近 10 个地铁站。
- 后端路线终点与选中结果一致。
- 高德外部导航和系统地图兜底。
- 日夜主题及橙色未知状态。

## 5. 地铁数据开发

编辑前先阅读 `docs/metro-data.md`。最小流程：

1. 更新 `data/metro/city_index.json` 或确认索引已存在。
2. 在对应省市目录新增或修改 `line_*.json`。
3. 不写坐标，只写站名和 `toilet`。
4. 用 JSON 解析器校验所有文件。
5. 重启后端清空城市地铁站内存缓存。
6. 在目标城市和边界位置测试 `/api/metro/nearby`。
7. 更新数据盘点与 `CHANGELOG.md`。

## 6. 常见问题

### `request:fail url not in domain list`

原因通常是 HTTP、IP 地址、域名未加入微信 `request` 合法域名，或配置与请求域名不完全一致。开发者工具跳过校验只影响本地开发，不能证明正式配置正确。

### 开发者工具用局域网 IP 返回 502，但 PC/手机预览正常

先在同一环境访问 `/api/health`，再检查代理、防火墙、后端进程和 API 基址。历史上开发者工具使用 `127.0.0.1` 更稳定，但真机不能使用该地址。

### 高德返回 502 或 QPS 错误

查看响应中的高德错误信息。厕所查询默认最多分页 4 次；地铁首次加载还会建立城市索引。不要通过快速重复刷新放大配额消耗。

### 只返回 25 个厕所

25 是高德单页上限。当前后端会分页；如果仍只返回 25，检查是否运行了旧后端进程、`limit`、实际高德总数和 `partial`。

### 地铁加载慢

首次请求需要建立城市站点索引；同一进程后续会缓存。修改后端后必须重启旧进程。若持续很慢，检查高德配额和实际扫描城市数。

### `style0` 未找到

腾讯地图样式 ID 被错误设为 `0`。未配置时保持空字符串。

### 小程序预览出现 `Unexpected token ?`

历史微信编译环境不接受部分现代语法。当前 API 转换代码已避免 `??` 和可选链；新增代码需用项目实际开发者工具和真机预览验证。

### `OVER_DIRECTION_RANGE`

步行路线距离过远。后端当前会返回 HTTP 400 和可读错误，不应退出。小程序已不调用路线接口；网页和 Android 仍需处理。

## 7. 开发完成清单

- [ ] 只修改了需求涉及的客户端、后端或数据。
- [ ] 未提交真实密钥或本机绝对路径。
- [ ] 执行了可用的语法/构建检查。
- [ ] 手动验证了受影响平台的关键流程。
- [ ] 更新相关 `docs/` 文档。
- [ ] 追加 `CHANGELOG.md`，没有覆盖历史。

## 8. 待确认

- 团队正式支持的 Node.js 小版本。
- 是否把 TypeScript 编译器和 lint 工具加入项目依赖。
- Android release 构建和签名的团队流程。
