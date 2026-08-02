# 拉了么

一个网页版 MVP：打开地图、获取当前位置、搜索附近公共厕所，并支持步行路线导航。

v1.0.0 可以查看附近地铁站
v1.0.1 有路线按钮，后续删除 
后续引进地铁站是否有厕所的投票模块

## 配置 Key

在 `03_SourceCode` 目录复制 `.env.example` 为 `.env`，然后填写：

```env
AMAP_JS_KEY=你的高德JSAPIKey
AMAP_SECURITY_JS_CODE=你的安全密钥
AMAP_WEB_SERVICE_KEY=你的高德WebServiceKey
PORT=5173
```

说明：

- `AMAP_JS_KEY`：浏览器加载高德地图必须使用，所以会通过 `/api/config` 返回给前端。请在高德控制台给它配置域名白名单。
- `AMAP_SECURITY_JS_CODE`：如果你的高德控制台启用了安全密钥，填这里。
- `AMAP_WEB_SERVICE_KEY`：只放在后端，用于公共厕所周边搜索和步行路线规划。

## 启动

```bash
npm start
```

然后打开：

```text
http://localhost:5173
```

```
cd D:\Work\Poopornot\03_SourceCode
node server.js
```

## 当前实现

- 高德 JS API 2.0 地图
- 高德定位
- 后端代理高德 POI 周边搜索
- 后端代理高德步行路线规划
- 地图 marker、结果列表、步行路线绘制

## 后续

- 增加后端缓存，把搜索过的 POI 以 `poi_id` 为主键缓存。
- 新增地铁站图层，并维护 `has_toilet` 状态。
- 增加用户反馈入口，用于纠错、补点和标注临时关闭。
