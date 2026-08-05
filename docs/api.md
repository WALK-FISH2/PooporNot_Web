# 后端 API

状态：Active

实现来源：`server.js`、`lib/`。本文记录 2026-08-05 当前代码行为。

## 1. 通用约定

- 所有 API 为 `GET`，预检支持 `OPTIONS`，成功和失败均使用 UTF-8 JSON。
- 当前 CORS 为 `Access-Control-Allow-Origin: *`，没有认证、签名或用户会话。
- 未传 `region=overseas` 的地点、厕所和地铁请求默认走原中国大陆高德链路。
- 中国大陆坐标为 `GCJ02`；海外请求必须显式传 `coordinateSystem=WGS84`。
- 海外国家代码使用两位小写 ISO 代码，例如 `sg`、`gb`。
- 非 API 路径由后端从项目根目录提供静态文件。

失败响应：

```json
{ "error": "错误说明" }
```

海外查询响应通常增加以下元数据；国内旧字段不删除：

```json
{
  "providerUsed": "geoapify",
  "isFallback": false,
  "truncated": false,
  "rawCount": 12,
  "displayCount": 12,
  "messageCode": "",
  "message": "",
  "coordinateSystem": "WGS84",
  "retrievedAt": "2026-08-05T00:00:00.000Z",
  "durationMs": 120
}
```

## 2. 基础接口

### 2.1 `GET /api/health`

返回 `{ "ok": true }`。它只证明进程可响应，不检查地图供应商、Key 或证书。

### 2.2 `GET /api/config`

给网页返回：

```json
{ "jsKey": "...", "securityJsCode": "..." }
```

`AMAP_JS_KEY` 与 `AMAP_SECURITY_JS_CODE` 会发送给浏览器；`AMAP_WEB_SERVICE_KEY` 和 `GEOAPIFY_API_KEY` 不返回。

### 2.3 `GET /api/global/cities`

返回海外文字搜索快捷城市。无参数，不调用外部服务。

```json
{
  "cities": [
    {
      "id": "singapore",
      "countryCode": "sg",
      "nameZh": "新加坡",
      "nameLocal": "Singapore",
      "center": { "latitude": 1.2899, "longitude": 103.8519 },
      "defaultScale": 11
    }
  ]
}
```

边界只保存在后端配置，不发送给小程序。

## 3. 地理编码与地点

### 3.1 `GET /api/location/reverse`

公共参数：

| 名称 | 必填 | 说明 |
| --- | --- | --- |
| `lng` | 是 | 经度 `-180..180` |
| `lat` | 是 | 纬度 `-90..90` |
| `scope` | 否 | `global` 时使用 Geoapify WGS84 识别国家；不传时使用高德国内链路 |

国内兼容响应包含 `province`、`city`、`provinceSlug`、`citySlug`，并增加 `countryCode=cn`、`regionMode=mainland`、`coordinateSystem=GCJ02`。

全局响应示例：

```json
{
  "province": "Singapore",
  "city": "Singapore",
  "district": "Downtown Core",
  "country": "Singapore",
  "countryCode": "sg",
  "cityId": "...",
  "regionMode": "overseas",
  "coordinateSystem": "WGS84",
  "providerUsed": "geoapify"
}
```

若全局逆地理结果国家为中国，`regionMode` 为 `mainland`，但本次返回坐标元数据仍是 `WGS84`；小程序随后重新获取 GCJ-02 进入国内流程。

### 3.2 `GET /api/places`

#### 国内兼容模式

| 名称 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `city` | 否 | 空 | 有值时高德文本搜索启用 `citylimit` |
| `keywords` | 否 | 空 | 地点或地址关键词 |
| `mode` | 否 | 空 | `city` 时使用高德地理编码移动城市视口 |
| `limit` | 否 | `10` | `1..25` |

`city` 和 `keywords` 至少一个有值。未传海外参数时响应仍含 `city`、`keywords` 和 `places`。

#### 海外模式

额外/替代参数：

| 名称 | 必填 | 说明 |
| --- | --- | --- |
| `region=overseas` | 是 | 选择海外分支 |
| `cityId` | 是 | `data/global/cities.json` 中的稳定 ID |
| `countryCode` | 是 | 必须与城市配置一致 |
| `keywords` | 是 | 用户点击“搜地点”时提交 |
| `coordinateSystem` | 否 | 当前客户端传 `WGS84`；地点搜索由城市配置决定坐标 |

Geoapify 请求同时使用城市矩形与国家代码硬过滤，后端再过滤边界外候选。仅有 proximity bias 不足以通过校验。后端会在上游自由文本中补充城市的 `nameLocal` 以帮助多语言消歧，例如 `悉尼大学, Sydney`；响应仍保留用户提交的原始 `keywords`。

成功结果按 `cityId + keywords + limit` 使用最多 5 分钟的进程内短缓存，最多保留 100 组；响应元数据中的 `cacheHit` 表示是否命中。该缓存不持久化，进程重启或多实例之间不会共享。

