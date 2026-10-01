package com.zynashlabs.prism;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView webView = getBridge().getWebView();
        getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (webView != null) {
            // WebView is already hardware accelerated by the Activity/window.
            // Do not force a hardware layer: an extra WebView layer can add a
            // texture/compositing pass, which is particularly costly while
            // WebGL + camera frames are active.
            webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
            // Keep the WebView surface opaque to reduce an unnecessary
            // transparent composition step over the camera + WebGL canvas.
            webView.setBackgroundColor(Color.BLACK);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
            }

            WebSettings settings = webView.getSettings();
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setSupportZoom(false);
            settings.setBuiltInZoomControls(false);
            settings.setDisplayZoomControls(false);
        }
    }
}
