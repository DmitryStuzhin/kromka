package ru.tokenapp.kromka;

import static org.junit.Assert.*;
import android.graphics.Bitmap;
import android.os.SystemClock;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class OfflineSmokeTest {
    private MainActivity activity;

    private String js(String source) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> activity.getBridge().getWebView().evaluateJavascript(source, value -> { result.set(value); done.countDown(); }));
        assertTrue("WebView JavaScript timed out", done.await(10, TimeUnit.SECONDS));
        return result.get();
    }
    private void until(String condition) throws Exception {
        long end = SystemClock.elapsedRealtime() + 20000;
        while (SystemClock.elapsedRealtime() < end) {
            if ("true".equals(js("Boolean(" + condition + ")"))) return;
            SystemClock.sleep(100);
        }
        fail("Condition was not met: " + condition + "; page=" + js("document.body.innerText.slice(0,400)")
            + "; navigation=" + js("JSON.stringify({url:location.href,pending:sessionStorage.getItem('kromka:push-match'),live:window.isLiveData,layer:window.openMatch?.__detailedMatchLayer})"));
    }
    private void screenshot(String filename) throws Exception {
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();
        Bitmap bitmap = InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
        assertNotNull(bitmap);
        String output = InstrumentationRegistry.getArguments().getString("additionalTestOutputDir", activity.getExternalFilesDir(null).getAbsolutePath());
        File directory = new File(output);
        assertTrue(directory.isDirectory() || directory.mkdirs());
        try (FileOutputStream out = new FileOutputStream(new File(directory, filename))) {
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, out);
        }
    }
    @Test public void bundledAppOfflineCacheLegalPagesAndBack() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(value -> activity = value);
            until("window.kromkaNative && document.readyState==='complete' && typeof window.refreshGoalData==='function'");
            assertEquals("ru.tokenapp.kromka", activity.getPackageName());
            assertEquals("\"android\"", js("window.Capacitor.getPlatform()"));
            assertEquals("\"https://tokenapp.ru/healthz\"", js("window.kromkaApiUrl('/healthz')"));

            // Block network at the actual WebView boundary, preserving Capacitor's local asset handler.
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> activity.getBridge().getWebView().getSettings().setBlockNetworkLoads(true));
            js("localStorage.clear(); location.reload()");
            until("document.querySelector('.prototype-strip')?.innerText.includes('Демо')");
            screenshot("smoke-no-cache.png");

            // A deterministic synthetic season tests the persisted cache, without depending on sports providers.
            js("localStorage.setItem('temp-rpl:favorite-matches',JSON.stringify(['smoke1']));" +
               "localStorage.setItem('kromka:offline-season',JSON.stringify({savedAt:1800000000000,payload:{" +
               "fixtures:{data:[{id:'smoke1',homeTeamId:'zenit-test',awayTeamId:'dynamo-test',homeTeam:{id:'zenit-test',name:'Зенит'},awayTeam:{id:'dynamo-test',name:'Динамо Москва'},kickoffUtc:new Date(Date.now()+86400000).toISOString(),status:'SCHEDULED'}]}," +
               "standings:{data:[{team:{id:'zenit-test',name:'Зенит'},played:14,points:31,goalsFor:32,goalsAgainst:15},{team:{id:'dynamo-test',name:'Динамо Москва'},played:14,points:30,goalsFor:23,goalsAgainst:13}]},fetchedAt:'2027-01-15T08:00:00Z'}})); location.reload()");
            until("window.kromkaOffline && window.isLiveData && document.querySelector('.prototype-strip')?.innerText.includes('Сохранено')");
            assertEquals("true", js("JSON.parse(localStorage.getItem('temp-rpl:favorite-matches')).includes('smoke1')"));
            js("document.querySelector('.nav-item[data-tab=table]').click()");
            until("document.querySelector('#screen').innerText.includes('Зенит') && document.querySelector('#screen').innerText.includes('31')");
            screenshot("smoke-saved-table.png");
            assertEquals("false", js("window.kromkaOpenPushMatch('unknown-match')"));
            assertEquals("true", js("window.kromkaOpenPushMatch('smoke1')"));
            until("document.querySelector('#screen [data-detail-back]') !== null");
            androidx.test.espresso.Espresso.pressBack();
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> activity.startActivity(
                new android.content.Intent(activity, MainActivity.class).setAction(android.content.Intent.ACTION_VIEW)
                    .setData(android.net.Uri.parse("ru.tokenapp.kromka://match/smoke1"))
                    .addFlags(android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP)));
            until("document.querySelector('#screen [data-detail-back]') !== null");
            androidx.test.espresso.Espresso.pressBack();

            js("location.href='/privacy.html'");
            until("document.querySelector('h1')?.innerText.toLowerCase().includes('конфиденциальност')");
            assertEquals("true", js("document.querySelector('a[href=\"/storage.html\"]') !== null"));
            screenshot("smoke-privacy.png");
            js("location.href='/storage.html#notifications'");
            until("document.querySelector('#push-state')?.innerText.includes('пока недоступны')");
            assertEquals("true", js("document.querySelector('#push-toggle').disabled"));
            screenshot("smoke-push-unavailable.png");
            androidx.test.espresso.Espresso.pressBack();
            until("location.pathname==='/' && document.querySelector('.nav-item[data-tab=today]')!==null");
        }
    }
}
