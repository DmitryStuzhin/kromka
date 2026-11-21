package ru.tokenapp.kromka;

import android.content.Context;
import androidx.work.*;
import org.json.JSONObject;
import java.net.URL;
import java.net.HttpURLConnection;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

/** Persistent network-constrained registration/revocation, including after process death. */
public final class PushSyncWorker extends Worker {
    static final String API = "https://tokenapp.ru/api/push/";
    private static final Object NETWORK_LOCK = new Object();
    public PushSyncWorker(Context context, WorkerParameters params) { super(context, params); }
    static void enqueue(Context context) {
        OneTimeWorkRequest work = new OneTimeWorkRequest.Builder(PushSyncWorker.class)
            .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS).build();
        WorkManager.getInstance(context).enqueueUniqueWork("kromka-push-sync", ExistingWorkPolicy.REPLACE, work);
    }
    static void resume(Context context) { if (new PushState(context).prefs.getBoolean("pending", false)) enqueue(context); }
    static HttpURLConnection connection(String url, String method) throws Exception {
        HttpURLConnection c = (HttpURLConnection)new URL(url).openConnection();
        c.setRequestMethod(method); c.setConnectTimeout(12000); c.setReadTimeout(12000);
        c.setInstanceFollowRedirects(false); c.setRequestProperty("Origin", "https://localhost");
        c.setRequestProperty("Accept", "application/json"); return c;
    }
    static boolean available() {
        HttpURLConnection c = null;
        try {
            c = connection(API+"status", "GET");
            if (c.getResponseCode()!=200) return false;
            byte[] bytes = new byte[4096]; int n;
            try (java.io.InputStream in = c.getInputStream()) { n = in.read(bytes); }
            JSONObject result = new JSONObject(new String(bytes, 0, Math.max(n,0), StandardCharsets.UTF_8));
            return result.optBoolean("available") && PushState.CONSENT.equals(result.optString("consent"));
        } catch (Exception e) { return false; } finally { if(c!=null)c.disconnect(); }
    }
    @Override public Result doWork() {
        // Cancellation cannot interrupt every HTTP call. Serialize actual requests so a
        // cancelled PUT always finishes before the replacement DELETE/new settings.
        synchronized (NETWORK_LOCK) {
            if (isStopped()) return Result.success();
            PushState state = new PushState(getApplicationContext());
            long generation; boolean enabled; String id, secret, body;
            try {
                synchronized (PushState.LOCK) {
                    if (!state.prefs.getBoolean("pending", false)) return Result.success();
                    generation = state.prefs.getLong("generation", 0); enabled = state.enabled();
                    id = state.prefs.getString("id", ""); secret = state.prefs.getString("secret", "");
                    String token = state.prefs.getString("token", "");
                    if (enabled && token.isEmpty()) return Result.retry();
                    JSONObject payload = new JSONObject().put("token", token).put("consent", PushState.CONSENT)
                        .put("fixtureIds", PushState.array(state.prefs.getString("fixtures", "[]")))
                        .put("teamIds", PushState.array(state.prefs.getString("teams", "[]")))
                        .put("kinds", PushState.array(state.prefs.getString("kinds", PushState.DEFAULT_KINDS)));
                    body = payload.toString();
                }
                HttpURLConnection c = connection(API+"devices/"+id, enabled ? "PUT" : "DELETE");
                int code;
                try {
                    c.setRequestProperty("Authorization", "Bearer "+secret);
                    if(enabled) {
                        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                        c.setRequestProperty("Content-Type", "application/json"); c.setDoOutput(true); c.setFixedLengthStreamingMode(bytes.length);
                        try(java.io.OutputStream out = c.getOutputStream()) { out.write(bytes); }
                    }
                    code = c.getResponseCode();
                } finally { c.disconnect(); }
                synchronized (PushState.LOCK) {
                    if (generation != state.prefs.getLong("generation", 0)) return Result.success();
                    if (code>=200 && code<300) {
                        state.prefs.edit().putBoolean("pending", false).putString("status", enabled ? "on" : "off").commit();
                        return Result.success();
                    }
                    if(code==429 || code>=500) { state.prefs.edit().putString("status", enabled ? "pending" : "revoking").commit(); return Result.retry(); }
                    state.prefs.edit().putString("status", "error").commit(); return Result.failure();
                }
            } catch(Exception e) { return Result.retry(); }
        }
    }
}
