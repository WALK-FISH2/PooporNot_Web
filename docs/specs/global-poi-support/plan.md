# 全球厕所与地铁支持实施计划

- 状态：Draft（代码对照与冲突确认已完成，待实施）
- 规格：`spec.md`
- 验收：`acceptance.md`
- ADR：`../../adr/0001-global-poi-and-coordinate-strategy.md`

## 1. 实施原则

1. 先读代码，后定方案，再改代码。
2. 保留国内成熟业务，仅增加必要能力。
3. 国内外共用“查询中心”语义，并把地图视口中心与正式查询中心分开管理。
4. 文字地点和地图选点保留“先选定，再点击查厕所”的两步流程。
5. 厕所和地铁保持独立触发与图层；同一查询中心下刷新一类结果不清除另一类 marker。
6. 国内使用 GCJ-02，海外使用 WGS84。
7. 小程序只调用自己的后端；Geoapify Key 不进入客户端。
8. 第一版先跑通链路，不引入数据库、Redis或持久化缓存。
9. 外部接口必须可替换，业务层不得散落供应商专用字段。

## 2. 阶段 0：现有代码审计与冲突门禁

Codex 首先输出一份代码对照结果，不得直接实施。

### 2.1 必查内容

- `WhereToPoop/` 页面结构、地图组件与事件；
- 当前城市和城市列表结构；
- 当前定位流程；
- 当前查询中心变量；
- 国内地点搜索接口及结果选中流程；
- 半径选择组件和自动查询行为；
- 厕所查询请求、marker 和结果列表；
- 地铁专用按钮及查询基准；
- 导航函数；
- `server.js`、`app.js` 或其他后端路由；
- 环境变量加载方式；
- 国内高德坐标与腾讯地图坐标的实际处理。

### 2.2 输出物

输出：

- 现有流程图；
- 可直接复用的代码；
- 必须新增的代码；
- 可能调整的代码；
- 不应修改的代码；
- 冲突清单。

若存在冲突，进入等待确认状态。无冲突或冲突已确认后才能进入阶段 1。

### 2.3 审查结论与已确认决策

现有代码对照已于 2026-08-04 完成，C-01 至 C-04 已于 2026-08-05 由用户确认：

- 取消启动、重新定位、城市切换和地点选择时的地铁预加载；
- 地铁只在点击专用按钮后查询，范围为查询中心 20 km 内，后端最多返回最近 10 个站点；
- 文字地点和地图长按选点只建立查询中心，不自动查询厕所或地铁；
- 用户点击“查厕所”后才查询；已有查询中心时，半径变化仍立即刷新厕所；
- 切换城市只更新地图视口，清空 `queryCenter` 和旧结果；未选择地点时按钮和半径变化只提示，不发请求；
- 点击地铁按钮保留已有厕所 marker；查询厕所也保留同一查询中心下已有地铁 marker；
- 查询中心发生变化时清除旧厕所、旧地铁和对应 marker。

## 3. 目标逻辑架构

以下是逻辑分层，不强制对应具体文件名；最终文件位置应遵循现有项目结构。

```text
微信小程序页面
├─ 地区/城市状态
├─ 查询中心状态
├─ 厕所查询交互
├─ 地铁按钮交互
├─ 地点搜索交互
├─ 地图长按选点
└─ 导航
        ↓
拉了么后端统一 API
├─ 国内现有服务适配
├─ Geoapify Geocoding 适配
├─ Overpass POI 适配
├─ Geoapify Places 兜底适配
├─ 规范化与去重
└─ 距离计算、排序和截断
        ↓
第三方服务
├─ 高德（国内现有）
├─ Overpass（海外 POI 主接口）
└─ Geoapify（海外地理编码与 POI 兜底）
```

## 4. 统一领域模型

不要求强行替换现有所有类型，但海外数据进入业务层前必须规范化。

建议最小结构：

