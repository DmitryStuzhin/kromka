package ru.tokenapp.kromka;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONException;
import java.security.SecureRandom;
import java.util.TreeSet;
import java.util.UUID;

/** Credentials never leave native storage except in the authenticated HTTPS request. */
final class PushState {
    static final Object LOCK = new Object();
    static final String CONSENT = "2026-11-21";
    static final String DEFAULT_KINDS = "[\"goal\",\"lineups\",\"start\",\"finish\"]";
    final SharedPreferences prefs;
    PushState(Context context) { prefs = context.getSharedPreferences("kromka-push", Context.MODE_PRIVATE); }
    boolean enabled() { return prefs.getBoolean("enabled", false); }
    static JSONArray array(String value) {
        try { return new JSONArray(value); } catch (JSONException e) { return new JSONArray(); }
    }
    static JSONArray clean(JSONArray values, boolean kinds) throws JSONException {
        if (values == null || values.length() > 100) throw new JSONException("Invalid selections");
        TreeSet<String> set = new TreeSet<>();
        for (int i=0; i<values.length(); i++) {
            Object item = values.get(i);
            if (!(item instanceof String)) throw new JSONException("Invalid selection");
            String value = (String)item;
            if (kinds ? !value.matches("goal|lineups|start|finish") : !value.matches("[A-Za-z0-9_-]{1,64}")) throw new JSONException("Invalid selection");
            set.add(value);
        }
        return new JSONArray(set);
    }
    void ensureCredentials() {
        if (prefs.contains("id")) return;
        byte[] bytes = new byte[32]; new SecureRandom().nextBytes(bytes);
        prefs.edit().putString("id", UUID.randomUUID().toString()).putString("secret", Base64.encodeToString(bytes, Base64.NO_WRAP|Base64.URL_SAFE|Base64.NO_PADDING)).commit();
    }
    void changed(SharedPreferences.Editor editor, String status) {
        editor.putLong("generation", prefs.getLong("generation", 0)+1).putBoolean("pending", true).putString("status", status).commit();
    }
    void enable(JSONArray fixtures, JSONArray teams, JSONArray kinds) throws JSONException {
        JSONArray f = clean(fixtures, false), t = clean(teams, false), k = clean(kinds, true);
        synchronized (LOCK) {
            ensureCredentials();
            changed(prefs.edit().putBoolean("enabled", true).putString("fixtures", f.toString()).putString("teams", t.toString()).putString("kinds", k.toString()), "connecting");
        }
    }
    void selection(JSONArray fixtures, JSONArray teams, JSONArray kinds) throws JSONException {
        String f = clean(fixtures, false).toString(), t = clean(teams, false).toString(), k = clean(kinds, true).toString();
        synchronized (LOCK) {
            if (f.equals(prefs.getString("fixtures", "[]")) && t.equals(prefs.getString("teams", "[]")) && k.equals(prefs.getString("kinds", DEFAULT_KINDS))) return;
            SharedPreferences.Editor edit = prefs.edit().putString("fixtures", f).putString("teams", t).putString("kinds", k);
            if (enabled()) changed(edit, "pending"); else edit.commit();
        }
    }
    void token(String token) {
        if (token == null || !token.matches("[^\\s\\p{Cntrl}]{20,4096}")) return;
        synchronized (LOCK) {
            if (enabled() && !token.equals(prefs.getString("token", ""))) changed(prefs.edit().putString("token", token), "pending");
        }
    }
    void disable() {
        synchronized (LOCK) {
            if (prefs.contains("id")) changed(prefs.edit().putBoolean("enabled", false).remove("token"), "revoking");
            else prefs.edit().putBoolean("enabled", false).putString("status", "off").commit();
        }
    }
    JSONObject publicState() throws JSONException {
        return new JSONObject().put("configured", KromkaApplication.configured()).put("enabled", enabled())
            .put("pending", prefs.getBoolean("pending", false)).put("status", prefs.getString("status", "off"))
            .put("fixtureIds", array(prefs.getString("fixtures", "[]"))).put("teamIds", array(prefs.getString("teams", "[]")))
            .put("kinds", array(prefs.getString("kinds", DEFAULT_KINDS)));
    }
    boolean seen(String event) {
        JSONArray values = array(prefs.getString("seen", "[]"));
        for (int i=0; i<values.length(); i++) if (event.equals(values.optString(i))) return true;
        return false;
    }
    void remember(String event) {
        JSONArray values = array(prefs.getString("seen", "[]")), next = new JSONArray();
        for (int i=Math.max(0, values.length()-99); i<values.length(); i++) next.put(values.optString(i));
        next.put(event); prefs.edit().putString("seen", next.toString()).commit();
    }
}
