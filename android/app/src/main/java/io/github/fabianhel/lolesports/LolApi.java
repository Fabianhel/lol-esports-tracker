package io.github.fabianhel.lolesports;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONException;
import org.json.JSONObject;

/** Minimaler Client für die öffentliche LoL-Esports-API (dieselbe wie in api.js). */
final class LolApi {

    private static final String API = "https://esports-api.lolesports.com/persisted/gw/";
    private static final String FEED = "https://feed.lolesports.com/livestats/v1/";
    private static final String KEY = "0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z";

    private LolApi() {}

    /** Liefert den Antworttext oder null bei 204/404 (noch keine Daten). */
    static String get(String url, boolean withKey) throws IOException {
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        try {
            con.setConnectTimeout(10_000);
            con.setReadTimeout(15_000);
            if (withKey) con.setRequestProperty("x-api-key", KEY);
            con.setRequestProperty("Accept", "application/json");
            int code = con.getResponseCode();
            if (code == 204 || code == 404) return null;
            if (code < 200 || code >= 300) throw new IOException("HTTP " + code);
            return readAll(con.getInputStream());
        } finally {
            con.disconnect();
        }
    }

    static byte[] getBytes(String url) throws IOException {
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        try {
            con.setConnectTimeout(10_000);
            con.setReadTimeout(15_000);
            if (con.getResponseCode() != 200) throw new IOException("HTTP " + con.getResponseCode());
            try (InputStream in = con.getInputStream()) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                return out.toByteArray();
            }
        } finally {
            con.disconnect();
        }
    }

    private static String readAll(InputStream in) throws IOException {
        try (InputStream is = in) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = is.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString(StandardCharsets.UTF_8.name());
        }
    }

    static JSONObject eventDetails(String matchId) throws IOException, JSONException {
        String body = get(API + "getEventDetails?hl=de-DE&id=" + URLEncoder.encode(matchId, "UTF-8"), true);
        if (body == null) throw new IOException("Match nicht gefunden");
        return new JSONObject(body).getJSONObject("data").getJSONObject("event");
    }

    /** Letzte Spielstatistik eines laufenden Spiels oder null, wenn noch keine Daten vorliegen. */
    static JSONObject gameWindow(String gameId) throws IOException, JSONException {
        String body = get(FEED + "window/" + gameId + "?startingTime=" + URLEncoder.encode(feedStartTime(), "UTF-8"), false);
        if (body == null || body.isEmpty()) return null;
        return new JSONObject(body);
    }

    /** Der Feed verlangt einen auf 10 s gerundeten Zeitpunkt in der Vergangenheit. */
    private static String feedStartTime() {
        long t = System.currentTimeMillis() - 60_000;
        t -= t % 10_000;
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f.format(new Date(t));
    }
}
