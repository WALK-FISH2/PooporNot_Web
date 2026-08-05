# ADR-0002：网页版全球地图采用国内高德与海外 Leaflet/Geoapify

状态：Active

日期：2026-08-05

## 背景

网页版当前只使用高德 JS API 2.0。微信小程序已经通过统一后端支持海外地点、厕所和地铁，海外数据保持 WGS84。网页版需要同步这部分能力，但现有高德 Key 没有世界地图高级权限；高德官方世界地图需要额外申请权限并设置 `showOversea: true`。

项目同时受到以下约束：

- 国内高德和 GCJ-02 业务已稳定，不允许为了海外功能重新设计；
- 现有网页是无框架的静态 HTML/CSS/JavaScript；
- 后端已经使用 Geoapify 提供海外地点和 POI；
- 海外 marker 必须保持 WGS84；
- 真实服务器 Geoapify Key 不得进入网页；
- 正式底图需要明确服务条款、配额和署名，不应依赖无 SLA 的公共瓦片。

## 决策

1. 中国大陆继续使用高德 JS API 2.0、高德底图和 GCJ-02。
2. 其他地区使用 Leaflet 1.9.4、Geoapify 地图瓦片和 WGS84。
3. 业务层通过网页内部地图适配器操作中心、marker、视口、主题、路线和选点事件。
4. 海外 POI 继续通过统一后端调用 Geoapify；地图瓦片由浏览器直接请求 Geoapify。
5. 新增独立的浏览器瓦片凭据 `GEOAPIFY_MAP_TILE_KEY`，不复用后端 `GEOAPIFY_API_KEY`。
6. 真实瓦片 Key 只在服务器 `.env` 中配置，经 `/api/config` 作为客户端凭据返回；该值在浏览器中可见，因此依赖独立配额、轮换和可用的来源限制，而不是保密。
7. 国内路线继续使用 `/api/navigation`；海外导航使用原始 WGS84 打开 Google Maps 外部 directions 链接。
8. 不使用公共 `tile.openstreetmap.org` 作为生产底图。

## 备选方案

### 1. 为高德 Key 申请世界地图权限

未采用。它的客户端改动最少，但当前没有高级权限，申请需要额外商务流程，并形成海外功能对该权限的持续依赖。

### 2. 全部地区改用 Leaflet/Geoapify

未采用。会重写已经稳定的国内高德底图、GCJ-02 marker、路线和主题，违反国内业务最小改动原则。

### 3. 海外使用 MapLibre GL + Geoapify 矢量瓦片

暂不采用。MapLibre 的矢量样式和渲染能力更强，但第一版只需要二维底图、marker、折线和选点；Leaflet 更轻量，也更符合现有无构建网页。

### 4. Leaflet 直接使用 OpenStreetMap 公共标准瓦片

不用于生产。OSM 数据可以使用，但 OSMF 公共瓦片服务没有 SLA，可能因负载或违反政策被阻断，不适合作为正式产品的稳定依赖。

### 5. 后端代理 Geoapify 全部瓦片

未采用。虽然可以隐藏上游 Key，但会把大量瓦片带宽、缓存、并发和 CDN 职责转移到当前 Node 后端，明显扩大运维范围。

### 6. Google Maps、Mapbox 或 MapTiler

暂不采用。均需要新增供应商账号、凭据、计费和维护；当前 Geoapify 已承担海外 POI，优先减少供应商数量。

## 后果

### 正面

- 国内地图和路线保持原样，回归范围可控。
- 海外 POI 与底图均基于 OSM/Geoapify，WGS84 对齐路径清晰。
- Leaflet 适合当前静态网页，并原生支持桌面右键和移动长按 `contextmenu`。
- 瓦片 Key 与后端 POI Key 分离，可独立轮换和停止。

### 代价

- 网页需要维护两个地图引擎和一层适配器。
- 海外瓦片会消耗 Geoapify credits；拖动、缩放和主题切换都可能增加用量。
- 浏览器瓦片 Key 无法真正保密，必须接受公开客户端凭据模型。
- 海外浏览器会直接连接 Geoapify，隐私文本和署名需要同步。
- 主题、marker、视口和错误恢复必须分别验证两个引擎。

### 实施状态与后续工作

- 已按 `docs/specs/web-global-support/` 完成代码和本地核心回归；Leaflet 1.9.4 采用同源发行文件。
- 完成真实浏览器定位、移动端长按、外部导航弹窗和六城完整 UI 发布验收。
- 在 Geoapify 控制台确认来源限制和生产额度。
- 上线前记录普通视口瓦片用量，设置配额监控。
- 后续若需要矢量样式、海量 marker 或自定义图层，再单独评估 MapLibre。

## 关联

- 规格：`docs/specs/web-global-support/spec.md`
- 计划：`docs/specs/web-global-support/plan.md`
- 任务：`docs/specs/web-global-support/tasks.md`
- 验收：`docs/specs/web-global-support/acceptance.md`
- 关联 ADR：`docs/adr/0001-global-poi-and-coordinate-strategy.md`（仅微信小程序）
- 替代/被替代 ADR：无