```ts
type CoordinateSystem = "GCJ02" | "WGS84";
type SearchCenterSource =
  | "current-location"
  | "place-search"
  | "map-selection";

type Provider = "amap" | "overpass" | "geoapify" | "local";

interface SearchCenter {
  latitude: number;
  longitude: number;
  coordinateSystem: CoordinateSystem;
  countryCode: string;
  cityId?: string;
  source: SearchCenterSource;
}

interface NormalizedPlace {
  id: string;
  sourceId: string;
  source: Provider;
  providerUsed: Provider;
  type: "toilet" | "subway";
  name: string;
  latitude: number;
  longitude: number;
  coordinateSystem: CoordinateSystem;
  countryCode: string;
  distanceMeters?: number;
  toiletStatus?: 0 | 1 | 2;
  retrievedAt: string;
}
```

重点：

- 用户当前位置仍是默认查询中心；
- 文字搜索和地图选点只是在现有来源上新增或切换查询中心；
- 国内现有代码若已有等价结构，应扩展而不是重复创建一套平行状态。

## 5. 城市配置

首批海外城市配置至少包含：

```ts
interface OverseasCityConfig {
  id: string;
  countryCode: string;
  nameZh: string;
  nameLocal?: string;
  center: { latitude: number; longitude: number };
  defaultScale: number;
  geocodingFilter: {
    // 采用经验证的城市边界、边界 ID 或矩形范围；不得随意猜测。
  };
  verified: true;
}
```

城市：新加坡、莫斯科、东京、伦敦、纽约、悉尼。

实施要求：

- 城市边界必须用于海外当前城市内地点搜索的硬限制；
- `bias=proximity` 只用于排序；
- 不应仅用城市名称字符串相等判断；
- 城市范围数据来源和确定方法写入代码注释或配置说明；
- 第一版不维护全球城市列表。

## 6. 后端供应商适配

### 6.0 国内地铁按需查询

国内地铁从“客户端提前加载、后端冷启动扫描多个数据城市”改为按按钮请求：

- 请求必须携带当前正式查询中心、固定 `radius=20000` 和 `limit=10`；
- 后端优先执行以查询中心为圆心的单次周边地铁站查询，再按真实距离排序和截断；
- 本地 `data/metro` 继续作为厕所状态来源，通过城市与规范化站名匹配周边结果；
- 不得为了返回 10 个站点重新逐城分页建立全部站点坐标索引；
- 外部响应多于 10 条不等于多次请求，配额优化重点是取消自动请求和多城市分页扫描；
- 无法匹配本地状态的国内站点使用 `toilet: 2`。

### 6.1 Overpass

逻辑配置：

```env
OVERPASS_API_URL=https://overpass-api.de/api/interpreter
```

要求：

- 使用后端请求；
- POST 提交 Overpass QL；
- 设置明确超时，初始建议 8 秒，可经测试调整；
- 为请求提供可识别的应用 User-Agent；
- 处理超时、429、5xx、网络错误和非法响应；
- 不需要 API Key；
- 不做多个公共实例轮询；
- 失败后快速进入 Geoapify 兜底。

厕所查询逻辑：

```overpass
[out:json][timeout:20];
(
  nwr["amenity"="toilets"](around:RADIUS,LAT,LNG);
);
out center tags;
```

地铁查询应覆盖站点级常见标签组合，但不得查询 `railway=subway_entrance` 作为站点结果。具体组合在实施时根据 OSM 数据测试确定，并在代码中集中维护。

### 6.2 Geoapify Geocoding

用途：

- Reverse Geocoding：首次当前位置识别国家和城市；
- Forward Geocoding：其他地区模式下的当前城市内地点搜索。

要求：

- 使用同一个后端 Geoapify 项目 Key；
- Forward Geocoding 使用城市硬过滤；
- 不依赖后端服务器 IP 的自动国家偏向；
- 用户点击“搜地点”才发起请求；
- 结果进入客户端前统一格式；
- Geoapify 失败不得破坏国内现有搜索。

### 6.3 Geoapify Places

用途：

- Overpass 海外厕所查询失败兜底；
- Overpass 海外地铁查询失败兜底。

分类：

- 厕所：`amenity.toilet`；
- 地铁：`public_transport.subway`。

要求：

- 厕所最多返回并展示最近 100 个；
- 地铁结果按现有国内业务所需范围处理；
- 对返回结果再次计算距离和排序；
- 明确返回 `providerUsed=geoapify` 和 `isFallback=true`。

