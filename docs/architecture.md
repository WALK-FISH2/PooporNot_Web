# 系统架构

状态：Active

## 1. 系统边界

Poopornot 是一个以地图为主界面的公共厕所与地铁站厕所信息查询项目。正式项目根目录同时包含三个客户端、一个统一后端和一份共享地铁状态数据：

```text
浏览器网页 ─┐
微信小程序 ─┼─> Node.js 统一后端 ─> 高德 Web Service API
Android ────┘              └─> data/metro 本地 JSON

浏览器网页 ─> 高德 JS API 2.0
微信小程序 ─> 微信 map 组件（腾讯地图底图）
Android ────> 高德 Android 地图与定位 SDK
```

系统当前不包含账号体系、数据库、后台管理界面、用户投票服务或自建全国厕所数据源。

## 2. 目录与组件

### 2.1 统一后端与网页

- `server.js`：无框架的 Node.js HTTP 服务；加载 `.env`，提供 API、CORS 和静态文件服务。
- `index.html`、`app.js`、`styles.css`：网页版单页应用，由同一 Node 进程直接提供。
- `package.json`：提供 `npm start` 和基础语法检查命令。

网页通过 `/api/config` 获取 `AMAP_JS_KEY` 和 `AMAP_SECURITY_JS_CODE`，加载高德 JS API 2.0；厕所、地点、逆地理编码、地铁和步行路线均经统一后端访问。

### 2.2 微信小程序

- `WhereToPoop/miniprogram/pages/index/`：地图、搜索、结果、详情、城市选择与主题切换。
- `WhereToPoop/miniprogram/services/api.ts`：统一后端客户端。
- `WhereToPoop/miniprogram/config/api.ts`：后端地址、调试城市和腾讯个性化地图样式。
- `WhereToPoop/miniprogram/data/cities.ts`：城市选择器列表。
- `WhereToPoop/miniprogram/app.ts`：版本更新检查。

小程序只经后端访问高德 Web Service，不持有 `AMAP_WEB_SERVICE_KEY`。地图底图由微信 `map` 组件提供。厕所和地铁站导航使用 `wx.openLocation`；小程序当前不请求 `/api/navigation`，也不在内部绘制路线。

### 2.3 Android 客户端

- `WhereToPoop_apk/app/src/main/java/com/poopornot/wheretopoop/MainActivity.kt`：主要界面和交互流程。
- `WhereToPoop_apk/app/src/main/java/com/poopornot/wheretopoop/network/ApiService.kt`：Retrofit API 定义。
- `WhereToPoop_apk/app/src/main/java/com/poopornot/wheretopoop/model/Models.kt`：接口模型。
- `WhereToPoop_apk/app/build.gradle.kts`：Android Key、后端地址和构建配置。

Android 使用高德 Android SDK 展示地图和获取一次性定位，经统一后端查询业务数据；当前仍支持后端步行路线绘制，并提供高德地图优先、系统 `geo:` Intent 兜底的外部导航。

### 2.4 共享地铁数据

- `data/metro/city_index.json`：中文省市到英文目录名的索引。
- `data/metro/<provinceSlug>/<citySlug>/line_*.json`：线路元数据、站名和厕所状态。

JSON 不保存经纬度。后端从高德查询站点坐标，再按规范化站名与本地厕所状态合并。网页、小程序和 Android 均通过 `/api/metro/nearby` 使用同一份数据。

## 3. 关键流程

### 3.1 基准点与厕所搜索

1. 客户端获取当前位置，或由用户选择城市和具体地点。
2. 客户端把选定坐标保存为查询基准点。
3. 客户端调用 `/api/toilets`，传入经纬度、半径和结果上限。
4. 后端按每页 25 条调用高德周边搜索，并在多页间延迟请求。
5. 后端去重后返回最多 `limit` 条 POI；遇到限流且已有结果时返回 `partial: true`。
6. 客户端展示地图标记、列表、距离和详情。

注意：“指定半径内”表示请求高德周边搜索，并不保证获得现实世界中全部厕所。结果受高德数据覆盖、配额、分页和 `limit` 影响。

### 3.2 地铁站状态合并

1. 客户端以基准点调用 `/api/metro/nearby`，当前三个客户端均使用 20 km 半径。
2. 后端读取所有实际存在 `line_*.json` 的城市目录。
3. 每个城市首次查询时，后端分页获取该城市地铁站 POI，建立进程内站名索引。
4. 后端把本地站名和厕所状态与高德坐标合并，再按基准点半径过滤。
5. 后端额外执行一次基准点周边地铁站搜索，作为人工数据缺失时的兜底；兜底状态为 `2`。
6. 合并结果按站名和近似坐标去重并按距离排序。

该流程刻意按地理距离而不是“用户当前行政城市”筛选，因此可覆盖句容、马鞍山等跨城线路和城市边界场景。

### 3.3 导航

- 网页：调用 `/api/navigation` 获取步行路线并在高德地图上绘制。
- 微信小程序：调用 `wx.openLocation` 进入微信地图位置页，由系统继续选择导航应用。
- Android：可调用 `/api/navigation` 绘制步行路线，也可打开外部地图应用。

## 4. 状态与颜色

| `toilet` | 含义 | 当前标记颜色 |
| --- | --- | --- |
| `1` | 有厕所 | 绿色 |
| `0` | 没有厕所 | 红色 |
| `2` | 不确定 | 橙色 `#F59E0B` |

线路颜色来自 `line_*.json` 的 `color`，与厕所状态颜色是两个独立概念。客户端当前只叠加站点状态标记，不自行绘制地铁线路几何。

## 5. 运行时状态与缓存

- 地铁城市站点索引保存在 `server.js` 的进程内 `Map` 中，同一进程后续请求复用。
- 缓存没有 TTL、容量控制、磁盘持久化或主动失效机制；后端重启后清空。
- 厕所和地点查询没有服务端缓存，每次查询都会消耗外部接口调用。
- 后端没有认证、用户会话和请求级限流。

## 6. 关键依赖与约束

- Node.js 需要原生 `fetch`，实际应使用 Node.js 18 或更高版本；正式支持版本待确认。
- 高德 Web Service 是地点、厕所、逆地理编码、地铁坐标和路线数据的主要外部依赖。
- 小程序真机和正式发布要求 HTTPS 域名，并在微信公众平台配置 `request` 合法域名。
- Android 构建要求 JDK 17、Android SDK 35；运行最低 Android API 24。
- 小程序底图夜间模式只有在腾讯位置服务配置有效的个性化样式 ID 后才能真正切换；空字符串表示只切换界面主题。

## 7. 当前边界

### 当前有效

- 一个后端同时服务网页、小程序和 Android。
- 三端共享厕所、地点、地铁和逆地理编码 API。
- 三端共享 `data/metro` 中的地铁厕所状态。

### 曾经实现但已移除

- 微信小程序内部步行路线按钮、路线结果面板和 `/api/navigation` 调用。
- 后端逐个地铁站调用高德查询坐标的早期实现。

### 尚未实现

- 用户投票、纠错、补点和临时关闭反馈。
- 自建厕所数据库与服务端 POI 缓存。
- API 认证、持久化缓存、监控和自动化测试。

### 已放弃

- 当前阶段自建覆盖全国的完整厕所数据库；项目继续依赖地图服务 POI。

## 8. 待确认

- 生产服务器的进程管理、日志采集、监控和告警方案。
- `pp.nuanzhualife.cn` 是否同时承载网页静态资源和 API，代码只能确认小程序 API 基址。
- Android 正式版是否也应取消内部路线，和小程序保持一致。
