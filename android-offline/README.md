# 史纲时间线 Android 完全离线版

这个 Android 壳会把仓库中的 `index.html`、`app.js`、`styles.css`、`data/` 与 `assets/` 全部打进 APK 的 `android_asset/www/`。

离线保证：
- AndroidManifest 不声明 `android.permission.INTERNET`。
- WebView 设置 `setBlockNetworkLoads(true)`。
- HTTP/HTTPS 请求在 WebViewClient 层再次拦截。
- 原 PWA Service Worker 仅在 APK 构建副本中关闭，不改网页版本。
- 学习进度继续使用 WebView 本地存储保存。
