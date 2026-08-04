# 拉了么 Android

状态：Active

原生 Android 客户端位于 `WhereToPoop_apk/`，使用 Kotlin、高德 Android 地图与定位 SDK、Retrofit 和统一 Node 后端。

## 当前功能

- 当前定位和重新定位。
- 定位失败或拒绝权限后选择城市和地点。
- 推荐城市与字母索引。
- 300 m、500 m、1 km、3 km 厕所搜索。
- 厕所列表、标记、详情和距离。
- 基准点 20 km 内地铁站与最近 10 站。
- 地铁厕所状态：绿色 `1`、红色 `0`、橙色 `2`。
- 后端步行路线绘制与摘要。
- 高德地图优先、系统 `geo:` Intent 兜底的外部导航。
- Android 深浅主题与高德日/夜地图。

Android 当前仍调用 `/api/navigation`，与已经取消内部路线的微信小程序不同。

## 开发环境

- Android Studio。
- JDK 17。
- Android SDK Platform 35。
- Gradle 8.9 / Android Gradle Plugin 8.7.3。
- 有效高德 Android Key。

最低运行版本为 Android API 24，目标 API 35。

## 配置

根据 `WhereToPoop_apk/local.properties.example` 创建 `WhereToPoop_apk/local.properties`：

```properties
sdk.dir=replace-with-android-sdk-path
API_BASE_URL=https\://pp.nuanzhualife.cn/
AMAP_ANDROID_KEY=replace-with-your-amap-android-key
```

高德 Key 必须匹配：

```text
包名：com.poopornot.wheretopoop
签名：当前 debug 或 release SHA1
```

`local.properties`、keystore 和签名密码不得提交。

## 当前默认地址风险

`WhereToPoop_apk/app/build.gradle.kts` 的代码 fallback 仍是旧公网 HTTP IP，manifest 也允许明文流量。本机或正式构建必须用 `local.properties`/Gradle 属性覆盖为 HTTPS。正式发布前应评估关闭明文流量，详见 `docs/security-privacy.md`。

## 构建

用 Android Studio 打开 `WhereToPoop_apk/`，或执行：

```powershell
Set-Location WhereToPoop_apk
.\gradlew.bat assembleDebug
```

输出：

```text
WhereToPoop_apk/app/build/outputs/apk/debug/app-debug.apk
```

若提示 Android Gradle Plugin 要求 Java 17，切换 Android Studio Gradle JDK 或 `JAVA_HOME`，不要使用 Java 14。

## 验证

- 定位授权、拒绝权限和手动城市流程。
- 厕所、地点、半径和最近地铁站。
- 路线终点必须与选中结果一致。
- 安装/未安装高德地图两种外部导航路径。
- HTTPS API、深浅主题和橙色未知状态。

完整开发、测试和发布说明见 `docs/development.md`、`docs/testing.md` 和 `docs/release.md`。
