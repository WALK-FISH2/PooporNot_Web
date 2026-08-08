# 测试策略

状态：Active

## 1. 自动化检查

### 1.1 Node 语法

```powershell
npm run check
```

检查 `server.js`、`app.js`、`web-core.js`、`web-map-adapters.js` 和 `lib/` 模块。

### 1.2 Node 单元测试

```powershell
npm test
```

当前 `test/` 有 21 个测试，覆盖：

- Geoapify 海外 POI 规范化与 WGS84 不转换；
- 距离过滤、排序、上限和地铁保守去重；
- Geoapify 厕所/地铁分类、半径和数量参数；
- 429 类型化错误；
- Geoapify 城市硬过滤参数和后端 Key 使用；
- 海外文字搜索补充城市当地名、使用独立超时并命中进程内短缓存；
- 第三方地点服务网络失败返回 `502` 后，后端进程仍保持可用；
- 全球逆地理空国家不会被误判为海外；
- Geoapify POI 直连和元数据；
- 厕所 100 条上限；
- 地铁最近 10 站；
- 日志中的 API Key 和已知密钥脱敏。
- 网页国内/海外请求上下文和坐标系选择；
- 网页请求指纹、重复提交保护和旧响应淘汰；
- Google Maps 外部导航 URL 使用原始 WGS84 且不携带 Key。

测试使用 mock，不消耗地图服务配额。

### 1.3 小程序类型检查

项目未固定安装 TypeScript，可使用：

```powershell
npx --yes -p typescript@5.4.5 tsc --noEmit -p WhereToPoop/tsconfig.json
```

`skipLibCheck` 只跳过旧版微信声明文件与 TypeScript 5.4 的兼容错误，项目自身代码仍参与检查。

### 1.4 Android 构建

```powershell
Set-Location WhereToPoop_apk
.\gradlew.bat assembleDebug
```

要求 JDK 17 和 Android SDK 35。2026-08-05 本机仅有 JDK 14，构建在 Android Gradle Plugin 前置检查处停止，未进入本项目源码编译；这不等于 Android 回归失败，也不等于已通过。

## 2. 后端冒烟

启动后端后，至少验证：

```powershell
Invoke-RestMethod 'http://127.0.0.1:5174/api/health'
Invoke-RestMethod 'http://127.0.0.1:5174/api/location/reverse?lng=120.31191&lat=31.49117'
Invoke-RestMethod 'http://127.0.0.1:5174/api/places?city=无锡&keywords=三阳广场&limit=10'
Invoke-RestMethod 'http://127.0.0.1:5174/api/toilets?lng=120.31191&lat=31.49117&radius=500&limit=100'
Invoke-RestMethod 'http://127.0.0.1:5174/api/metro/nearby?lng=120.31191&lat=31.49117&radius=20000&limit=10'
Invoke-RestMethod 'http://127.0.0.1:5174/api/global/cities'
Invoke-RestMethod 'http://127.0.0.1:5174/api/location/reverse?scope=global&coordinateSystem=WGS84&lng=103.8519&lat=1.2899'
```

海外 POI 冒烟需配置开发用 Geoapify Key，不要把 Key 放入命令、日志或文档。还应测试非法海外 `coordinateSystem=GCJ02` 返回 400。

## 3. 2026-08-05 实施验证记录

自动化结果：

- `npm run check`：通过。
- `npm test`：当前最终为 21/21 通过；早期阶段记录的 14/14、17/17 已被后续测试补充取代。
- 小程序 TypeScript 5.4 类型检查：通过。
- `git diff --check`：通过；Windows 仅有行尾转换提示。
- 小程序源码 Key 扫描：未发现 Geoapify Key。
- Android `assembleDebug`：因本机 JDK 14、要求 JDK 17而未运行完成。
- 微信开发者工具 CLI 预览：等待已打开 IDE 时未完成，已终止；不能代替真机验收。

国内 API 回归：无锡地点返回高德/GCJ-02，厕所返回高德结果，地铁一次周边请求返回最近 10 站并成功匹配本地状态。南京全局逆地理能识别 `cn/mainland`，随后国内链路仍使用 GCJ-02。

切换到 Geoapify 直连前的六城后端测试快照如下，仅作为数据量参考；海外地铁中的 Overpass 结果已不代表当前活动链路：

| 城市 | 城市内搜索 | 厕所 | 地铁 | 坐标 |
| --- | ---: | --- | --- | --- |
| 新加坡 | 10 | 12，Geoapify | 待按直连链路重测 | WGS84 |
| 莫斯科 | 10 | 9，Geoapify | 待按直连链路重测 | WGS84 |
| 东京 | 10 | 21，Geoapify | 待按直连链路重测 | WGS84 |
| 伦敦 | 2 | 10，Geoapify | 待按直连链路重测 | WGS84 |
| 纽约 | 3 | 1，Geoapify | 待按直连链路重测 | WGS84 |
| 悉尼 | 1 | 42，Geoapify | 待按直连链路重测 | WGS84 |

六城厕所当时已经实际来自 Geoapify，因此可作为当前厕所数据量的历史参考。Geoapify 直连后的六城地铁与端到端耗时仍需重新测试；上述数量不是数据完备性或性能承诺。

2026-08-05 Geoapify 直连后使用公开城市中心做单次本地后端冒烟：无锡高德逆地理约 186 ms；新加坡 500 m Geoapify 厕所约 1.45 s、返回 15 条；新加坡 20 km Geoapify 地铁约 0.94 s、返回 9 条。该结果只证明活动链路不再等待 Overpass，不构成生产 SLA；六城多轮、弱网和真机仍待验收。

