package wang.w2334681436.politics.timeline;

import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private static final String START_URL = "file:///android_asset/www/index.html";
    private FrameLayout root;
    private WebView webView;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(244, 241, 234));
        setContentView(root);
        enterImmersiveMode();
        try {
            startWebView(state);
        } catch (Throwable t) {
            showError(t);
        }
    }

    private void startWebView(Bundle state) {
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(244, 241, 234));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);

        webView.setWebViewClient(new WebViewClient() {
            private boolean local(Uri uri) {
                if (uri == null) return false;
                String scheme = uri.getScheme();
                return "file".equalsIgnoreCase(scheme) || "about".equalsIgnoreCase(scheme);
            }

            private boolean network(Uri uri) {
                if (uri == null) return false;
                String scheme = uri.getScheme();
                return "http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme);
            }

            private WebResourceResponse blocked() {
                byte[] body = "Offline".getBytes(StandardCharsets.UTF_8);
                return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(body));
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !local(request.getUrl());
            }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                try { return !local(Uri.parse(url)); } catch (Throwable ignored) { return true; }
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return network(request.getUrl()) ? blocked() : super.shouldInterceptRequest(view, request);
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                runOnUiThread(() -> {
                    try {
                        root.removeView(webView);
                        webView.destroy();
                        webView = null;
                        startWebView(null);
                    } catch (Throwable t) {
                        showError(t);
                    }
                });
                return true;
            }
        });

        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

        boolean restored = false;
        if (state != null) {
            try { restored = webView.restoreState(state) != null; } catch (Throwable ignored) { }
        }
        if (!restored) webView.loadUrl(START_URL);
    }

    private void showError(Throwable t) {
        try {
            if (webView != null) {
                root.removeView(webView);
                webView.destroy();
                webView = null;
            }
        } catch (Throwable ignored) { }

        TextView message = new TextView(this);
        message.setTextColor(Color.rgb(48, 45, 40));
        message.setTextSize(17f);
        message.setGravity(Gravity.CENTER);
        message.setPadding(48, 48, 48, 48);
        String type = t == null ? "Unknown" : t.getClass().getSimpleName();
        message.setText("史纲时间线启动失败，但应用已阻止闪退。\n\n错误类型：" + type + "\n\n请截图此页面发给我。");
        root.removeAllViews();
        root.addView(message, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private void enterImmersiveMode() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                getWindow().setDecorFitsSystemWindows(false);
                WindowInsetsController c = getWindow().getInsetsController();
                if (c != null) {
                    c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                    c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                }
            } else {
                getWindow().getDecorView().setSystemUiVisibility(
                        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY |
                        View.SYSTEM_UI_FLAG_FULLSCREEN |
                        View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
                        View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
                        View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION |
                        View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
            }
        } catch (Throwable ignored) { }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enterImmersiveMode();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) {
            try { webView.saveState(outState); } catch (Throwable ignored) { }
        }
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
        enterImmersiveMode();
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override
    public void onBackPressed() {
        if (webView == null) {
            finish();
            return;
        }
        String js = "(function(){var s=document.querySelector('#search-dialog');if(s&&!s.hidden){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));return 'closed';}var i=document.querySelector('#info-dialog');if(i&&!i.hidden){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));return 'closed';}var d=document.querySelector('#detail-panel');if(d&&d.classList.contains('open')){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));return 'closed';}return 'none';})()";
        try {
            webView.evaluateJavascript(js, result -> {
                if ("\"none\"".equals(result)) finish();
            });
        } catch (Throwable ignored) {
            finish();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            try {
                root.removeView(webView);
                webView.stopLoading();
                webView.destroy();
            } catch (Throwable ignored) { }
            webView = null;
        }
        super.onDestroy();
    }
}
