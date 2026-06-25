# Metro Data

Metro toilet data is stored as local JSON files:

```text
data/
  metro/
    <province_en>/
      <city_en>/
        <line_id>.json
```

Example:

```text
data/metro/jiangsu/wuxi/line_1.json
```

Each line file contains one metro line and only the toilet status we maintain:

```json
{
  "id": "wuxi_line_1",
  "name": "Wuxi Metro Line 1",
  "displayName": "无锡地铁1号线",
  "color": "#c8102e",
  "source": "manual toilet status",
  "stations": [
    { "name": "堰桥", "toilet": 2 },
    { "name": "无锡火车站", "toilet": 1 },
    { "name": "三阳广场", "toilet": 0 }
  ]
}
```

Fields:

- `color`: line color used when we draw an optional overlay line.
- `toilet`: `1` means has toilet, `0` means no toilet, `2` means unknown.
- `stations[].name`: station name. Do not store coordinates here.

Coordinates are resolved by the backend through AMap POI search. The backend detects the current city, loads all local line files for that city, searches AMap for each station, then returns station coordinates plus the local toilet status.

The frontend does not draw metro line geometry. AMap already renders the real metro lines on the basemap, so we only add toilet-status station markers on top of AMap's station positions.
