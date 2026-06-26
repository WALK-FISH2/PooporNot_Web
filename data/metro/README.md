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

## 自动兜底

如果某个城市还没有人工维护的线路 JSON，后端仍会用高德 POI 按当前位置搜索附近地铁站，默认半径为 20km。

自动兜底站点会显示为：

- `lineName`: `附近地铁站`
- `toilet`: `2`
- `source`: `amap`

人工维护的线路数据优先级更高。后续确认某个城市的线路、颜色和厕所状态后，应补充到对应城市目录下的 `line_*.json`。
