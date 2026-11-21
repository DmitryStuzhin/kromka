package ru.tokenapp.kromka;

import static org.junit.Assert.*;
import android.app.NotificationManager;
import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONArray;
import org.junit.Test;
import org.junit.runner.RunWith;
import ru.rustore.sdk.pushclient.RuStorePushClient;

@RunWith(AndroidJUnit4.class)
public class PushStateTest {
    @Test public void privateCredentialsRotationDedupAndImmediateOfflineOptOut() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        PushState state = new PushState(context);
        state.prefs.edit().clear().commit();
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        try {
            assertFalse(KromkaApplication.configured());
            assertFalse(RuStorePushClient.INSTANCE.isInitialized());
            state.enable(new JSONArray("[\"m1\"]"), new JSONArray("[\"t1\"]"), new JSONArray("[\"goal\"]"));
            String id = state.prefs.getString("id", ""), secret = state.prefs.getString("secret", "");
            assertTrue(secret.matches("[A-Za-z0-9_-]{43}"));
            assertFalse(state.publicState().has("secret")); assertFalse(state.publicState().has("token"));
            state.token("first-device-token-123456789");
            long version = state.prefs.getLong("generation", 0);
            state.token("rotated-device-token-123456789");
            assertEquals(version+1, state.prefs.getLong("generation", 0));
            assertEquals(id, state.prefs.getString("id", "")); assertEquals(secret, state.prefs.getString("secret", ""));
            assertEquals("rotated-device-token-123456789", new PushState(context).prefs.getString("token", ""));
            state.prefs.edit().putBoolean("pending", false).putLong("syncedAt", System.currentTimeMillis()).commit();
            version = state.prefs.getLong("generation", 0);
            state.selection(new JSONArray("[\"m1\"]"), new JSONArray("[\"t1\"]"), new JSONArray("[\"goal\"]"));
            assertEquals(version, state.prefs.getLong("generation", 0));
            state.prefs.edit().putLong("syncedAt", System.currentTimeMillis()-2*86400_000L).commit();
            state.selection(new JSONArray("[\"m1\"]"), new JSONArray("[\"t1\"]"), new JSONArray("[\"goal\"]"));
            assertEquals(version+1, state.prefs.getLong("generation", 0));

            try(android.os.ParcelFileDescriptor fd = InstrumentationRegistry.getInstrumentation().getUiAutomation()
                .executeShellCommand("pm grant "+context.getPackageName()+" android.permission.POST_NOTIFICATIONS")) {
                try(java.io.InputStream in = new android.os.ParcelFileDescriptor.AutoCloseInputStream(fd)) { while(in.read()!=-1) {} }
            }
            Map<String,String> message = new HashMap<>();
            message.put("eventId", new String(new char[64]).replace('\0', 'a')); message.put("fixtureId", "m1");
            message.put("kind", "goal"); message.put("title", "Гол"); message.put("body", "Зенит — Динамо · 1:0");
            assertTrue(KromkaMessagingService.display(context, message));
            assertFalse(KromkaMessagingService.display(context, message));
            assertTrue(new PushState(context).seen(message.get("eventId")));
            state.selection(new JSONArray(), new JSONArray(), new JSONArray("[\"goal\"]"));
            message.put("eventId", new String(new char[64]).replace('\0', 'c'));
            assertFalse(KromkaMessagingService.display(context, message)); // locally removed subscriptions
            state.disable();
            assertFalse(state.enabled()); assertFalse(state.prefs.contains("token"));
            assertEquals("revoking", state.publicState().getString("status"));
            message.put("eventId", new String(new char[64]).replace('\0', 'b'));
            assertFalse(KromkaMessagingService.display(context, message));
            state.token("late-token-after-optout-12345"); assertFalse(state.prefs.contains("token"));
            assertFalse(RuStorePushClient.INSTANCE.isInitialized());
        } finally { manager.cancelAll(); state.prefs.edit().clear().commit(); }
    }
}
