package ru.tokenapp.kromka;

import android.app.Application;
import android.content.ComponentName;
import android.content.pm.PackageManager;
import ru.rustore.sdk.pushclient.RuStorePushClient;
import ru.rustore.sdk.pushclient.common.logger.Logger;

public class KromkaApplication extends Application {
    static boolean configured() { return !BuildConfig.RUSTORE_PROJECT_ID.isEmpty(); }
    @Override public void onCreate() {
        super.onCreate();
        if (configured() && new PushState(this).enabled()) startPush();
        PushSyncWorker.resume(this);
    }
    void components(boolean enabled) {
        int value = enabled ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED : PackageManager.COMPONENT_ENABLED_STATE_DISABLED;
        for (String name : new String[]{getPackageName()+".KromkaMessagingService", "ru.rustore.sdk.pushclient.internal.arbiter.ArbiterBroadcastReceiver"})
            getPackageManager().setComponentEnabledSetting(new ComponentName(this, name), value, PackageManager.DONT_KILL_APP);
    }
    void startPush() {
        if (!configured() || !new PushState(this).enabled()) return;
        components(true);
        if (!RuStorePushClient.INSTANCE.isInitialized()) RuStorePushClient.INSTANCE.init(this, BuildConfig.RUSTORE_PROJECT_ID, new QuietLogger());
        RuStorePushClient.INSTANCE.getToken().addOnSuccessListener(token -> {
            new PushState(this).token(token); PushSyncWorker.resume(this);
        }).addOnFailureListener(error -> {
            synchronized(PushState.LOCK) { PushState state = new PushState(this); if(state.enabled()) state.prefs.edit().putString("status", "token-error").commit(); }
        });
    }
    // SDK diagnostics may include credentials; never route them to logcat.
    private static final class QuietLogger implements Logger {
        public void verbose(String s, Throwable t) {}
        public void debug(String s, Throwable t) {}
        public void info(String s, Throwable t) {}
        public void warn(String s, Throwable t) {}
        public void error(String s, Throwable t) {}
        public Logger createLogger(String tag) { return this; }
        public Logger createLogger(Object tag) { return this; }
    }
}
