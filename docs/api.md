# 后端 API

状态：Active

实现来源：`server.js`。本文记录当前代码行为，不代表外部地图服务的长期稳定契约。

## 1. 通用约定

- 协议：HTTP/HTTPS 由部署环境决定；正式小程序必须通过 HTTPS 域名访问。
- API 方法：当前均为 `GET`；预检请求支持 `OPTIONS`。
- 数据格式：API 成功和失败均返回 UTF-8 JSON。
- 跨域：当前响应 `Access-Control-Allow-Origin: *`，允许 `GET,OPTIONS`。
- 认证：当前无认证、签名或用户会话。
- 坐标：客户端与后端使用经度 `lng`、纬度 `lat`；地图交互统一按 GCJ-02 使用。
- 非 API 路径：由后端从项目根目录提供静态文件。

失败响应的通用结构：

```json
{ "error": "错误说明" }
```

## 2. 接口目录

### 2.1 `GET /api/health`

用途：进程健康检查。

请求参数：无。

成功响应：

```json
{ "ok": true }
```

该接口不依赖高德 Key，只证明 Node 进程能响应，不验证外部服务、地铁文件或证书状态。

### 2.2 `GET /api/config`

用途：给网页版提供高德 JS API 浏览器配置。

成功响应：

```json
{
  "jsKey": "...",
  "securityJsCode": "..."
}
```

`AMAP_JS_KEY` 和 `AMAP_SECURITY_JS_CODE` 会发送到浏览器，因此必须在高德控制台配置域名限制。`AMAP_WEB_SERVICE_KEY` 不会由此接口返回。

### 2.3 `GET /api/location/reverse`

用途：根据基准坐标识别省市，用于自动填写当前城市。

参数：

| 名称 | 必填 | 说明 |
| --- | --- | --- |
| `lng` | 是 | 经度，范围 `-180..180` |
| `lat` | 是 | 纬度，范围 `-90..90` |

成功响应示例：

```json
{
  "province": "江苏",
  "city": "无锡",
  "provinceSlug": "jiangsu",
  "citySlug": "wuxi"
}
```

直辖市以省级名称作为城市回退值；其他地区在高德未返回 `city` 时使用 `district` 回退。

### 2.4 `GET /api/places`

用途：切换城市、搜索具体地点并选择查询基准点。

参数：

| 名称 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `city` | 否 | 空 | 城市名；有值时普通文本搜索启用 `citylimit` |
| `keywords` | 否 | 空 | 小区、商场、地铁站或地址关键词 |
| `mode` | 否 | 空 | 值为 `city` 时改用地理编码定位城市 |
| `limit` | 否 | `10` | 约束到 `1..25` |

`city` 和 `keywords` 至少需要一个。普通搜索没有结果时会尝试地理编码回退。

成功响应示例：

```json
{
  "city": "无锡",
  "keywords": "三阳广场",
  "places": [
    {
      "id": "高德 POI ID",
      "name": "三阳广场",
      "address": "...",
      "cityName": "无锡",
      "district": "梁溪区",
      "distance": 0,
      "type": "...",
      "tel": "...",
      "longitude": 120.0,
      "latitude": 31.0,
      "location": { "lng": 120.0, "lat": 31.0 }
    }
  ]
}
```

当 `mode=city` 时，响应保留 `city` 和 `places`，不保证存在 `keywords` 字段。

### 2.5 `GET /api/toilets`

用途：搜索基准点附近公共厕所。

参数：

| 名称 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `lng` | 是 | - | 基准点经度 |
| `lat` | 是 | - | 基准点纬度 |
| `radius` | 否 | `1000` | 米，约束到 `100..50000` |
| `keywords` | 否 | `公共厕所` | 高德周边搜索关键词 |
| `limit` | 否 | `100` | 约束到 `25..200` |

后端固定每页请求 25 条，按距离排序，并最多请求 `ceil(limit / 25)` 页。第 2 页起每页等待 `AMAP_PAGE_DELAY_MS`。一个客户端请求不是“每返回一个厕所消耗一次请求”，而是通常每页消耗一次高德周边搜索调用。

成功响应示例：

```json
{
  "pois": [],
  "radius": 1000,
  "total": 0,
  "partial": false
}
```

- `pois`：与地点结果相同的标准化 POI 结构。
- `total`：高德报告的结果总数，不保证等于本次返回数量。
- `partial`：已有部分结果后遇到高德限流时为 `true`。

