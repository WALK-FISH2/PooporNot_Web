# Metro toilet data

地铁厕所数据统一维护在这个目录下，网页端和小程序端都通过后端接口读取这里的数据。

## 目录结构

```text
data/metro/
  city_index.json
  jiangsu/
    wuxi/
      line_1.json
      line_2.json
```

`city_index.json` 负责把中文城市名映射到英文目录：

```json
{
  "province": "江苏",
  "provinceSlug": "jiangsu",
  "city": "无锡",
  "citySlug": "wuxi"
}
```

## 线路文件格式

每条线路一个 JSON 文件，建议命名为 `line_1.json`、`line_2.json` 或 `line_s1.json`。

```json
{
  "id": "wuxi_line_1",
  "name": "Wuxi Metro Line 1",
  "displayName": "无锡地铁1号线",
  "color": "#c8102e",
  "source": "AMap POI station list, manual toilet status",
  "stations": [
    { "name": "堰桥", "toilet": 1 },
    { "name": "锡北运河", "toilet": 1 }
  ]
}
```

`toilet` 字段含义：

- `1`: 有厕所
- `0`: 没有厕所
- `2`: 不确定

站点不需要写经纬度。后端会用高德按城市和站名查询站点位置。
