# ADR 索引

状态：Draft

架构决策记录用于说明重要且长期有效的技术选择。新 ADR 从 `0000-template.md` 复制，编号递增；已被替代的 ADR 标记为 `Deprecated`，并链接替代项。

## 当前记录

- `0001-global-poi-and-coordinate-strategy.md`：状态 `Accepted`。确定微信小程序全球 POI 数据源、GCJ-02/WGS84 坐标策略、查询中心、两步查厕所、按按钮查询地铁及 marker 图层规则。

## 待补决策

- 统一后端与多客户端共享 API。
- 地铁厕所状态与高德坐标分离。
- 小程序取消内置路线、改用 `wx.openLocation`。