### 2.6 `GET /api/navigation`

用途：查询步行路线。当前消费者是网页版和 Android；微信小程序已停止调用。

参数：

| 名称 | 必填 | 说明 |
| --- | --- | --- |
| `origin` | 是 | `lng,lat` |
| `destination` | 是 | `lng,lat` |

成功响应示例：

```json
{
  "distance": 850,
  "duration": 720,
  "points": [
    { "longitude": 120.0, "latitude": 31.0 }
  ],
  "steps": [
    { "instruction": "向北步行...", "distance": 100, "duration": 80 }
  ]
}
```

`distance` 单位为米，`duration` 单位为秒。高德返回 `OVER_DIRECTION_RANGE` 时，后端转换为 HTTP 400 和面向用户的“距离过远”说明，不再导致 Node 进程退出。

### 2.7 `GET /api/metro/nearby`

用途：返回基准点一定范围内的地铁站及厕所状态。

参数：

| 名称 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `lng` | 是 | - | 基准点经度 |
| `lat` | 是 | - | 基准点纬度 |
| `radius` | 否 | `20000` | 米，约束到 `1000..50000` |
| `debugCity` | 否 | 空 | 调试时覆盖响应中的城市名；不限制空间过滤范围 |

成功响应示例：

```json
{
  "city": "无锡",
  "hasMetro": true,
  "location": {
    "province": "江苏",
    "city": "无锡",
    "provinceSlug": "jiangsu",
    "citySlug": "wuxi"
  },
  "radius": 20000,
  "lines": [],
  "stations": [
    {
      "name": "三阳广场",
      "toilet": 1,
      "longitude": 120.3,
      "latitude": 31.57,
      "lineId": "wuxi_line_1",
      "lineName": "无锡地铁1号线",
      "lineColor": "#c8102e",
      "city": "无锡",
      "province": "江苏",
      "distance": 1000
    }
  ]
}
```

行为说明：

- 后端扫描实际存在地铁线路文件的城市，而不是只按当前行政城市加载。
- 人工线路站名与高德城市地铁站索引匹配后，再按坐标和半径过滤。
- 同时调用高德周边搜索补充附近地铁站；补充项使用 `toilet: 2`、`lineName: "附近地铁站"`、`source: "amap"`。
- `stations` 按距离升序返回，并按规范化站名与约 1e-4 度坐标去重。
- `lines` 只含人工线路中落在范围内且成功匹配坐标的站点；客户端当前主要使用扁平 `stations`。
- 当前 `slugifyCn` 只有江苏、无锡和南京的显式英文别名；其他纯中文省市可能得到空 slug。附近地铁主流程不依赖这些 slug，但接口消费者不应假定它们总是非空。

## 3. 错误状态

| 场景 | HTTP 状态 | 响应 |
| --- | --- | --- |
| 坐标或必填参数无效 | `400` | `{ "error": "..." }` |
| 步行路线不存在 | `404` | `{ "error": "没有找到可用步行路线" }` |
| 高德返回业务错误或配额错误 | `502` | `{ "error": "高德错误信息" }` |
| 其他未处理错误 | `500` | `{ "error": "..." }` |
| 静态文件不存在 | `404` | 纯文本 `Not found` |

`AMAP_WEB_SERVICE_KEY` 缺失当前会抛出普通错误并返回 HTTP 500。

## 4. 配额与性能

- `/api/toilets` 默认最多触发 4 次高德周边搜索；若结果不足 25 条会提前停止。
- `/api/metro/nearby` 首次运行可能为每个已维护城市建立分页地铁站索引，随后同一进程复用内存缓存；另有最多 4 页的附近地铁站兜底请求。
- 地铁缓存没有 TTL；修改站点坐标来源或高德数据后需要重启后端才能刷新。
- 当前没有服务器端请求限流、熔断或厕所查询缓存。

## 5. 兼容与变更规则

- 客户端不得依赖未记录的高德原始字段。
- 新增字段优先保持向后兼容；删除或改名字段前应建立 ADR 或功能规格。
- 修改接口后同步更新 `docs/api.md`、相关客户端类型和 `CHANGELOG.md`。

## 6. 待确认

- API 版本化方案，例如是否引入 `/api/v1/`。
- 生产环境认证、滥用防护和请求限流策略。
- `debugCity` 是否应仅在开发环境启用。
- 对外 SLA、超时和重试约定。
