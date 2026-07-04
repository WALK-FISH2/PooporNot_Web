# 拉了么 Android

这是微信小程序 `WhereToPoop` 的原生 Android 版本，保留以下功能：

- 当前定位和重新定位
- 城市字母索引与推荐城市
- 城市内地点搜索和基准点选择
- 300 m、500 m、1 km、3 km 范围厕所搜索
- 厕所列表、地图 Marker、详情和距离
- 最近地铁站与地铁厕所状态
- 后端步行路线绘制
- 高德地图优先、系统地图兜底的外部导航
- 深色和浅色主题

## 开发环境

- Android Studio（JDK 17）
- Android SDK 35
- Node 后端：`D:\Work\Poopornot\03_SourceCode\server.js`

## 配置

1. 将 `local.properties.example` 复制为 `local.properties`。
2. 设置本机 Android SDK 路径。
3. 填写高德开放平台的 Android Key：

```properties
AMAP_ANDROID_KEY=你的高德AndroidKey
```

4. 设置后端地址：

```properties
# Android 模拟器访问电脑
API_BASE_URL=http\://10.0.2.2\:5173/

# 真机访问电脑时改为电脑局域网 IP
# API_BASE_URL=http\://192.168.0.106\:5173/
```

Android Key 的包名是：

```text
com.poopornot.wheretopoop
```

高德 Android Key 还需要匹配本机 debug 或 release 签名的 SHA1。

## 后端

客户端沿用原项目的统一 API。先在 `03_SourceCode/.env` 配置：

```env
AMAP_WEB_SERVICE_KEY=你的高德Web服务Key
PORT=5173
```

然后启动：

```powershell
cd D:\Work\Poopornot\03_SourceCode
npm start
```

## 构建

用 Android Studio 打开本目录，等待 Gradle Sync 后运行 `app`。也可以使用：

```powershell
.\gradlew.bat assembleDebug
```

Debug APK 输出到：

```text
app\build\outputs\apk\debug\app-debug.apk
```