## 7. 后端 API 设计策略

不要在未阅读现有 API 前强制创建新的 URL。优先扩展现有接口，保证国内调用兼容。

逻辑上应支持以下操作：

- 当前位置逆地理编码；
- 当前城市内地点搜索；
- 按查询中心和半径查询厕所；
- 按查询中心查询附近地铁；

每个请求至少传递：

- 纬度；
- 经度；
- 坐标系或地区模式；
- 国家代码/城市 ID（地点搜索必需）；
- 半径（厕所）；
- 地铁固定半径 `20000` 和结果上限 `10`；
- 请求类型。

每个响应至少包含：

- 规范化地点数组；
- 实际供应商；
- 是否兜底；
- 是否被数量上限截断；
- 原始数量和展示数量；
- 可面向用户显示的提示代码；
- 可诊断但不泄露密钥的错误信息。

## 8. 客户端状态流

### 8.1 首次进入

```text
获取当前位置
→ Geoapify Reverse Geocoding 识别地区
→ 设置地区模式与城市
→ 设置当前位置为默认查询中心
→ 自动查询当前半径厕所
→ 不查地铁
```

必须先确认现有国内定位流程，再决定是否需要额外获取 WGS84 或 GCJ-02。

### 8.2 切换地区/城市

```text
选择地区或城市
→ 移动地图到城市中心
→ 清理上一城市数据和临时状态
→ queryCenter 置空，不设置城市中心为正式查询中心
→ 不查厕所
→ 不查地铁
→ 按钮或半径操作仅提示先选择地点
```

### 8.3 地点搜索

```text
输入关键词
→ 点击搜地点
→ 当前城市内搜索
→ 用户点击结果
→ 设置查询中心
→ 移动地图
→ 清除旧厕所和旧地铁结果及 marker
→ 等待用户点击查厕所
→ 不查地铁
```

### 8.4 地图选点

```text
长按地图
→ 临时图钉 + 选这里
→ 点击选这里
→ 设置查询中心
→ 清除旧厕所和旧地铁结果及 marker
→ 等待用户点击查厕所
→ 不查地铁
```

### 8.5 切换半径

```text
切换 300m/500m/1km/3km
→ 保持当前查询中心
→ 立即重新查厕所
→ 不查地铁
```

如果尚未形成正式查询中心，不发起查询，并给出符合现有 UI 的提示。

### 8.6 查看地铁

```text
点击现有专用按钮
→ 使用当前查询中心
→ 国内：按需高德周边查询并匹配本地状态
→ 海外：Overpass，失败后 Geoapify
→ 后端筛选 20 km 内最近 10 个站点
→ 保留厕所 marker，替换并显示地铁 marker
```

没有正式查询中心时不请求地铁，并提示先选择地点。重复点击需要防并发，旧响应不得覆盖新查询中心状态。

## 9. 地图长按实现策略

实施前检查原生 `<map>` 当前事件绑定和基础库版本。

要求：

- 使用地图组件支持的长按事件；
- 临时 marker 与厕所、地铁、查询中心 marker 使用不同 ID 空间；
- “选这里”控件不能阻碍地图基础交互；
- 新长按覆盖旧临时点；
- 切换城市、选择地点、重新定位时清除临时点；
- 只有点击“选这里”才写入正式查询中心；
- 确认“选这里”后清除旧厕所和旧地铁，但不自动查询；
- 后续“查厕所”和地铁按钮都使用这个选中点；
- 国内和海外共用交互，坐标系按当前地区处理。

## 10. 坐标处理

### 10.1 地区规则

```text
中国大陆：GCJ-02 → 腾讯地图 marker → wx.openLocation
海外：WGS84 → 腾讯海外地图 marker → wx.openLocation
```

### 10.2 禁止项

- 禁止无条件将全球坐标转为 GCJ-02；
- 禁止把海外 WGS84 以 GCJ-02 标记；
- 禁止把国内高德结果当成 WGS84；
- 禁止使用用户 IP、语言或界面模式单独决定目的地坐标系；
- 禁止在不同函数中复制不一致的转换判断。

