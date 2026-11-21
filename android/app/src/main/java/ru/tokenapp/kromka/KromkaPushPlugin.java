package ru.tokenapp.kromka;

import android.Manifest;
import android.os.Build;
import android.content.Intent;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import ru.rustore.sdk.pushclient.RuStorePushClient;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name="KromkaPush", permissions={@Permission(alias="notifications", strings={Manifest.permission.POST_NOTIFICATIONS})})
public class KromkaPushPlugin extends Plugin {
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private PushState state() { return new PushState(getContext()); }
    private void resolve(PluginCall call) {
        try {
            JSObject value = new JSObject(state().publicState().toString());
            value.put("permission", KromkaMessagingService.allowed(getContext())); call.resolve(value);
        } catch(Exception e) { call.reject("Не удалось прочитать настройки"); }
    }
    @PluginMethod public void getState(PluginCall call) { resolve(call); }
    @PluginMethod public void enable(PluginCall call) {
        if (!KromkaApplication.configured()) { call.reject("Уведомления пока недоступны"); return; }
        network.execute(() -> {
            if (!PushSyncWorker.available()) { call.reject("Уведомления временно недоступны. Попробуйте позже"); return; }
            getActivity().runOnUiThread(() -> {
                if(Build.VERSION.SDK_INT>=33 && getPermissionState("notifications")!=PermissionState.GRANTED) requestPermissionForAlias("notifications", call, "permissionResult");
                else finishEnable(call);
            });
        });
    }
    @PermissionCallback private void permissionResult(PluginCall call) {
        if (getPermissionState("notifications")!=PermissionState.GRANTED) { call.reject("Разрешите уведомления в настройках Android"); return; }
        finishEnable(call);
    }
    private void finishEnable(PluginCall call) {
        if(!KromkaMessagingService.allowed(getContext())) { call.reject("Разрешите уведомления в настройках Android"); return; }
        try {
            state().enable(call.getArray("fixtureIds"), call.getArray("teamIds"), call.getArray("kinds"));
            ((KromkaApplication)getActivity().getApplication()).startPush();
            PushSyncWorker.enqueue(getContext());
            resolve(call);
        } catch(Exception e) { call.reject("Не удалось включить уведомления"); }
    }
    @PluginMethod public void setSelection(PluginCall call) {
        try {
            state().selection(call.getArray("fixtureIds"), call.getArray("teamIds"), call.getArray("kinds"));
            PushSyncWorker.resume(getContext()); resolve(call);
        } catch(Exception e) { call.reject("Не удалось сохранить выбор"); }
    }
    @PluginMethod public void disable(PluginCall call) { disable(call, false); }
    @PluginMethod public void clearData(PluginCall call) { disable(call, true); }
    private void disable(PluginCall call, boolean clearData) {
        state().disable();
        if(clearData) synchronized(PushState.LOCK) { state().prefs.edit().remove("fixtures").remove("teams").remove("kinds").remove("seen").commit(); }
        ((KromkaApplication)getActivity().getApplication()).components(false);
        NotificationManagerCompat.from(getContext()).cancelAll();
        if(RuStorePushClient.INSTANCE.isInitialized()) {
            try { RuStorePushClient.INSTANCE.deleteToken().addOnFailureListener(error -> {}); } catch(Exception ignored) {}
        }
        PushSyncWorker.resume(getContext()); resolve(call);
    }
    @PluginMethod public void openSettings(PluginCall call) {
        Intent intent = Build.VERSION.SDK_INT>=26
            ? new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName())
            : new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.parse("package:"+getContext().getPackageName()));
        getActivity().startActivity(intent); call.resolve();
    }
    @Override protected void handleOnDestroy() { network.shutdownNow(); }
}
