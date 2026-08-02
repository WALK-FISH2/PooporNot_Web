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

- Android Studio
- Android SDK Platform 35
- Android SDK Build-Tools
- Android SDK Platform-Tools
- Android Emulator（可选，使用真机测试时不必安装模拟器）

Android Studio 自带运行 Gradle 所需的 JDK，无需单独安装 Java。

## 配置

1. 将 `local.properties.example` 复制为 `local.properties`。
2. 设置本机 Android SDK 路径。
3. 填写高德开放平台的 Android Key：

```properties
AMAP_ANDROID_KEY=你的高德AndroidKey
```

4. 设置后端地址：

```properties
API_BASE_URL=http\://124.220.73.65\:5174/
```

Android Key 的包名是：

```text
com.poopornot.wheretopoop
```

高德 Android Key 还需要匹配本机 debug 或 release 签名的 SHA1。

## 后端

客户端默认连接：

```text
http://124.220.73.65:5174/
```

健康检查地址为 `http://124.220.73.65:5174/api/health`。服务端仍需配置
`AMAP_WEB_SERVICE_KEY`，该密钥不要写入 Android 客户端。

## 构建

用 Android Studio 打开本目录，等待 Gradle Sync 后运行 `app`。也可以使用：

```powershell
.\gradlew.bat assembleDebug
```

Debug APK 输出到：

```text
app\build\outputs\apk\debug\app-debug.apk
```