### 10.3 建议集中函数

可建立集中能力：

- `normalizeProviderPlace(...)`；
- `getMapDisplayCoordinate(...)`；
- `getNavigationCoordinate(...)`；
- `isMainlandDestination(...)`。

当前海外的展示坐标与导航坐标均返回原始 WGS84；函数分层是为了防止未来扩展时混用。

## 11. 去重、距离和数量限制

### 11.1 距离

- 后端使用统一公式计算直线距离；
- 不完全依赖第三方返回的 distance；
- 结果按距离升序；
- 距离计算输入必须是同一坐标基准下的经纬度。

### 11.2 厕所

- Overpass：最近 200 个；
- Geoapify：最近 100 个；
- 超过阈值必须返回截断提示。

### 11.3 地铁

去重建议综合：

- OSM stop_area / relation 关联；
- 标准化站名；
- 极近距离；
- 相同网络或线路信息；
- node/way/relation 的主对象优先级。

不得简单按同名全局去重，以免合并不同站点。

所有国内外地铁结果最终按查询中心直线距离升序，并只返回 20 km 内最近 10 个站点。

## 12. 并发与无缓存第一版

第一版不做持久缓存，但至少实现：

- 请求序号或 AbortController，防止旧结果覆盖新结果；
- 相同请求指纹防并发；
- 查询按钮/半径状态的加载保护；
- 页面离开后忽略响应；
- 地铁按钮重复点击保护；
- 不因地图移动触发接口。

厕所和地铁分别维护请求状态与结果集合。同一查询中心下刷新其中一类时保留另一类数据；查询中心改变时同时淘汰两类旧响应。

后续缓存作为独立迭代：厕所 12–24 小时、地铁 7–30 天，仅作为路线图，不在本轮实现。

## 13. 错误与降级顺序

### 13.1 厕所/地铁

```text
Overpass
→ 超时/429/网络/5xx/非法数据
→ Geoapify Places
→ 仍失败
→ 用户友好错误 + 诊断日志
```

### 13.2 地理编码

- Reverse Geocoding 失败：不应把海外坐标误判为大陆；允许用户手动切换地区/城市；
- Forward Geocoding 失败：保留地图和已有查询中心，不清空有效结果；
- 无结果：显示当前城市内无匹配地点。

## 14. 安全与隐私

- Geoapify Key 只在后端；
- 后端对经纬度、半径、城市 ID 和模式进行校验；
- 不允许客户端传任意第三方 URL；
- 日志不记录 Key；
- 位置只用于完成附近查询，不在本轮建立用户轨迹存储；
- 现有隐私授权和用途说明如受影响，完成实现后同步更新项目文档和小程序配置。

## 15. 文档同步

代码完成并通过验收后，由 Codex 根据真实实现同步：

- `docs/README.md`；
- `docs/architecture.md`；
- `docs/api.md`；
- `docs/configuration.md`；
- `docs/testing.md`；
- `docs/metro-data.md`；
- `docs/security-privacy.md`；
- 根目录 README/CHANGELOG（仅在项目规则要求时）。

同步原则：

- 合并到合适章节；
- 不机械追加到末尾；
- 不复制尚未实现的设计；
- 记录最终接口、变量和文件路径；
- 与本规格不一致的实现必须注明经用户确认的变更。

## 16. 官方参考

- Geoapify Places API：`https://apidocs.geoapify.com/docs/places/`
- Geoapify Forward Geocoding：`https://apidocs.geoapify.com/docs/geocoding/forward-geocoding/`
- Geoapify Reverse Geocoding：`https://apidocs.geoapify.com/docs/geocoding/reverse-geocoding/`
- Overpass API 文档：`https://dev.overpass-api.de/overpass-doc/en/`
- Overpass 公共实例使用说明：`https://dev.overpass-api.de/overpass-doc/en/preface/commons.html`
- 腾讯位置服务坐标 FAQ：`https://lbs.qq.com/faq/latlngFaq`
- 腾讯海外 WebService 概览：`https://lbs.qq.com/service/webService/webServiceGuide/Overseas/Overview`
