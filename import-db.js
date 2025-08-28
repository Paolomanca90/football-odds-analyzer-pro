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

// Funzione per determinare risultato partita
function getMatchResult(homeGoals, awayGoals) {
  if (homeGoals > awayGoals) return 'home';
  if (awayGoals > homeGoals) return 'away';
  return 'draw';
}

db.serialize(() => {
  // QUERY AGGIORNATA con supporto primo tempo
  let stmt = db.prepare(`
    INSERT OR REPLACE INTO historical_matches
    (id, match_date, season, competition_id, matchday,
     home_team_id, away_team_id, home_team_name, away_team_name,
     home_goals, away_goals, match_result, status, winner,
     home_goals_ht, away_goals_ht, match_result_ht)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let i = 0;
  function next() {
    if (i >= matches.length) {
      stmt.finalize(() => {
        console.log(`✅ Import completato! Processate ${matches.length} partite con dati primo tempo`);
        
        // Stampa statistiche finali
        db.get(`
          SELECT 
            COUNT(*) as total,
            COUNT(home_goals_ht) as with_ht,
            ROUND(AVG(COALESCE(total_goals_ht, 0)), 2) as avg_ht_goals,
            ROUND(AVG(total_goals), 2) as avg_ft_goals
          FROM historical_matches 
          WHERE competition_id = 2019
        `, (err, stats) => {
          if (stats) {
            console.log(`📊 Statistiche import:`);
            console.log(`   Partite totali Serie A: ${stats.total}`);
            console.log(`   Con dati 1° tempo: ${stats.with_ht}`);
            console.log(`   Media gol 1° tempo: ${stats.avg_ht_goals}`);
            console.log(`   Media gol finale: ${stats.avg_ft_goals}`);
          }
          db.close();
        });
      });
      return;
    }

    const m = matches[i];
    const matchDate = m.date + "T" + (m.time || "00:00") + ":00Z";
    const season = parseInt(m.date.substring(0, 4));
    const competitionId = 2019; // Serie A
    const matchday = parseInt(m.round.replace(/\D/g, "")) || 1;

    // DATI FINALI
    const homeGoals = m.score?.ft?.[0] ?? 0;
    const awayGoals = m.score?.ft?.[1] ?? 0;
    const ftResult = getMatchResult(homeGoals, awayGoals);
    const winner = (ftResult === 'home') ? 'HOME_TEAM' : (ftResult === 'away') ? 'AWAY_TEAM' : 'DRAW';

    // DATI PRIMO TEMPO
    const homeGoalsHT = m.score?.ht?.[0] ?? 0;  // Cerca nel JSON il campo primo tempo
    const awayGoalsHT = m.score?.ht?.[1] ?? 0;  // Se non esiste, usa 0
    const htResult = getMatchResult(homeGoalsHT, awayGoalsHT);

    // L'id della partita può essere hash su data+team1+team2
    const matchId = genId(`${m.date}_${m.team1}_${m.team2}`);

    // Log per debugging (ogni 10 partite)
    if (i % 10 === 0) {
      console.log(`📝 Processing match ${i + 1}/${matches.length}: ${m.team1} vs ${m.team2}`);
      console.log(`   HT: ${homeGoalsHT}-${awayGoalsHT} | FT: ${homeGoals}-${awayGoals}`);
    }

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
          ftResult,
          'FINISHED',
          winner,
          // NUOVI PARAMETRI per primo tempo
          homeGoalsHT,
          awayGoalsHT,
          htResult
        ], (err) => {
          if (err) {
            console.error(`❌ Error inserting match ${i + 1}:`, err.message);
          }
          next();
        });
        i++;
      });
    });
  }
  
  console.log(`🚀 Starting import of ${matches.length} matches with halftime data...`);
  next();
});
