# 拉了么微信小程序

状态：Active

微信小程序客户端位于 `WhereToPoop/`，使用微信原生 `map` 组件展示地图，通过项目根目录的 `server.js` 查询国内外地点、厕所、城市和地铁站。

## 当前功能

- 启动时用 WGS84 定位识别国家；中国大陆随后获取 GCJ-02，海外保持 WGS84，并自动搜索默认 500 m 内厕所。
- 定位失败时选择城市和具体地点。
- 中国大陆字母索引城市选择器，以及新加坡、莫斯科、东京、伦敦、纽约、悉尼快捷入口。
- 文字地点和地图长按“选这里”均只建立查询中心，等待用户点击“查厕所”。
- 300 m、500 m、1 km、3 km 半径；已有查询中心时改变半径后自动查询厕所。
- 厕所列表、地图标记、距离和详情。
- 地铁只由专用按钮查询，返回查询中心 20 km 内最近 10 站；厕所和地铁 marker 相互保留。
- 地铁厕所状态：绿色 `1`、红色 `0`、橙色 `2`。
- `wx.openLocation` 导航。
- UI 深浅色、分享和 `UpdateManager`。

小程序当前没有“路线”按钮，不调用 `/api/navigation`，也不在内部绘制路线。

## 目录

```text
WhereToPoop/
  miniprogram/
    config/api.ts
    data/cities.ts
    pages/index/
    services/api.ts
    utils/coordinates.ts
  project.config.json
  tsconfig.json
```

地铁厕所状态不在小程序目录维护，统一来自 `data/metro/`。

## 后端

先从项目根目录启动：

```powershell
npm start
```

后端默认端口是 `5174`，实际可由根 `.env` 覆盖。高德 Web Service Key 和 Geoapify Key 只放在后端；小程序源码不保存地图服务私钥。

## API 配置

编辑 `WhereToPoop/miniprogram/config/api.ts`。

当前生产地址：

```ts
export const API_BASE_URL = "https://pp.nuanzhualife.cn"
```

开发者工具模拟器临时连接本机默认后端：

```ts
export const API_BASE_URL = "http://127.0.0.1:5174";
```

真机中的 `127.0.0.1` 不是开发电脑。二维码预览和正式发布必须使用 HTTPS 域名，并在微信公众平台设置 `request` 合法域名。

## 腾讯地图样式

以下值默认为空：

```ts
export const TENCENT_MAP_SUBKEY = "";
export const TENCENT_MAP_STYLE_LIGHT = "";
export const TENCENT_MAP_STYLE_DARK = "";
```

当前页面使用微信原生默认底图，以上腾讯个性化样式字段为预留配置，暂未传给 `<map>`。夜间按钮只切换 UI 深浅色；不要填写 `0`。

## 开发与发布检查

- 用微信开发者工具导入本目录。
- 开发阶段可临时跳过合法域名校验，但手机二维码预览和发布前必须关闭。
- 真机验证定位授权、拒绝定位、城市/地点、半径、地铁、分享和 `wx.openLocation`。
- 真机验证国内外长按选点、WGS84 marker/导航和六座重点海外城市。
- 确认结果和详情中没有“路线”，网络面板没有 `/api/navigation`。
- 修改后同步根 `CHANGELOG.md`。

完整说明见 `docs/configuration.md`、`docs/development.md`、`docs/testing.md` 和 `docs/release.md`。
