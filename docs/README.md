# 开发文档索引

状态：Active

## 1. 事实口径

正式项目根目录是当前目录的上一级。文档按以下优先级判断事实：

1. 当前实际代码、配置和数据：确认“现在实际是什么”。
2. 项目开发对话和 `CHANGELOG.md`：解释“为什么这样实现”和演变过程。
3. 根目录外的旧 Word 文档与审核材料：只做辅助交叉参考，不能覆盖代码事实。

发现冲突时必须在对应文档写出“当前事实”“历史说法”和“待确认”，不能靠猜测消除冲突。

## 2. 状态说明

- `Draft`：结构已建立，但存在尚未批准的流程、计划或重要待确认项。
- `Active`：已与当前代码核对，可作为开发依据。
- `Deprecated`：只保留历史价值，不应用于新开发。

状态描述文档本身，不代表其中每个功能都已实现。各文档仍会用“当前有效、曾经实现但已移除、尚未实现、已放弃、无法确认”区分功能状态。

## 3. 文档地图

| 文档 | 状态 | 用途 |
| --- | --- | --- |
| `constitution.md` | Active | 长期产品、工程、数据和隐私原则 |
| `spec.md` | Active | 当前产品与三端系统规格 |
| `architecture.md` | Active | 系统组件、数据流和平台差异 |
| `api.md` | Active | `server.js` 当前 API 契约 |
| `configuration.md` | Active | 后端、网页、小程序和 Android 配置 |
| `metro-data.md` | Active | 地铁 JSON schema、盘点和维护流程 |
| `development.md` | Active | 本地开发、调试和常见问题 |
| `development-history.md` | Active | 项目演变和已移除方案 |
| `security-privacy.md` | Active | 当前数据流、权限和风险 |
| `testing.md` | Active | 当前测试现状与最低验证矩阵 |
| `deployment.md` | Draft | 与代码兼容的部署方案，实际基础设施待确认 |
| `release.md` | Draft | 建议发布流程，负责人和版本策略待确认 |
| `roadmap.md` | Draft | 建议优先级，尚未承诺排期 |
| `adr/` | Active/Draft | ADR-0001 与 ADR-0002 已接受；索引和模板仍为 Draft |
| `specs/` | Active/Draft | 小程序与网页版全球 POI 已实现；各自仍有真机或真实浏览器发布验收项 |

## 4. 当前事实清单

盘点日期：2026-08-05。

- 正式根目录包含网页、统一 Node 后端、微信小程序、Android 和共享地铁数据。
- `server.js` 默认监听 `5174`，同时提供 API 和网页静态文件。
- 小程序生产目标 API 基址为 `https://pp.nuanzhualife.cn`；当前活动开发地址以 `WhereToPoop/miniprogram/config/api.ts` 为准。
- 网页与 Android 调用 `/api/navigation`；小程序只使用 `wx.openLocation`。
- 三端共用 `data/metro`；线路 JSON 不保存坐标。
- 地铁只按专用按钮查询基准点 20 km 内最近 10 站；小程序不再预加载地铁。
- 地铁状态颜色为绿色 `1`、红色 `0`、橙色 `2`。
- `city_index.json` 有 52 个城市索引；实际 5 个城市目录、21 个线路文件、408 条站点记录。
- 当前站点状态：`1` 共 86 条，`2` 共 322 条，`0` 为 0 条。
- 小程序已实现海外地点、厕所和地铁查询：Geoapify 负责海外地理编码与 POI，海外坐标保持 WGS84。
- 首批海外城市配置位于 `data/global/cities.json`；网页已采用国内高德、海外 Leaflet + Geoapify Tiles 的双地图实现；Android 仍未规划海外 UI。
- 仓库已有 21 个 Node 自动化测试和小程序 TypeScript 类型检查，但没有 CI；微信真机和网页真实设备发布验收仍待完成。
- `.env.example` 已改为纯占位符并纳入版本控制；真实 Key 只保存在被忽略的 `.env`。

## 5. 维护规则

- 业务代码、配置、数据或正式文档发生变化时，追加 `CHANGELOG.md`。
- 修改 API 时更新 `api.md` 和所有受影响客户端类型。
- 修改配置时更新 `configuration.md`、部署说明和安全影响。
- 修改地铁数据时更新 `metro-data.md` 的盘点统计。
- 重大跨模块决策在 `adr/` 新增记录。
- 较大功能从 `specs/_template/` 建立规格、计划和任务。
- 文档只使用项目根目录相对路径，不写个人机器绝对路径。

## 6. 待确认

- 文档责任人、评审周期和批准流程。
- 统一版本策略和首个正式发布基线。
- 线上基础设施、Android 发布与密钥轮换状态。
