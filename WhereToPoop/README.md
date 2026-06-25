# 拉了么小程序

微信小程序版本，主界面为地图，用于选择城市和基准地点，然后查找周围公共厕所，并叠加城市地铁站厕所状态。

## 结构

- `miniprogram/`: 微信小程序前端
- `D:\Work\Poopornot\03_SourceCode\server.js`: 统一 Node 后端，同时服务网页版和小程序 API
- `D:\Work\Poopornot\03_SourceCode\data\metro`: 地铁厕所状态数据

高德 WebService Key 只放在统一后端，小程序不直接请求高德。

## 后端配置

编辑：

```text
D:\Work\Poopornot\03_SourceCode\.env
```

填写：

```env
AMAP_WEB_SERVICE_KEY=你的高德WebServiceKey
AMAP_JS_KEY=你的高德JSAPIKey
AMAP_SECURITY_JS_CODE=你的安全密钥
PORT=5173
```

启动后端：

```powershell
cd D:\Work\Poopornot\03_SourceCode
node server.js
```

## 小程序配置

小程序请求后端地址在：

```text
miniprogram/config/api.ts
```

开发者工具模拟器默认可用：

```ts
export const API_BASE_URL = "http://127.0.0.1:5173";
```

真机调试时，需要改成电脑局域网 IP，例如：

```ts
export const API_BASE_URL = "http://192.168.1.23:5173";
```

开发阶段在微信开发者工具勾选：

```text
详情 -> 本地设置 -> 不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书
```

正式发布时，后端需要部署到 HTTPS 域名，并在微信公众平台配置 request 合法域名。

## 当前功能

- 输入城市并切换地图基准城市
- 搜索具体地点，地点候选使用非厕所图标
- 选定地点作为基准点
- 以 300m、500m、1km、3km 半径搜索周围公共厕所
- 公共厕所地图标点、列表、详情和步行路线
- 地铁站厕所状态标点、详情和路线
- 白天/夜晚 UI 切换

## 地铁数据

无锡地铁厕所状态维护在：

```text
D:\Work\Poopornot\03_SourceCode\data\metro\jiangsu\wuxi
```

目前无锡 1/2/3/4 号线都按“有厕所”标为 `1`。

```
TODO:小程序前端页面修改 （城市改为可选择，好像不改也行） 地点和城市改为同一行 下面的半径和查厕所保留  厕所地铁站按钮可以取消 结果部分占的面积大一些
```