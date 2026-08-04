# 地铁厕所数据

状态：Active

本目录是网页、微信小程序和 Android 共用的地铁厕所状态数据源。完整 schema、当前盘点、坐标匹配和维护流程见 `docs/metro-data.md`。

## 目录

```text
data/metro/
  city_index.json
  <provinceSlug>/
    <citySlug>/
      line_1.json
      line_s1.json
```

`city_index.json` 只表示城市与英文目录的映射。城市在索引中存在，不代表已经有线路文件。

## 线路示例

```json
{
  "id": "wuxi_line_1",
  "name": "Wuxi Metro Line 1",
  "displayName": "无锡地铁1号线",
  "color": "#c8102e",
  "source": "AMap POI station list, manual toilet status",
  "stations": [
    { "name": "堰桥", "toilet": 1 },
    { "name": "三阳广场", "toilet": 2 }
  ]
}
```

## 状态

- `1`：有厕所，绿色。
- `0`：没有厕所，红色。
- `2`：不确定，橙色 `#F59E0B`。

站点不保存坐标。后端通过高德按城市批量获取站点位置，再用站名匹配厕所状态。

## 当前盘点

截至 2026-08-04：

- 52 个城市索引。
- 5 个城市目录有线路文件。
- 21 个线路文件。
- 408 条站点记录：`1` 共 86 条，`2` 共 322 条，`0` 为 0 条。

## 修改规则

1. 站名使用可被高德匹配的正式中文名。
2. 未确认状态保持 `2`，不得猜测。
3. 不添加经纬度。
4. 跨市重复线路同步检查所有副本。
5. JSON 修改后重启后端清除内存坐标索引。
6. 更新 `docs/metro-data.md` 统计和根 `CHANGELOG.md`。