## 4. 微信小程序真机门禁

开发者工具不能替代以下 Android 微信与 iOS 微信测试：

- [ ] 首次允许定位：当前位置成为查询中心、自动查厕所、不查地铁。
- [ ] 清除小程序授权后首次进入只出现一次位置权限提示。
- [ ] 临时定位错误只自动重试一次；失败面板可重新定位或继续手动选择。
- [ ] 拒绝位置权限后“去设置”可恢复授权；系统定位关闭时提示正确且不循环请求。
- [ ] 国内高德逆地理临时失败时不误入海外链路，GCJ-02 当前坐标仍能成为查询中心。
- [ ] 拒绝定位：仍能选城市、搜地点和长按选点。
- [ ] 国内文字地点仍受当前城市限制，选择后不自动查询。
- [ ] 国内/海外长按只出现临时点；普通点击、拖动和缩放不选点、不请求。
- [ ] 点击“选这里”清除旧结果但不查询；随后两个按钮都使用选中点。
- [ ] 已有中心时切换半径只刷新厕所。
- [ ] 城市切换只移动视口并清空中心；按钮与半径操作只提示。
- [ ] 地铁只由专用按钮请求 20 km 最近 10 站。
- [ ] 厕所刷新保留地铁 marker，地铁刷新保留厕所 marker。
- [ ] 六城 marker 与底图基本一致，海外导航无系统性偏移。
- [ ] `wx.openLocation` 国内传 GCJ-02、海外传 WGS84，并打开正确目的地。
- [ ] Geoapify 超时、限流和无结果不会清空有效地图状态。
- [ ] HTTPS 合法域名、分享、更新提示和深浅色样式正常。

完整逐城记录填写 `docs/specs/global-poi-support/acceptance.md`。

## 5. 网页回归

### 5.1 本地浏览器核心回归

2026-08-05 使用本地同源后端和内置浏览器完成：

- 国内无锡城市切换只移动视口并清空中心；搜索并选择“无锡站”后不自动查询；1 km 厕所、20 km 最近 10 个地铁站、独立 marker 和高德步行路线通过。
- 国内切换南京会清除查询中心、厕所、地铁和路线，不发起 POI 请求。
- 高德桌面右键和 Leaflet `contextmenu` 均只建立临时点；点击“选这里”后清除旧 POI 且不自动查询。
- 海外新加坡地点搜索和选择、1 km/500 m 厕所、20 km 最近 10 个地铁站、橙色未知状态及厕所/地铁 marker 互相保留通过。
- 海外亮色 `osm-bright`、暗色 `dark-matter` 瓦片切换通过；典型桌面视口观察到 24 个可见瓦片，移动窄屏观察到 8 个，该值只用于本地抽查，不代表计费请求总量。
- 390 px、768 px、1440 px 视口未发现顶部控件、地图工具、结果抽屉和 Leaflet 控件溢出或遮挡。

内置浏览器拒绝地理定位，因此“真实当前位置自动分流并查询 1 km 厕所”仍需普通浏览器验证。外部导航按钮已执行且 URL 纯逻辑测试通过，但新标签页行为和移动端长按仍需真实浏览器/设备确认。

### 5.2 六城后端单次冒烟

使用开发凭据和城市中心进行一轮地点、厕所、地铁请求；结果仅证明活动链路可响应，不是数据完备性或生产 SLA：

| 城市 | 地点 | 厕所 | 地铁 | 地点/厕所/地铁耗时（ms） |
| --- | ---: | ---: | ---: | --- |
| 新加坡 | 2 | 20 | 10 | 2004 / 560 / 1017 |
| 莫斯科 | 3 | 7 | 8 | 1270 / 1247 / 793 |
| 东京 | 3 | 24 | 9 | 2522 / 649 / 1155 |
| 伦敦 | 3 | 3 | 10 | 2025 / 934 / 1449 |
| 纽约 | 1 | 4 | 10 | 3065 / 504 / 1032 |
| 悉尼 | 1 | 11 | 9 | 2122 / 692 / 776 |

完整发布门禁和未完成矩阵见 `docs/specs/web-global-support/acceptance.md`。

## 6. Android 回归

- [ ] JDK 17 环境 `assembleDebug` 通过。
- [ ] 国内定位、城市、地点、厕所和地铁正常。
- [ ] 后端路线和外部地图导航目标正确。
- [ ] 未安装高德时系统 `geo:` 兜底正常。
- [ ] 生产构建使用 HTTPS，不依赖旧 HTTP IP。
- [ ] Android 请求不需要海外参数。

## 7. 数据与文档检查

- 所有 `data/metro` JSON 可解析，站点状态仅 `0/1/2`。
- `data/global/cities.json` ID、国家、WGS84 中心和边界完整。
- 正式文档只使用相对路径，不包含真实 Key。
- `docs/api.md`、`.env.example`、客户端类型与代码一致。
- 修改历史追加到 `CHANGELOG.md`。

## 8. 已知测试缺口

- 没有真实小程序端到端自动化、CI、Android JDK 17 构建环境或 iOS 自动化。
- Geoapify 直连后的六城实际响应时间、配额消耗与错误路径需要在真机和生产网络再次实测。
- 六城外当前位置/地图选点已在代码中支持，但没有全球城市文字搜索列表，也未完成真机抽样。
- 生产反向代理、限流、日志和证书不在仓库自动测试范围内。
- 网页真实定位、移动端长按、外部导航弹窗、Chrome/Edge/Android Chrome/iOS Safari 和六城完整 UI 矩阵仍待验证。
- Geoapify 瓦片来源限制、生产额度、计费统计和故障响应仍需在供应商控制台与生产网络确认。
