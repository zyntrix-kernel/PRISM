package com.zynashlabs.prism;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureWebView();
    }

    @Override
    protected void onResume() {
        super.onResume();
        configureWebView();
    }

    private void configureWebView() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        WebView webView = getBridge().getWebView();
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setOffscreenPreRaster(false);
    }
}
