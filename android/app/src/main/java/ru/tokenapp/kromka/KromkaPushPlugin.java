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
            value.put("permission", NotificationManagerCompat.from(getContext()).areNotificationsEnabled()); call.resolve(value);
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
        if(!NotificationManagerCompat.from(getContext()).areNotificationsEnabled()) { call.reject("Разрешите уведомления в настройках Android"); return; }
        try {
            state().enable(call.getArray("fixtureIds"), call.getArray("teamIds"), call.getArray("kinds"));
            ((KromkaApplication)getActivity().getApplication()).startPush();
            RuStorePushClient.INSTANCE.getToken().addOnSuccessListener(token -> {
                state().token(token); PushSyncWorker.resume(getContext()); resolve(call);
            }).addOnFailureListener(error -> {
                state().prefs.edit().putString("status", "token-error").commit(); resolve(call);
            });
            PushSyncWorker.enqueue(getContext());
        } catch(Exception e) { call.reject("Не удалось включить уведомления"); }
    }
    @PluginMethod public void setSelection(PluginCall call) {
        try {
            state().selection(call.getArray("fixtureIds"), call.getArray("teamIds"), call.getArray("kinds"));
            PushSyncWorker.resume(getContext()); resolve(call);
        } catch(Exception e) { call.reject("Не удалось сохранить выбор"); }
    }
    @PluginMethod public void disable(PluginCall call) {
        state().disable();
        ((KromkaApplication)getActivity().getApplication()).components(false);
        NotificationManagerCompat.from(getContext()).cancelAll();
        PushSyncWorker.resume(getContext()); resolve(call);
    }
    @PluginMethod public void openSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        getActivity().startActivity(intent); call.resolve();
    }
    @Override protected void handleOnDestroy() { network.shutdownNow(); }
}
