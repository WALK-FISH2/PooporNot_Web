# Poopornot 开发协作指南

状态：Active

本文件适用于项目根目录及所有子目录。开始修改前先阅读根 `README.md`、`docs/README.md` 和与任务相关的专题文档。

## 1. 事实来源

按以下顺序判断项目事实：

1. 当前代码、配置和 `data/metro`。
2. `docs/` 中状态为 `Active` 的文档。
3. `CHANGELOG.md` 和开发历史。
4. 旧笔记、截图和根目录外的辅助资料。

辅助资料与代码冲突时，以代码为当前事实，并在文档中记录冲突和“待确认”，不要猜测。

## 2. 目录职责

- `server.js`：统一 API、外部高德请求、静态文件服务和地铁坐标合并。
- `index.html`、`app.js`、`styles.css`：网页版。
- `WhereToPoop/miniprogram/`：微信小程序。
- `WhereToPoop_apk/`：Android 客户端。
- `data/metro/`：三端共享地铁厕所状态。
- `docs/`：正式开发、架构、接口、配置和运维文档。

不要在客户端目录复制地铁 JSON 或后端 Web Service Key。

## 3. 当前平台边界

- 网页使用高德 JS API，并调用 `/api/navigation` 绘制步行路线。
- 小程序使用微信 `map` 组件；厕所和地铁站只保留 `wx.openLocation` 导航，不得无意恢复路线按钮或 `/api/navigation`。
- Android 使用高德 Android SDK，当前仍保留内部步行路线和外部地图导航。
- 三端地铁查询都以基准点 20 km 空间范围为准，不只按行政城市。

跨平台行为需要统一时，先修改规格或新增 ADR，不要把单端决策直接推广到其他端。

## 4. 地铁数据规则

- 目录：`data/metro/<provinceSlug>/<citySlug>/line_*.json`。
- 站点只保存 `name` 和 `toilet`，不保存坐标。
- `toilet` 只能是 `0`、`1`、`2`。
- `1` 绿色，`0` 红色，`2` 橙色 `#F59E0B`。
- 未核实信息使用 `2`，不能猜成 `1` 或 `0`。
- 跨市重复线路修改时检查所有镜像文件。
- 数据变化后重启后端，以清空进程内城市站点缓存。

详细规则见 `docs/metro-data.md`。

## 5. 配置与安全

- `.env`、`local.properties`、keystore、证书私钥和真实 Key 不得提交。
- `AMAP_WEB_SERVICE_KEY` 只在后端使用。
- 浏览器 JS Key 必须限制域名；Android Key 必须限制包名和签名。
- 小程序正式 API 使用 HTTPS 合法域名，当前配置为 `https://pp.nuanzhualife.cn`。
- `.env.example` 当前存在疑似真实 Key 风险；在完成轮换前不要复制、传播或写入文档。

## 6. 实现约定

- 文本文件统一 UTF-8。
- 优先沿用现有轻量实现，不为单一需求引入大型框架。
- 外部 API 调用要考虑分页、QPS、缓存、错误和部分结果。
- 后端错误必须转换为响应，不能让 Node 进程退出。
- 选中标记、列表详情、路线或导航必须使用同一目标坐标。
- 小程序需兼容项目实际微信编译链；避免未经验证的现代语法。
- 修改共享 API 时同步网页、小程序、Android 类型和 `docs/api.md`。

## 7. 开发与验证

后端和网页基础检查：

```powershell
npm run check
```

Android 构建：

```powershell
Set-Location WhereToPoop_apk
.\gradlew.bat assembleDebug
```

Android 构建要求 JDK 17。微信小程序必须在开发者工具和真机上验证定位、合法域名和 `wx.openLocation`。

当前没有自动化测试；按 `docs/testing.md` 执行与变更风险相称的人工验证。无法运行的检查要在交付说明中明确写出。

## 8. 文档工作流

- 新文档先建立非空 `Draft` 骨架。
- 核验当前代码后可提升为 `Active`。
- 被替代文档标记 `Deprecated`，不要静默删除重要历史。
- 无法确认的信息写“待确认”。
- 仓库内部路径使用项目根目录相对路径，不写个人机器绝对路径。
- 较大功能从 `docs/specs/_template/` 创建规格、计划和任务。
- 重大架构决策记录到 `docs/adr/`。

## 9. CHANGELOG 要求

任何业务代码、配置、数据或正式文档修改都必须追加 `CHANGELOG.md`：

- 保留已有历史，不覆盖、不清空。
- 使用实际日期。
- 写明受影响平台和用户可见结果。
- 配置迁移、安全影响和已知限制应明确记录。

## 10. 完成前检查

- [ ] 修改范围与需求一致。
- [ ] 没有覆盖无关的现有改动。
- [ ] 没有新增密钥、个人路径或用户数据。
- [ ] 当前、已移除、未实现、已放弃和待确认没有混写。
- [ ] 已运行可用测试或说明未运行原因。
- [ ] 相关文档和 `CHANGELOG.md` 已同步。
