package com.aspectai.webview;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

public final class MainActivity extends Activity {
    private static final String HEALTH_URL = "https://www.aspectmarketingsolutions.app/api/health";
    private static final String PRIVACY_URL = "https://www.aspectmarketingsolutions.app/privacy";
    private static final String SUPPORT_EMAIL = "kimberleyaversbiz@gmail.com";

    private static final int COLOR_BACKGROUND = Color.rgb(8, 9, 13);
    private static final int COLOR_PANEL = Color.rgb(17, 19, 26);
    private static final int COLOR_PRIMARY = Color.rgb(139, 92, 246);
    private static final int COLOR_TEXT = Color.rgb(245, 247, 251);
    private static final int COLOR_MUTED = Color.rgb(151, 158, 173);
    private static final int COLOR_GOOD = Color.rgb(67, 209, 125);
    private static final int COLOR_WARN = Color.rgb(245, 185, 66);

    private TextView platformStatus;
    private Button refreshButton;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setTitle(getString(R.string.app_name));
        setContentView(buildContent());
        refreshPlatformStatus();
    }

    private View buildContent() {
        ScrollView scrollView = new ScrollView(this);
        scrollView.setFillViewport(true);
        scrollView.setBackgroundColor(COLOR_BACKGROUND);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(24), dp(20), dp(40));
        root.setBackgroundColor(COLOR_BACKGROUND);
        scrollView.addView(root, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT,
                ScrollView.LayoutParams.WRAP_CONTENT
        ));

        TextView eyebrow = text("ASPECT MARKETING SOLUTIONS", 12, COLOR_PRIMARY, true);
        eyebrow.setLetterSpacing(0.12f);
        root.addView(eyebrow);

        TextView title = text("AMS Mobile", 32, COLOR_TEXT, true);
        title.setPadding(0, dp(8), 0, 0);
        root.addView(title);

        TextView subtitle = text(
                "A secure, consumption-only Android companion for platform status and the verified AMS Agent Network.",
                16,
                COLOR_MUTED,
                false
        );
        subtitle.setPadding(0, dp(8), 0, dp(20));
        root.addView(subtitle);

        LinearLayout statusCard = panel();
        TextView statusLabel = text("LIVE PLATFORM STATUS", 11, COLOR_PRIMARY, true);
        statusLabel.setLetterSpacing(0.10f);
        statusCard.addView(statusLabel);

        platformStatus = text("Checking production…", 18, COLOR_TEXT, true);
        platformStatus.setPadding(0, dp(10), 0, dp(12));
        statusCard.addView(platformStatus);

        refreshButton = button("Refresh status");
        refreshButton.setOnClickListener(v -> refreshPlatformStatus());
        statusCard.addView(refreshButton);
        root.addView(statusCard, sectionParams());

        TextView agentHeading = text("Agent Network", 24, COLOR_TEXT, true);
        agentHeading.setPadding(0, dp(28), 0, dp(4));
        root.addView(agentHeading);

        TextView agentIntro = text(
                "Release 1 surfaces the launch network without pretending unfinished agents are live.",
                14,
                COLOR_MUTED,
                false
        );
        agentIntro.setPadding(0, 0, 0, dp(12));
        root.addView(agentIntro);

        addAgent(root, "AMS Fiverr Bridge", "BETA", "Controlled Fiverr event classification and operator routing.", COLOR_PRIMARY);
        addAgent(root, "Content Agent", "IN DEVELOPMENT", "Customer-facing marketing content generation; paid execution remains gated until the provider path is verified.", COLOR_WARN);
        addAgent(root, "Aspect Overmind", "IN DEVELOPMENT", "Orchestration layer for specialized AMS agents, tools, and owner-approved actions.", COLOR_WARN);
        addAgent(root, "YouTube Uploader Agent", "IN DEVELOPMENT", "Owner-authorized video publishing workflow with controlled metadata and upload handling.", COLOR_WARN);
        addAgent(root, "Social Publisher Agent", "IN DEVELOPMENT", "Approval-first social publishing infrastructure for controlled distribution.", COLOR_WARN);
        addAgent(root, "Android Build Agent", "IN DEVELOPMENT", "Build automation for APK/AAB packaging and Google Play release workflows.", COLOR_WARN);

        LinearLayout purchaseNotice = panel();
        TextView purchaseTitle = text("Android purchase policy", 17, COLOR_TEXT, true);
        purchaseNotice.addView(purchaseTitle);
        TextView purchaseBody = text(
                "This Play build is consumption-only. Purchases, subscriptions, Stripe checkout, and external payment links are intentionally unavailable inside the Android app.",
                14,
                COLOR_MUTED,
                false
        );
        purchaseBody.setPadding(0, dp(8), 0, 0);
        purchaseNotice.addView(purchaseBody);
        root.addView(purchaseNotice, sectionParams());

        TextView legalHeading = text("Privacy & support", 22, COLOR_TEXT, true);
        legalHeading.setPadding(0, dp(28), 0, dp(12));
        root.addView(legalHeading);

        Button privacyButton = button("Privacy Policy");
        privacyButton.setOnClickListener(v -> openExternalUrl(PRIVACY_URL));
        root.addView(privacyButton, buttonParams());

        Button supportButton = button("Email AMS Support");
        supportButton.setOnClickListener(v -> {
            Intent intent = new Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:" + SUPPORT_EMAIL));
            intent.putExtra(Intent.EXTRA_SUBJECT, "AMS Android Support");
            startActivity(intent);
        });
        root.addView(supportButton, buttonParams());

        TextView footer = text(
                "Version " + getString(R.string.app_version_label) + " · Package com.aspectai.webview",
                12,
                COLOR_MUTED,
                false
        );
        footer.setGravity(Gravity.CENTER_HORIZONTAL);
        footer.setPadding(0, dp(28), 0, 0);
        root.addView(footer);

        return scrollView;
    }

    private void addAgent(LinearLayout root, String name, String status, String description, int statusColor) {
        LinearLayout card = panel();
        TextView statusView = text(status, 11, statusColor, true);
        statusView.setLetterSpacing(0.08f);
        card.addView(statusView);

        TextView nameView = text(name, 18, COLOR_TEXT, true);
        nameView.setPadding(0, dp(7), 0, 0);
        card.addView(nameView);

        TextView descriptionView = text(description, 14, COLOR_MUTED, false);
        descriptionView.setPadding(0, dp(6), 0, 0);
        card.addView(descriptionView);
        root.addView(card, cardParams());
    }

    private void refreshPlatformStatus() {
        refreshButton.setEnabled(false);
        platformStatus.setTextColor(COLOR_TEXT);
        platformStatus.setText("Checking production…");

        Thread thread = new Thread(() -> {
            String message;
            int messageColor;
            HttpURLConnection connection = null;
            try {
                URL url = new URL(HEALTH_URL);
                connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("GET");
                connection.setConnectTimeout(7000);
                connection.setReadTimeout(7000);
                connection.setRequestProperty("Accept", "application/json");
                connection.setRequestProperty("User-Agent", "AMS-Android/2.0");

                int responseCode = connection.getResponseCode();
                if (responseCode != 200) {
                    throw new IllegalStateException("HTTP " + responseCode);
                }

                StringBuilder body = new StringBuilder();
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                        connection.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        body.append(line);
                    }
                }

                JSONObject root = new JSONObject(body.toString());
                boolean ok = root.optBoolean("ok", false);
                String status = root.optString("status", "unknown");
                JSONObject persistence = root.optJSONObject("persistence");
                JSONObject redis = persistence == null ? null : persistence.optJSONObject("redis");
                String redisStatus = redis == null ? "unknown" : redis.optString("status", "unknown");
                String environment = root.optString("environment", "unknown");

                if (ok && "ready".equalsIgnoreCase(status) && "ready".equalsIgnoreCase(redisStatus)) {
                    message = String.format(Locale.US, "ONLINE · %s · persistence ready", environment.toUpperCase(Locale.US));
                    messageColor = COLOR_GOOD;
                } else {
                    message = String.format(Locale.US, "DEGRADED · status %s · persistence %s", status, redisStatus);
                    messageColor = COLOR_WARN;
                }
            } catch (Exception error) {
                message = "UNREACHABLE · check your connection and try again";
                messageColor = COLOR_WARN;
            } finally {
                if (connection != null) {
                    connection.disconnect();
                }
            }

            final String finalMessage = message;
            final int finalColor = messageColor;
            runOnUiThread(() -> {
                platformStatus.setText(finalMessage);
                platformStatus.setTextColor(finalColor);
                refreshButton.setEnabled(true);
            });
        }, "ams-health-check");
        thread.start();
    }

    private void openExternalUrl(String url) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        startActivity(intent);
    }

    private LinearLayout panel() {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(16), dp(16), dp(16), dp(16));
        GradientDrawable background = new GradientDrawable();
        background.setColor(COLOR_PANEL);
        background.setCornerRadius(dp(12));
        background.setStroke(dp(1), Color.rgb(42, 46, 57));
        panel.setBackground(background);
        return panel;
    }

    private TextView text(String value, int sizeSp, int color, boolean bold) {
        TextView textView = new TextView(this);
        textView.setText(value);
        textView.setTextSize(sizeSp);
        textView.setTextColor(color);
        textView.setLineSpacing(0, 1.15f);
        if (bold) {
            textView.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        }
        return textView;
    }

    private Button button(String value) {
        Button button = new Button(this);
        button.setText(value);
        button.setTextColor(Color.WHITE);
        button.setAllCaps(false);
        button.setTextSize(14);
        GradientDrawable background = new GradientDrawable();
        background.setColor(COLOR_PRIMARY);
        background.setCornerRadius(dp(10));
        button.setBackground(background);
        button.setPadding(dp(16), dp(10), dp(16), dp(10));
        return button;
    }

    private LinearLayout.LayoutParams sectionParams() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.topMargin = dp(12);
        return params;
    }

    private LinearLayout.LayoutParams cardParams() {
        LinearLayout.LayoutParams params = sectionParams();
        params.topMargin = dp(10);
        return params;
    }

    private LinearLayout.LayoutParams buttonParams() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(52)
        );
        params.topMargin = dp(10);
        return params;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
