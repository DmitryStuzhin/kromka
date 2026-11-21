package ru.tokenapp.kromka;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import java.util.Map;
import ru.rustore.sdk.pushclient.messaging.service.RuStoreMessagingService;
import ru.rustore.sdk.pushclient.messaging.model.RemoteMessage;

public class KromkaMessagingService extends RuStoreMessagingService {
    static boolean allowed(Context context) {
        if(!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false;
        if(android.os.Build.VERSION.SDK_INT>=26) {
            NotificationChannel channel=context.getSystemService(NotificationManager.class).getNotificationChannel("matches");
            if(channel!=null && channel.getImportance()==NotificationManager.IMPORTANCE_NONE) return false;
        }
        return true;
    }
    @Override public void onNewToken(String token) {
        new PushState(this).token(token); PushSyncWorker.resume(this);
    }
    @Override public void onMessageReceived(RemoteMessage message) { display(this, message.getData()); }
    static boolean display(Context context, Map<String,String> data) {
        PushState state = new PushState(context);
        String event = data.get("eventId"), fixture = data.get("fixtureId"), kind = data.get("kind"), title = data.get("title"), body = data.get("body");
        if(event==null || !event.matches("[a-f0-9]{64}") || fixture==null || !fixture.matches("[A-Za-z0-9_-]{1,64}") || kind==null || !kind.matches("goal|lineups|start|finish")
            || title==null || title.isEmpty() || title.length()>100 || body==null || body.length()>300) return false;
        synchronized (PushState.LOCK) {
            if(!state.enabled() || state.seen(event) || !allowed(context)) return false;
            boolean wanted = false;
            org.json.JSONArray kinds = PushState.array(state.prefs.getString("kinds", PushState.DEFAULT_KINDS));
            for(int i=0;i<kinds.length();i++) if(kind.equals(kinds.optString(i))) wanted=true;
            if(!wanted) return false;
            boolean selected = false;
            org.json.JSONArray fixtures = PushState.array(state.prefs.getString("fixtures", "[]")), teams = PushState.array(state.prefs.getString("teams", "[]"));
            for(int i=0;i<fixtures.length();i++) if(fixture.equals(fixtures.optString(i))) selected=true;
            for(int i=0;i<teams.length();i++) if(teams.optString(i).equals(data.get("homeTeamId")) || teams.optString(i).equals(data.get("awayTeamId"))) selected=true;
            if(!selected) return false;
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            if(android.os.Build.VERSION.SDK_INT>=26) {
                manager.createNotificationChannel(new NotificationChannel("matches", "Матчи и результаты", NotificationManager.IMPORTANCE_DEFAULT));
                if(manager.getNotificationChannel("matches").getImportance()==NotificationManager.IMPORTANCE_NONE) return false;
            }
            Intent intent = new Intent(context, MainActivity.class).setAction(Intent.ACTION_VIEW)
                .setData(Uri.parse("ru.tokenapp.kromka://match/"+fixture)).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent pending = PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
            try {
                manager.notify(event, 0, new NotificationCompat.Builder(context, "matches").setSmallIcon(R.drawable.ic_notification)
                    .setContentTitle(title).setContentText(body).setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                    .setAutoCancel(true).setContentIntent(pending).build());
                state.remember(event); return true;
            } catch(SecurityException e) { return false; }
        }
    }
}
