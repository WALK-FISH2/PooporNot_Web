# 功能规格索引

状态：Draft

每个较大功能使用独立目录保存 `spec.md`、`plan.md` 和 `tasks.md`。目录名使用英文 kebab-case；完成后保留文档作为实现和验收依据。

## 当前规格

- `global-poi-support/`：微信小程序全球厕所与地铁支持，状态 `Draft`。业务代码已经实现，自动化已通过，微信真机验收仍未完成。
- `web-global-support/`：网页版全球厕所与地铁支持，状态 `Active`。代码与本地核心回归已完成，真实设备和生产发布验收仍待完成。

该规格目录包含：

- `global-poi-support/spec.md`：功能与业务规则；
- `global-poi-support/plan.md`：实施分层和顺序；
- `global-poi-support/tasks.md`：可执行任务清单；
- `global-poi-support/acceptance.md`：国内回归和海外验收标准。
- `web-global-support/spec.md`：网页版行为、坐标和双地图规则；
- `web-global-support/plan.md`：地图适配、状态和实施门禁；
- `web-global-support/tasks.md`：文档完成、代码待实施的任务清单；
- `web-global-support/acceptance.md`：桌面、移动浏览器、国内与六城验收矩阵。

## 模板

- `_template/spec.md`
- `_template/plan.md`
- `_template/tasks.md`
