package io.github.fabianhel.lolesports;

import java.text.DateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/** Aktueller Stand eines verfolgten Matches, aufbereitet als Textzeilen für Benachrichtigung und Widget. */
final class MatchSnapshot {

    enum Phase { UNSTARTED, LIVE, BETWEEN, FINISHED }

    Phase phase;
    String league = "";
    String codeA = "?", codeB = "?";
    String imgA, imgB;
    int winsA, winsB, bestOf;
    int gameNumber;
    String line1 = "", line2 = "", line3 = "";

    String score() {
        return phase == Phase.UNSTARTED ? "vs" : winsA + " : " + winsB;
    }

    static MatchSnapshot load(String matchId, long startTime) throws Exception {
        JSONObject event = LolApi.eventDetails(matchId);
        JSONObject match = event.getJSONObject("match");
        JSONArray teams = match.optJSONArray("teams");
        JSONArray games = match.optJSONArray("games");
        if (teams == null) teams = new JSONArray();
        if (games == null) games = new JSONArray();

        MatchSnapshot s = new MatchSnapshot();
        JSONObject leagueObj = event.optJSONObject("league");
        s.league = leagueObj != null ? leagueObj.optString("name", "") : "";
        JSONObject strategy = match.optJSONObject("strategy");
        s.bestOf = strategy != null ? strategy.optInt("count", 1) : 1;

        JSONObject a = teams.optJSONObject(0);
        JSONObject b = teams.optJSONObject(1);
        String idA = "", idB = "";
        if (a != null) {
            s.codeA = teamCode(a);
            s.imgA = a.optString("image", null);
            idA = a.optString("id", "");
            s.winsA = gameWins(a);
        }
        if (b != null) {
            s.codeB = teamCode(b);
            s.imgB = b.optString("image", null);
            idB = b.optString("id", "");
            s.winsB = gameWins(b);
        }

        int needed = s.bestOf / 2 + 1;
        JSONObject liveGame = null;
        int completed = 0, open = 0;
        for (int i = 0; i < games.length(); i++) {
            JSONObject g = games.getJSONObject(i);
            String st = g.optString("state");
            if ("inProgress".equals(st)) liveGame = g;
            else if ("completed".equals(st)) completed++;
            else if ("unstarted".equals(st)) open++;
        }

        boolean finished = s.winsA >= needed || s.winsB >= needed || (games.length() > 0 && liveGame == null && open == 0);
        if (finished) {
            s.phase = Phase.FINISHED;
            boolean aWon = s.winsA > s.winsB;
            String winner = aWon ? s.codeA : s.codeB;
            String loser = aWon ? s.codeB : s.codeA;
            s.line1 = winner + " gewinnt " + Math.max(s.winsA, s.winsB) + " : " + Math.min(s.winsA, s.winsB);
            s.line2 = "gegen " + loser + (s.league.isEmpty() ? "" : " · " + s.league);
            s.line3 = "";
            return s;
        }

        String header = s.codeA + " " + s.winsA + " : " + s.winsB + " " + s.codeB;

        if (liveGame != null) {
            s.gameNumber = liveGame.optInt("number", completed + 1);
            JSONObject window = LolApi.gameWindow(liveGame.getString("id"));
            JSONArray frames = window != null ? window.optJSONArray("frames") : null;
            if (frames == null || frames.length() == 0) {
                s.phase = Phase.LIVE;
                s.line1 = header + " · Spiel " + s.gameNumber;
                s.line2 = "Spiel läuft – warte auf Live-Daten …";
                s.line3 = s.league;
                return s;
            }
            JSONObject frame = frames.getJSONObject(frames.length() - 1);
            if ("finished".equals(frame.optString("gameState"))) {
                // Spiel ist vorbei, die Seriendaten sind aber noch nicht aktualisiert
                s.phase = Phase.BETWEEN;
                s.gameNumber = s.gameNumber + 1;
                s.line1 = header + " · Spiel " + (s.gameNumber - 1) + " beendet";
                s.line2 = "Ergebnis wird aktualisiert …";
                s.line3 = s.league;
                return s;
            }
            JSONObject meta = window.getJSONObject("gameMetadata");
            String blueId = meta.getJSONObject("blueTeamMetadata").optString("esportsTeamId", "");
            boolean aIsBlue = blueId.isEmpty() || !blueId.equals(idB);
            JSONObject teamA = frame.getJSONObject(aIsBlue ? "blueTeam" : "redTeam");
            JSONObject teamB = frame.getJSONObject(aIsBlue ? "redTeam" : "blueTeam");

            int goldDiff = teamA.optInt("totalGold") - teamB.optInt("totalGold");
            String gold;
            if (goldDiff == 0) gold = "Gold ausgeglichen";
            else gold = "Gold +" + formatGold(Math.abs(goldDiff)) + " (" + (goldDiff > 0 ? s.codeA : s.codeB) + ")";

            s.phase = Phase.LIVE;
            boolean paused = "paused".equals(frame.optString("gameState"));
            s.line1 = header + " · Spiel " + s.gameNumber + (paused ? " · Pause" : "");
            s.line2 = "Kills: " + teamA.optInt("totalKills") + "–" + teamB.optInt("totalKills") + " · " + gold;
            s.line3 = "🐉 " + count(teamA.optJSONArray("dragons")) + " – " + count(teamB.optJSONArray("dragons")) +
                " · Baron " + teamA.optInt("barons") + "–" + teamB.optInt("barons");
            return s;
        }

        if (completed == 0 && s.winsA == 0 && s.winsB == 0) {
            s.phase = Phase.UNSTARTED;
            s.line1 = s.codeA + " vs " + s.codeB;
            s.line2 = startTime > 0
                ? "Startet um " + DateFormat.getTimeInstance(DateFormat.SHORT, Locale.GERMANY).format(new Date(startTime)) + " Uhr"
                : "Startet bald";
            s.line3 = s.league + " · Bo" + s.bestOf;
            return s;
        }

        s.phase = Phase.BETWEEN;
        s.gameNumber = completed + 1;
        s.line1 = header + " · Spiel " + s.gameNumber;
        s.line2 = "Pause – Spiel " + s.gameNumber + " startet gleich";
        s.line3 = s.league + " · Bo" + s.bestOf;
        return s;
    }

    private static String teamCode(JSONObject t) {
        String code = t.optString("code", "");
        if (code.isEmpty()) code = t.optString("name", "TBD");
        return code;
    }

    private static int gameWins(JSONObject t) {
        JSONObject r = t.optJSONObject("result");
        return r != null ? r.optInt("gameWins", 0) : 0;
    }

    private static int count(JSONArray arr) {
        return arr != null ? arr.length() : 0;
    }

    static String formatGold(int gold) {
        if (gold < 1000) return String.valueOf(gold);
        return String.format(Locale.GERMANY, "%.1fk", gold / 1000.0);
    }
}
