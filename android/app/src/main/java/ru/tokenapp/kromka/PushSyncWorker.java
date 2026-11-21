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
            java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
            try (java.io.InputStream in = c.getInputStream()) {
                byte[] chunk = new byte[512]; int n;
                while((n=in.read(chunk))!=-1) { if(bytes.size()+n>4096) return false; bytes.write(chunk,0,n); }
            }
            JSONObject result = new JSONObject(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
            return result.optBoolean("available") && PushState.CONSENT.equals(result.optString("consent"));
        } catch (Exception e) { return false; } finally { if(c!=null)c.disconnect(); }
    }
    interface Transport { int send(String id, String secret, boolean enabled, String body) throws Exception; }
    static int upload(String id, String secret, boolean enabled, String body) throws Exception {
        HttpURLConnection c = connection(API+"devices/"+id, enabled ? "PUT" : "DELETE");
        try {
            c.setRequestProperty("Authorization", "Bearer "+secret);
            if(enabled) {
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                c.setRequestProperty("Content-Type", "application/json"); c.setDoOutput(true); c.setFixedLengthStreamingMode(bytes.length);
                try(java.io.OutputStream out = c.getOutputStream()) { out.write(bytes); }
            }
            return c.getResponseCode();
        } finally { c.disconnect(); }
    }
    @Override public Result doWork() { return sync(new PushState(getApplicationContext()), PushSyncWorker::upload, this::isStopped); }
    static Result sync(PushState state, Transport transport, java.util.function.BooleanSupplier stopped) {
        // Cancellation cannot interrupt every HTTP call. Serialize actual requests so a
        // cancelled PUT always finishes before the replacement DELETE/new settings.
        synchronized (NETWORK_LOCK) {
            if (stopped.getAsBoolean()) return Result.success();
            long generation; boolean enabled; String id, secret, body;
            try {
                synchronized (PushState.LOCK) {
                    if (!state.prefs.getBoolean("pending", false)) return Result.success();
                    generation = state.prefs.getLong("generation", 0); enabled = state.enabled();
                    id = state.prefs.getString("id", ""); secret = state.prefs.getString("secret", "");
                    String token = state.prefs.getString("token", "");
                    if (enabled && token.isEmpty()) return Result.success(); // token callback schedules the actual upload
                    JSONObject payload = new JSONObject().put("token", token).put("consent", PushState.CONSENT)
                        .put("fixtureIds", PushState.array(state.prefs.getString("fixtures", "[]")))
                        .put("teamIds", PushState.array(state.prefs.getString("teams", "[]")))
                        .put("kinds", PushState.array(state.prefs.getString("kinds", PushState.DEFAULT_KINDS)));
                    body = payload.toString();
                }
                int code = transport.send(id, secret, enabled, body);
                synchronized (PushState.LOCK) {
                    if (generation != state.prefs.getLong("generation", 0)) return Result.success();
                    if (code>=200 && code<300) {
                        android.content.SharedPreferences.Editor edit = state.prefs.edit().putBoolean("pending", false).putString("status", enabled ? "on" : "off");
                        if(!enabled) edit.remove("id").remove("secret");
                        else edit.putLong("syncedAt", System.currentTimeMillis());
                        edit.commit();
                        return Result.success();
                    }
                    if(code==429 || code>=500) { state.prefs.edit().putString("status", enabled ? "pending" : "revoking").commit(); return Result.retry(); }
                    state.prefs.edit().putString("status", "error").commit(); return Result.failure();
                }
            } catch(Exception e) { return Result.retry(); }
        }
    }
}
