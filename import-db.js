const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');

const data = JSON.parse(fs.readFileSync('./it.1.json', 'utf8'));
const matches = data.matches;
const db = new sqlite3.Database('./football_final.db');

// Funzione per generare id fittizi da nome (solo se non trovato)
function genId(str) {
  return parseInt(crypto.createHash('md5').update(str).digest('hex').slice(0, 8), 16);
}

function getTeamId(name, cb) {
  db.get(
    `SELECT home_team_id as id FROM historical_matches WHERE home_team_name=? LIMIT 1`,
    [name],
    (err, row) => {
      if (row?.id) return cb(row.id);
      // Cerca come away se non trovato come home
      db.get(
        `SELECT away_team_id as id FROM historical_matches WHERE away_team_name=? LIMIT 1`,
        [name],
        (err2, row2) => {
          if (row2?.id) return cb(row2.id);
          // Altrimenti genera con hash
          return cb(genId(name));
        }
      );
    }
  );
}

db.serialize(() => {
  let stmt = db.prepare(`
    INSERT OR REPLACE INTO historical_matches
    (id, match_date, season, competition_id, matchday,
     home_team_id, away_team_id, home_team_name, away_team_name,
     home_goals, away_goals, match_result, status, winner)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Inserisce tutte in sequenza, con lookup id:
  let i = 0;
  function next() {
    if (i >= matches.length) {
      stmt.finalize(() => {
        console.log("✅ Import completato!");
        db.close();
      });
      return;
    }
    const m = matches[i];
    const matchDate = m.date + "T" + (m.time || "00:00") + ":00Z";
    const season = parseInt(m.date.substring(0, 4));
    const competitionId = 2019; // Serie A
    const matchday = parseInt(m.round.replace(/\D/g, "")) || 1;
    const homeGoals = m.score?.ft?.[0] ?? 0;
    const awayGoals = m.score?.ft?.[1] ?? 0;
    let result = 'draw';
    if (homeGoals > awayGoals) result = 'home';
    else if (awayGoals > homeGoals) result = 'away';
    let winner = (result === 'home') ? 'HOME_TEAM' : (result === 'away') ? 'AWAY_TEAM' : 'DRAW';
    // L’id della partita può essere hash su data+team1+team2
    const matchId = genId(`${m.date}_${m.team1}_${m.team2}`);

    // Recupera id squadre
    getTeamId(m.team1, (homeId) => {
      getTeamId(m.team2, (awayId) => {
        stmt.run([
          matchId,
          matchDate,
          season,
          competitionId,
          matchday,
          homeId,
          awayId,
          m.team1,
          m.team2,
          homeGoals,
          awayGoals,
          result,
          'FINISHED',
          winner
        ], next);
        i++;
      });
    });
  }
  next();
});
