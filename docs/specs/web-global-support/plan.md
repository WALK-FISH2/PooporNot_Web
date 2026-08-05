# 实施计划：网页版全球厕所与地铁支持

状态：Active

实施状态：阶段 A～C 已完成；阶段 D 的自动化、本地浏览器核心回归和文档同步已完成，真实设备与生产网络验收仍按 `acceptance.md` 执行。

## 1. 实施边界

本计划只修改网页版及其必要的统一后端配置出口。微信小程序和 Android 不改业务逻辑。后端现有海外地点、厕所和地铁接口保持向后兼容。

预计影响：

- `index.html`
- `app.js`
- `styles.css`
- `server.js`
- `.env.example`
- 被 Git 忽略的本地 `.env`
- 网页、配置、架构、安全、部署、测试和发布文档

Leaflet 1.9.4 已采用同源发行文件，保存在 `vendor/leaflet/`，包含官方许可证和图片资源。该方案不依赖运行时 CDN，也不增加构建链。

## 2. 分层方案

### 2.1 状态层

将当前散落变量收敛为明确状态，至少包括：

```js
{
  regionMode,
  coordinateSystem,
  countryCode,
  activeOverseasCityId,
  viewportCenter,
  queryCenter,
  temporarySelection,
  places,
  toilets,
  metroStations,
  selectedPlaceId,
  selectedPoiId,
  panelMode,
  requestIds,
  loading
}
```

不要求引入框架；允许继续使用原生 JavaScript。

### 2.2 地图适配层

定义网页内部统一接口：

```js
createMap(options)
destroyMap()
setCenter(coordinate, zoom)
setTheme(theme)
setMarkers(layerName, items)
clearMarkers(layerName)
fitView(items)
drawRoute(points)
clearRoute()
onMapSelection(handler)
```

实现：

- `AmapAdapter`：国内 GCJ-02、高德样式和现有路线折线。
- `LeafletAdapter`：海外 WGS84、Geoapify 瓦片、`contextmenu` 和 Leaflet marker。

业务层只通过适配器操作地图，避免在查询函数中分散 `AMap`/`L` 判断。

### 2.3 配置层

- `server.js` 从 `GEOAPIFY_MAP_TILE_KEY` 读取独立瓦片 Key。
- `/api/config` 增加 `geoapifyMapTileKey`，保留现有字段。
- `.env.example` 只增加占位符。
- 不将后端 `GEOAPIFY_API_KEY` 复用或返回。

### 2.4 请求上下文

新增统一函数，根据当前查询中心生成：

```js
{
  region,
  coordinateSystem,
  countryCode,
  cityId
}
```

国内请求保持未传海外参数的兼容方式；海外请求显式发送全部上下文。

## 3. 实施顺序

### 阶段 A：配置和地图适配器

1. 扩展 `/api/config` 和示例环境变量。
2. 引入固定版本 Leaflet。
3. 建立高德与 Leaflet 适配器。
4. 实现区域切换、地图销毁、主题和瓦片署名。

门禁：国内地图与现有 marker/路线保持可用；海外六城中心能显示瓦片。

### 阶段 B：定位、城市和查询中心

1. 使用浏览器 WGS84 定位。
2. 国内候选转换为 GCJ-02并通过高德确认。
3. 海外调用全球逆地理。
4. 实现区域/城市入口、城市切换清空中心。
5. 实现文字候选和地图右键/长按临时点、“选这里”。

门禁：三种查询中心来源符合规格，城市中心不参与 POI 查询。

### 阶段 C：厕所、地铁、结果与导航

1. 厕所请求增加海外上下文和请求淘汰。
2. 半径变化只刷新厕所。
3. 增加地铁按钮、20 km/10 站列表和独立 marker。
4. 保留同一中心下厕所/地铁图层。
5. 国内保留内部路线，海外打开外部 Google Maps。
6. 完成详情、状态色、结果抽屉和窄屏布局。

门禁：国内和六城核心流程全部通过人工验收。

### 阶段 D：验证与文档收口

1. `npm run check`、`npm test` 和 `git diff --check`。
2. 增加可测试的状态/请求上下文单元测试或最小浏览器测试。
3. 桌面与移动浏览器截图和交互检查。
4. 国内、六城、主题、导航、错误和配额抽查。
5. 将 Draft 规格任务更新为实际状态，同步正式文档和 `CHANGELOG.md`。

## 4. API 与数据变化

- 复用 `/api/global/cities`、`/api/location/reverse`、`/api/places`、`/api/toilets`、`/api/metro/nearby`。
- `/api/config` 只新增可选客户端字段，不删除现有字段。
- `/api/navigation` 继续只供国内网页和 Android；海外网页不调用。
- 不修改 POI 和地铁 JSON schema。
- 不新增数据库。

## 5. 风险与控制

| 风险 | 控制 |
| --- | --- |
| 双地图引擎导致 marker 行为不一致 | 使用适配器和统一对象 ID，逐引擎验收 |
| WGS84/GCJ-02 混用 | 所有中心与 POI 显式携带 `coordinateSystem` |
| Geoapify 瓦片 Key 被复制 | 独立客户端 Key、最小权限、配额监控和轮换 |
| 瓦片额度被拖动/缩放消耗 | 不预加载、限制合理最大缩放、监控 credits |
| 切换城市后旧请求覆盖界面 | 请求序号、指纹和中心提交时失效 |
| 海外瓦片故障导致空白 | 显示明确错误，结果状态可恢复，不影响国内高德 |
| Leaflet 资源缺失或版本漂移 | 同源托管固定的 1.9.4 发行文件和许可证，发布时完整复制 `vendor/leaflet/` |
| 外部导航被浏览器拦截 | 必须由用户点击同步打开新窗口，失败时保留坐标信息 |

## 6. 回滚

- `/api/config` 新字段为可选，旧网页和其他客户端会忽略。
- 回滚网页静态文件即可恢复国内版本，后端海外接口不回滚。
- 瓦片 Key 可以独立吊销，不影响后端 Geoapify POI Key。
- 生产切换前保留上一版 `index.html`、`app.js`、`styles.css`。

## 7. 验证方式

- 自动化和人工矩阵见 `acceptance.md`。
- 地图底图、浏览器定位、右键/长按、外部导航、主题和窄屏必须在真实浏览器验证，Node 单元测试不能替代。
- 海外至少验证新加坡、莫斯科、东京、伦敦、纽约、悉尼；国内至少验证无锡和当前真实定位城市。

## 8. 待确认

- Leaflet 已确定为同源发行文件，不再待确认。
- Geoapify 瓦片 Key 来源限制和生产额度。
- 是否在第一版增加 Apple Maps 外部导航。