地点对象的兼容最小字段：

```json
{
  "id": "geoapify:...",
  "sourceId": "...",
  "source": "geoapify",
  "providerUsed": "geoapify",
  "type": "place",
  "name": "地点名",
  "address": "地址",
  "longitude": -0.12,
  "latitude": 51.50,
  "coordinateSystem": "WGS84",
  "countryCode": "gb",
  "retrievedAt": "..."
}
```

国内地点对象继续保留 `cityName`、`district`、`distance`、`tel` 和 `location` 等旧字段。

## 4. POI 查询

### 4.1 `GET /api/toilets`

公共参数：

| 名称 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `lng` / `lat` | 是 | - | 查询中心 |
| `radius` | 否 | `1000` | 国内约束 `100..50000`；海外实际约束 `100..3000` |
| `keywords` | 否 | `公共厕所` | 国内高德关键词；海外忽略 |
| `limit` | 否 | `100` | 国内约束 `25..200`；海外上限由供应商策略决定 |

海外还必须传 `region=overseas`、`coordinateSystem=WGS84` 和 `countryCode`。

国内保持高德每页 25 条、最多 `ceil(limit/25)` 页的行为。海外直接查询 Geoapify `amenity.toilet`，按后端计算距离筛选和排序，最多 100 个。

响应主字段：

```json
{
  "pois": [],
  "radius": 500,
  "total": 0,
  "partial": false,
  "providerUsed": "geoapify",
  "isFallback": false,
  "truncated": false,
  "message": ""
}
```

- 国内 `partial` 表示已有结果后遇到高德限流。
- 海外当前为 Geoapify 单供应商直连，正常响应 `partial=false`、`isFallback=false`。
- Geoapify 范围内超过 100 个时 `truncated=true`；响应只包含最近 100 个。

### 4.2 `GET /api/metro/nearby`

| 名称 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `lng` / `lat` | 是 | - | 查询中心 |
| `radius` | 否 | `20000` | 约束到 `1000..20000` |
| `limit` | 否 | `10` | 约束到 `1..10` |
| `debugCity` | 否 | 空 | 仅覆盖国内响应城市显示，不改变空间范围 |

海外还必须传 `region=overseas`、`coordinateSystem=WGS84`、`countryCode`；`cityId` 用于响应和诊断，不构成 POI 白名单。

国内每次只调用一次高德周边地铁站查询，按城市和规范化站名匹配 `data/metro` 状态。未匹配或有歧义时 `toilet=2`。海外直接查询 Geoapify `public_transport.subway`；海外站点统一 `toilet=2`。

响应保留旧主结构：

```json
{
  "city": "无锡",
  "hasMetro": true,
  "location": { "province": "江苏", "city": "无锡" },
  "radius": 20000,
  "lines": [],
  "stations": [
    {
      "name": "三阳广场",
      "toilet": 1,
      "longitude": 120.3,
      "latitude": 31.57,
      "lineName": "无锡地铁1号线",
      "distance": 1000,
      "coordinateSystem": "GCJ02"
    }
  ]
}
```

结果按距离升序并最多 10 个。地铁只由客户端专用按钮调用；接口本身不管理客户端触发时机。

## 5. 路线接口

### `GET /api/navigation`

参数为 `origin=lng,lat` 和 `destination=lng,lat`，调用高德步行路线，返回 `distance`、`duration`、`points` 和 `steps`。当前消费者是网页和 Android；微信小程序不调用。`OVER_DIRECTION_RANGE` 映射为 HTTP 400，不会使进程退出。

## 6. 错误状态

| 场景 | HTTP | 说明 |
| --- | ---: | --- |
| 参数、城市、国家或坐标系无效 | 400 | 可读 JSON 错误 |
| 步行路线不存在 | 404 | 无可用路线 |
| 高德业务错误 | 502 | 高德错误说明 |
| 单个第三方网络/HTTP/非法响应 | 502/503 | 客户端返回通用第三方服务错误 |
| Geoapify 请求超时 | 504 | 地点搜索提示响应较慢；其他接口提示第三方地点服务响应较慢 |
| 缺少 Geoapify Key | 503 | 明确缺少后端配置 |
| 其他未处理错误 | 500 | 服务器错误 |

日志中的供应商诊断会脱敏 Key；响应不返回完整第三方 URL 或密钥。

## 7. 兼容与限制

- 未传海外参数的原接口路径和核心字段保持兼容；国内地铁按已确认规格改为单次周边查询、20 km、最多 10 站。
- 海外范围暂不用于网页和 Android。
- 当前没有 API 版本、认证、服务器端缓存、重试轮询或请求限流。
- 修改契约时同步客户端类型、本文件和 `CHANGELOG.md`。

## 8. 待确认

- API 版本化、生产限流与滥用防护。
- Geoapify 配额预算、告警阈值和必要时的第二供应商方案。
- `debugCity` 是否只在开发环境暴露。
