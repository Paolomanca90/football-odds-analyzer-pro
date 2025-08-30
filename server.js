// server.js - Versione aggiornata con supporto primo tempo
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ===========================================
// CONFIGURAZIONE API
// ===========================================
const API_CONFIG = {
    baseUrl: 'https://api.football-data.org/v4',
    headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY },
    competitions: { 
        'SA': 2019, 'PL': 2021, 'BL1': 2002, 'FL1': 2015,
        'PD': 2014, 'DED': 2003, 'PPL': 2017, 'CL': 2001
    }
};

// Rate limiting
let lastApiCall = 0;
const MIN_INTERVAL = 6100;

async function rateLimitedCall(apiCall) {
    const now = Date.now();
    const timeSinceLastCall = now - lastApiCall;
    
    if (timeSinceLastCall < MIN_INTERVAL) {
        const waitTime = MIN_INTERVAL - timeSinceLastCall;
        console.log(`⏳ Rate limit: waiting ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    lastApiCall = Date.now();
    return await apiCall();
}

// ===========================================
// DATABASE SETUP CON SUPPORTO PRIMO TEMPO
// ===========================================
const db = new sqlite3.Database('./football_final.db');

db.serialize(() => {
    // Tabella partite storiche AGGIORNATA con primo tempo
    db.run(`CREATE TABLE IF NOT EXISTS historical_matches (
        id INTEGER PRIMARY KEY,
        match_date TEXT NOT NULL,
        season INTEGER NOT NULL,
        competition_id INTEGER NOT NULL,
        matchday INTEGER,
        home_team_id INTEGER NOT NULL,
        away_team_id INTEGER NOT NULL,
        home_team_name TEXT NOT NULL,
        away_team_name TEXT NOT NULL,
        home_goals INTEGER DEFAULT 0,
        away_goals INTEGER DEFAULT 0,
        total_goals INTEGER GENERATED ALWAYS AS (home_goals + away_goals),
        match_result TEXT,
        status TEXT DEFAULT 'FINISHED',
        winner TEXT,
        -- NUOVE COLONNE PER PRIMO TEMPO
        home_goals_ht INTEGER DEFAULT 0,
        away_goals_ht INTEGER DEFAULT 0,
        total_goals_ht INTEGER GENERATED ALWAYS AS (home_goals_ht + away_goals_ht),
        match_result_ht TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(id) ON CONFLICT REPLACE
    )`);
    
    // Aggiungi colonne primo tempo se non esistono (per DB esistenti)
    db.run(`ALTER TABLE historical_matches ADD COLUMN home_goals_ht INTEGER DEFAULT 0`, () => {});
    db.run(`ALTER TABLE historical_matches ADD COLUMN away_goals_ht INTEGER DEFAULT 0`, () => {});
    db.run(`ALTER TABLE historical_matches ADD COLUMN match_result_ht TEXT`, () => {});
    
    // Cache
    db.run(`CREATE TABLE IF NOT EXISTS cache_simple (
        key TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        expires_at DATETIME NOT NULL
    )`);
    
    // Indici
    db.run(`CREATE INDEX IF NOT EXISTS idx_h_teams ON historical_matches(home_team_id, away_team_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_h_date ON historical_matches(match_date DESC)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_h_season ON historical_matches(season, competition_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_h_ht_goals ON historical_matches(home_goals_ht, away_goals_ht)`);
    
    console.log('📦 Database initialized with halftime support');
});

// Cache helper
const cache = {
    async get(key) {
        return new Promise((resolve) => {
            db.get(
                `SELECT data FROM cache_simple WHERE key = ? AND expires_at > datetime('now')`,
                [key], (err, row) => resolve(row ? JSON.parse(row.data) : null)
            );
        });
    },
    
    async set(key, data, minutes = 30) {
        const expires = new Date(Date.now() + minutes * 60 * 1000);
        db.run(
            `INSERT OR REPLACE INTO cache_simple (key, data, expires_at) VALUES (?, ?, ?)`,
            [key, JSON.stringify(data), expires.toISOString()]
        );
    }
};

// ===========================================
// HISTORICAL MANAGER AGGIORNATO
// ===========================================
class HistoricalManager {
    
    // FUNZIONE SAVEMATCH AGGIORNATA per salvare anche dati primo tempo
    static async saveMatch(match, season, competitionId) {
        if (!match.score?.fullTime || match.score.fullTime.home === null) {
            return false;
        }
        
        // Estrai dati primo tempo (se disponibili)
        const halfTimeScore = match.score?.halfTime || { home: 0, away: 0 };
        const htHome = halfTimeScore.home !== null ? halfTimeScore.home : 0;
        const htAway = halfTimeScore.away !== null ? halfTimeScore.away : 0;
        
        return new Promise((resolve) => {
            const ftResult = this.getMatchResult(match.score.fullTime);
            const htResult = this.getMatchResult({ home: htHome, away: htAway });
            
            db.run(`
                INSERT OR REPLACE INTO historical_matches 
                (id, match_date, season, competition_id, matchday, 
                 home_team_id, away_team_id, home_team_name, away_team_name, 
                 home_goals, away_goals, match_result, status, winner,
                 home_goals_ht, away_goals_ht, match_result_ht)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                match.id,
                match.utcDate,
                season,
                competitionId,
                match.matchday || 1,
                match.homeTeam.id,
                match.awayTeam.id,
                match.homeTeam.name,
                match.awayTeam.name,
                match.score.fullTime.home,
                match.score.fullTime.away,
                ftResult,
                match.status,
                match.score.winner,
                htHome,
                htAway,
                htResult
            ], function(err) {
                if (err) {
                    console.error('Save error:', err.message);
                    resolve(false);
                } else {
                    resolve(true);
                }
            });
        });
    }
    
    // Ottieni H2H con dati primo tempo
    static async getH2HWithHalftime(team1Id, team2Id, years = 5) {
        const cutoff = new Date();
        cutoff.setFullYear(cutoff.getFullYear() - years);
        
        return new Promise((resolve) => {
            db.all(`
                SELECT 
                    *,
                    (total_goals - COALESCE(total_goals_ht, 0)) as second_half_goals,
                    (home_goals - COALESCE(home_goals_ht, 0)) as home_goals_2h,
                    (away_goals - COALESCE(away_goals_ht, 0)) as away_goals_2h
                FROM historical_matches 
                WHERE ((home_team_id = ? AND away_team_id = ?) OR (home_team_id = ? AND away_team_id = ?))
                AND match_date >= ?
                ORDER BY match_date DESC
                LIMIT 15
            `, [team1Id, team2Id, team2Id, team1Id, cutoff.toISOString()], (err, rows) => {
                resolve(err ? [] : rows || []);
            });
        });
    }
    
    // Metodi esistenti...
    static async getH2H(team1Id, team2Id, years = 5) {
        return this.getH2HWithHalftime(team1Id, team2Id, years);
    }
    
    static async getTeamForm(teamId, competitionId, limit = 5) {
        return new Promise((resolve) => {
            db.all(`
                SELECT * FROM historical_matches 
                WHERE (home_team_id = ? OR away_team_id = ?) 
                AND competition_id = ?
                ORDER BY match_date DESC
                LIMIT ?
            `, [teamId, teamId, competitionId, limit], (err, rows) => {
                resolve(err ? [] : rows || []);
            });
        });
    }
    
    static async getTeamStats(teamId, competitionId, seasons = 2) {
        const currentYear = new Date().getFullYear();
        const startYear = currentYear - seasons;
        
        return new Promise((resolve) => {
            db.get(`
                SELECT 
                    COUNT(*) as total_matches,
                    SUM(CASE 
                        WHEN (home_team_id = ? AND match_result = 'home') 
                          OR (away_team_id = ? AND match_result = 'away') 
                        THEN 1 ELSE 0 END) as wins,
                    SUM(CASE WHEN match_result = 'draw' THEN 1 ELSE 0 END) as draws,
                    AVG(CASE WHEN home_team_id = ? THEN home_goals ELSE away_goals END) as avg_goals_for,
                    AVG(CASE WHEN home_team_id = ? THEN away_goals ELSE home_goals END) as avg_goals_against,
                    AVG(total_goals) as avg_total_goals,
                    
                    -- Statistiche primo tempo
                    AVG(CASE WHEN home_team_id = ? THEN COALESCE(home_goals_ht, 0) ELSE COALESCE(away_goals_ht, 0) END) as avg_goals_for_ht,
                    AVG(COALESCE(total_goals_ht, 0)) as avg_total_goals_ht,
                    SUM(CASE WHEN COALESCE(home_goals_ht, 0) > 0 AND COALESCE(away_goals_ht, 0) > 0 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as btts_ht_pct
                    
                FROM historical_matches 
                WHERE (home_team_id = ? OR away_team_id = ?) 
                AND competition_id = ? 
                AND season >= ?
            `, [teamId, teamId, teamId, teamId, teamId, teamId, teamId, competitionId, startYear], (err, row) => {
                resolve(err ? null : row);
            });
        });
    }
    
    static getMatchResult(score) {
        if (score.home > score.away) return 'home';
        if (score.away > score.home) return 'away';
        return 'draw';
    }
}

// ===========================================
// SMART CALCULATOR ESTESO
// ===========================================
// SmartCalculator AGGIORNATO - Versione completa con tutti gli Over/Under
class SmartCalculator {
    
    static async calculateProbabilities(homeId, awayId, competitionId) {
        console.log(`🧮 Calculating enhanced probabilities for ${homeId} vs ${awayId}`);
        
        // Ottieni H2H con dati primo tempo
        const h2h = await HistoricalManager.getH2HWithHalftime(homeId, awayId);
        
        if (h2h.length >= 3) {
            console.log(`✅ Using H2H enhanced analysis (${h2h.length} matches)`);
            return this.fromH2HEnhanced(h2h, homeId, awayId);
        }
        
        // Fallback con statistiche squadre (MIGLIORATO)
        console.log(`🔄 Using enhanced team stats fallback`);
        const [homeStats, awayStats, homeForm, awayForm] = await Promise.all([
            HistoricalManager.getTeamStats(homeId, competitionId),
            HistoricalManager.getTeamStats(awayId, competitionId),
            HistoricalManager.getTeamForm(homeId, competitionId, 5),
            HistoricalManager.getTeamForm(awayId, competitionId, 5)
        ]);
        
        if (homeForm?.length >= 3 && awayForm?.length >= 3) {
            console.log(`📊 Using recent form analysis (${homeForm.length} + ${awayForm.length} matches)`);
            return this.fromRecentForm(homeForm, awayForm, homeId, awayId);
        }
        
        // Fallback generico
        console.log(`⚠️ Using enhanced generic fallback`);
        return this.getEnhancedGenericProbabilities();
    }
    
    // NUOVO: Calcolo H2H completo con tutte le soglie Over/Under
    static fromH2HEnhanced(matches, currentHomeId, currentAwayId) {
        const total = matches.length;
        
        // Contatori risultato finale
        let ftHomeWins = 0, ftAwayWins = 0, ftDraws = 0;
        let ftTotalGoals = 0, ftBtts = 0;
        
        // Contatori primo tempo  
        let htHomeWins = 0, htAwayWins = 0, htDraws = 0;
        let htTotalGoals = 0, htBtts = 0;
        
        // NUOVO: Contatori secondo tempo (anche per risultati!)
        let shHomeWins = 0, shAwayWins = 0, shDraws = 0; // <-- AGGIUNTO
        let shTotalGoals = 0, shBtts = 0;
        
        // Contatori per tutte le soglie Over/Under
        const overCounters = {
            ft: { over05: 0, over15: 0, over25: 0, over35: 0 },
            ht: { over05: 0, over15: 0, over25: 0, over35: 0 },
            sh: { over05: 0, over15: 0, over25: 0, over35: 0 }
        };
        
        matches.forEach(match => {
            // === DATI FINALE ===
            const ftGoals = match.total_goals;
            ftTotalGoals += ftGoals;
            if (match.home_goals > 0 && match.away_goals > 0) ftBtts++;
            
            // Over/Under finale
            if (ftGoals > 0.5) overCounters.ft.over05++;
            if (ftGoals > 1.5) overCounters.ft.over15++;
            if (ftGoals > 2.5) overCounters.ft.over25++;
            if (ftGoals > 3.5) overCounters.ft.over35++;
            
            // === DATI PRIMO TEMPO ===
            const htGoalsHome = match.home_goals_ht || 0;
            const htGoalsAway = match.away_goals_ht || 0;
            const htGoals = htGoalsHome + htGoalsAway;
            
            htTotalGoals += htGoals;
            if (htGoalsHome > 0 && htGoalsAway > 0) htBtts++;
            
            // Over/Under primo tempo
            if (htGoals > 0.5) overCounters.ht.over05++;
            if (htGoals > 1.5) overCounters.ht.over15++;
            if (htGoals > 2.5) overCounters.ht.over25++;
            if (htGoals > 3.5) overCounters.ht.over35++;
            
            // === DATI SECONDO TEMPO ===
            const shGoalsHome = Math.max(0, match.home_goals - htGoalsHome);
            const shGoalsAway = Math.max(0, match.away_goals - htGoalsAway);
            const shGoals = shGoalsHome + shGoalsAway;
            
            shTotalGoals += shGoals;
            if (shGoalsHome > 0 && shGoalsAway > 0) shBtts++;
            
            // Over/Under secondo tempo
            if (shGoals > 0.5) overCounters.sh.over05++;
            if (shGoals > 1.5) overCounters.sh.over15++;
            if (shGoals > 2.5) overCounters.sh.over25++;
            if (shGoals > 3.5) overCounters.sh.over35++;
            
            // === RISULTATI ===
            // Risultati finale
            if (match.match_result === 'draw') {
                ftDraws++;
            } else if (
                (match.match_result === 'home' && match.home_team_id === currentHomeId) ||
                (match.match_result === 'away' && match.away_team_id === currentHomeId)
            ) {
                ftHomeWins++;
            } else {
                ftAwayWins++;
            }
            
            // Risultati primo tempo
            const htResult = this.getMatchResult({ home: htGoalsHome, away: htGoalsAway });
            if (htResult === 'draw') {
                htDraws++;
            } else if (
                (htResult === 'home' && match.home_team_id === currentHomeId) ||
                (htResult === 'away' && match.away_team_id === currentHomeId)
            ) {
                htHomeWins++;
            } else {
                htAwayWins++;
            }
            
            // NUOVO: Risultati secondo tempo 
            const shResult = this.getMatchResult({ home: shGoalsHome, away: shGoalsAway });
            if (shResult === 'draw') {
                shDraws++;
            } else if (
                (shResult === 'home' && match.home_team_id === currentHomeId) ||
                (shResult === 'away' && match.away_team_id === currentHomeId)
            ) {
                shHomeWins++;
            } else {
                shAwayWins++;
            }
        });
        
        // Calcola probabilità con vantaggio casa
        let ftHomeProb = (ftHomeWins / total) * 1.15;
        let ftDrawProb = ftDraws / total;
        let ftAwayProb = ftAwayWins / total;
        const ftSum = ftHomeProb + ftDrawProb + ftAwayProb;
        
        let htHomeProb = (htHomeWins / total) * 1.08;
        let htDrawProb = htDraws / total;
        let htAwayProb = htAwayWins / total;
        const htSum = htHomeProb + htDrawProb + htAwayProb;
        
        // NUOVO: Calcola probabilità secondo tempo (vantaggio casa minimo)
        let shHomeProb = (shHomeWins / total) * 1.05; // Vantaggio casa minimo nel 2T
        let shDrawProb = shDraws / total;
        let shAwayProb = shAwayWins / total;
        const shSum = shHomeProb + shDrawProb + shAwayProb;
        
        return {
            // FORMATO COMPLETO CON TUTTE LE SOGLIE
            fullTime: {
                '1X2': {
                    home: ((ftHomeProb / ftSum) * 100).toFixed(1),
                    draw: ((ftDrawProb / ftSum) * 100).toFixed(1),
                    away: ((ftAwayProb / ftSum) * 100).toFixed(1)
                },
                goals: {
                    expectedTotal: (ftTotalGoals / total).toFixed(2),
                    over05: ((overCounters.ft.over05 / total) * 100).toFixed(1),
                    under05: (((total - overCounters.ft.over05) / total) * 100).toFixed(1),
                    over15: ((overCounters.ft.over15 / total) * 100).toFixed(1),
                    under15: (((total - overCounters.ft.over15) / total) * 100).toFixed(1),
                    over25: ((overCounters.ft.over25 / total) * 100).toFixed(1),
                    under25: (((total - overCounters.ft.over25) / total) * 100).toFixed(1),
                    over35: ((overCounters.ft.over35 / total) * 100).toFixed(1),
                    under35: (((total - overCounters.ft.over35) / total) * 100).toFixed(1)
                },
                btts: {
                    btts_yes: ((ftBtts / total) * 100).toFixed(1),
                    btts_no: (((total - ftBtts) / total) * 100).toFixed(1)
                }
            },
            halfTime: {
                '1X2': {
                    home: ((htHomeProb / htSum) * 100).toFixed(1),
                    draw: ((htDrawProb / htSum) * 100).toFixed(1),
                    away: ((htAwayProb / htSum) * 100).toFixed(1)
                },
                goals: {
                    expectedTotal: (htTotalGoals / total).toFixed(2),
                    over05: ((overCounters.ht.over05 / total) * 100).toFixed(1),
                    under05: (((total - overCounters.ht.over05) / total) * 100).toFixed(1),
                    over15: ((overCounters.ht.over15 / total) * 100).toFixed(1),
                    under15: (((total - overCounters.ht.over15) / total) * 100).toFixed(1),
                    over25: ((overCounters.ht.over25 / total) * 100).toFixed(1),
                    under25: (((total - overCounters.ht.over25) / total) * 100).toFixed(1),
                    over35: ((overCounters.ht.over35 / total) * 100).toFixed(1),
                    under35: (((total - overCounters.ht.over35) / total) * 100).toFixed(1)
                },
                btts: {
                    btts_yes: ((htBtts / total) * 100).toFixed(1),
                    btts_no: (((total - htBtts) / total) * 100).toFixed(1)
                }
            },
            // NUOVO: Aggiunto 1X2 per secondo tempo
            secondHalf: {
                '1X2': {
                    home: ((shHomeProb / shSum) * 100).toFixed(1),
                    draw: ((shDrawProb / shSum) * 100).toFixed(1),
                    away: ((shAwayProb / shSum) * 100).toFixed(1)
                },
                goals: {
                    expectedTotal: (shTotalGoals / total).toFixed(2),
                    over05: ((overCounters.sh.over05 / total) * 100).toFixed(1),
                    under05: (((total - overCounters.sh.over05) / total) * 100).toFixed(1),
                    over15: ((overCounters.sh.over15 / total) * 100).toFixed(1),
                    under15: (((total - overCounters.sh.over15) / total) * 100).toFixed(1),
                    over25: ((overCounters.sh.over25 / total) * 100).toFixed(1),
                    under25: (((total - overCounters.sh.over25) / total) * 100).toFixed(1),
                    over35: ((overCounters.sh.over35 / total) * 100).toFixed(1),
                    under35: (((total - overCounters.sh.over35) / total) * 100).toFixed(1)
                },
                btts: {
                    btts_yes: ((shBtts / total) * 100).toFixed(1),
                    btts_no: (((total - shBtts) / total) * 100).toFixed(1)
                }
            },
            h2hData: {
                matches: matches.map(m => ({
                    date: m.match_date,
                    homeTeamName: m.home_team_name,
                    awayTeamName: m.away_team_name,
                    scoreHT: `${m.home_goals_ht || 0}-${m.away_goals_ht || 0}`,
                    scoreFT: `${m.home_goals}-${m.away_goals}`,
                    totalGoalsHT: m.total_goals_ht || 0,
                    totalGoalsFT: m.total_goals,
                    totalGoals2H: Math.max(0, m.total_goals - (m.total_goals_ht || 0)),
                    isBTTS_HT: (m.home_goals_ht || 0) > 0 && (m.away_goals_ht || 0) > 0,
                    isBTTS_FT: m.home_goals > 0 && m.away_goals > 0,
                    isBTTS_2H: (m.home_goals - (m.home_goals_ht || 0)) > 0 && (m.away_goals - (m.away_goals_ht || 0)) > 0
                })).slice(0, 8),
                summary: {
                    totalMatches: total,
                    avgGoalsHT: (htTotalGoals / total).toFixed(2),
                    avgGoalsFT: (ftTotalGoals / total).toFixed(2),
                    avgGoals2H: (shTotalGoals / total).toFixed(2),
                    // Aggiungi tutte le percentuali
                    over05HT_pct: ((overCounters.ht.over05 / total) * 100).toFixed(1),
                    over15HT_pct: ((overCounters.ht.over15 / total) * 100).toFixed(1),
                    over25HT_pct: ((overCounters.ht.over25 / total) * 100).toFixed(1),
                    over35HT_pct: ((overCounters.ht.over35 / total) * 100).toFixed(1),
                    over05FT_pct: ((overCounters.ft.over05 / total) * 100).toFixed(1),
                    over15FT_pct: ((overCounters.ft.over15 / total) * 100).toFixed(1),
                    over25FT_pct: ((overCounters.ft.over25 / total) * 100).toFixed(1),
                    over35FT_pct: ((overCounters.ft.over35 / total) * 100).toFixed(1),
                    over052H_pct: ((overCounters.sh.over05 / total) * 100).toFixed(1),
                    over152H_pct: ((overCounters.sh.over15 / total) * 100).toFixed(1),
                    over252H_pct: ((overCounters.sh.over25 / total) * 100).toFixed(1),
                    over352H_pct: ((overCounters.sh.over35 / total) * 100).toFixed(1),
                    bttsHT_pct: ((htBtts / total) * 100).toFixed(1),
                    bttsFT_pct: ((ftBtts / total) * 100).toFixed(1),
                    btts2H_pct: ((shBtts / total) * 100).toFixed(1),
                    homeWinsFT: ftHomeWins,
                    awayWinsFT: ftAwayWins,
                    drawsFT: ftDraws,
                    homeWinsHT: htHomeWins,
                    awayWinsHT: htAwayWins,
                    drawsHT: htDraws,
                    // NUOVO: Aggiungi risultati secondo tempo
                    homeWins2H: shHomeWins,
                    awayWins2H: shAwayWins,
                    draws2H: shDraws
                }
            },
            confidence: Math.min(90, 55 + (total * 4)),
            dataSource: 'h2h_enhanced_database'
        };
    }
    
    // NUOVO: Fallback basato su forma recente (ultimi 5 match di ogni squadra)
    static fromRecentForm(homeMatches, awayMatches, currentHomeId, currentAwayId) {
        console.log(`📊 Analyzing recent form: Home(${homeMatches.length}) vs Away(${awayMatches.length})`);
        
        // Analizza forma casa
        const homeAnalysis = this.analyzeTeamMatches(homeMatches, currentHomeId, true);
        const awayAnalysis = this.analyzeTeamMatches(awayMatches, currentAwayId, false);
        
        // Combina le analisi per prevedere il match
        const expectedHomeGoals = homeAnalysis.avgGoalsFor * 1.1; // Vantaggio casa
        const expectedAwayGoals = awayAnalysis.avgGoalsFor * 0.95;
        const expectedTotal = expectedHomeGoals + expectedAwayGoals;
        
        // Calcola probabilità risultato
        const homeWinProb = Math.max(0.15, homeAnalysis.winRate * 1.2);
        const awayWinProb = Math.max(0.15, awayAnalysis.winRate * 0.9);
        const drawProb = Math.max(0.2, 0.35 - (homeWinProb + awayWinProb) * 0.5);
        
        const total1X2 = homeWinProb + drawProb + awayWinProb;
        
        return {
            fullTime: {
                '1X2': {
                    home: ((homeWinProb / total1X2) * 100).toFixed(1),
                    draw: ((drawProb / total1X2) * 100).toFixed(1),
                    away: ((awayWinProb / total1X2) * 100).toFixed(1)
                },
                goals: this.calculateOverUnderFromExpected(expectedTotal, 'fullTime'),
                btts: {
                    btts_yes: this.calculateBTTSProbability(homeAnalysis, awayAnalysis).toFixed(1),
                    btts_no: (100 - this.calculateBTTSProbability(homeAnalysis, awayAnalysis)).toFixed(1)
                }
            },
            halfTime: {
                '1X2': {
                    home: (((homeWinProb * 0.7) / (homeWinProb * 0.7 + drawProb * 1.3 + awayWinProb * 0.7)) * 100).toFixed(1),
                    draw: (((drawProb * 1.3) / (homeWinProb * 0.7 + drawProb * 1.3 + awayWinProb * 0.7)) * 100).toFixed(1),
                    away: (((awayWinProb * 0.7) / (homeWinProb * 0.7 + drawProb * 1.3 + awayWinProb * 0.7)) * 100).toFixed(1)
                },
                goals: this.calculateOverUnderFromExpected(expectedTotal * 0.45, 'halfTime'),
                btts: {
                    btts_yes: (this.calculateBTTSProbability(homeAnalysis, awayAnalysis) * 0.6).toFixed(1),
                    btts_no: (100 - this.calculateBTTSProbability(homeAnalysis, awayAnalysis) * 0.6).toFixed(1)
                }
            },
            // AGGIUNTO: Probabilità 1X2 per secondo tempo
            secondHalf: {
                '1X2': {
                    home: (((homeWinProb * 0.8) / (homeWinProb * 0.8 + drawProb * 1.1 + awayWinProb * 0.85)) * 100).toFixed(1),
                    draw: (((drawProb * 1.1) / (homeWinProb * 0.8 + drawProb * 1.1 + awayWinProb * 0.85)) * 100).toFixed(1),
                    away: (((awayWinProb * 0.85) / (homeWinProb * 0.8 + drawProb * 1.1 + awayWinProb * 0.85)) * 100).toFixed(1)
                },
                goals: this.calculateOverUnderFromExpected(expectedTotal * 0.55, 'secondHalf'),
                btts: {
                    btts_yes: (this.calculateBTTSProbability(homeAnalysis, awayAnalysis) * 0.7).toFixed(1),
                    btts_no: (100 - this.calculateBTTSProbability(homeAnalysis, awayAnalysis) * 0.7).toFixed(1)
                }
            },
            h2hData: null,
            confidence: 65,
            dataSource: 'recent_form_analysis',
            formBreakdown: {
                home: {
                    matches: homeMatches.length,
                    winRate: (homeAnalysis.winRate * 100).toFixed(1) + '%',
                    avgGoals: homeAnalysis.avgGoalsFor.toFixed(2),
                    form: homeAnalysis.formString
                },
                away: {
                    matches: awayMatches.length,
                    winRate: (awayAnalysis.winRate * 100).toFixed(1) + '%',
                    avgGoals: awayAnalysis.avgGoalsFor.toFixed(2),
                    form: awayAnalysis.formString
                }
            }
        };
    }
    
    // Helper per analizzare partite di una squadra
    static analyzeTeamMatches(matches, teamId, isHome) {
        let wins = 0, draws = 0, losses = 0;
        let goalsFor = 0, goalsAgainst = 0, bttsCount = 0;
        const formChars = [];
        
        matches.forEach(match => {
            const isHomeInMatch = match.home_team_id === teamId;
            const ourGoals = isHomeInMatch ? match.home_goals : match.away_goals;
            const theirGoals = isHomeInMatch ? match.away_goals : match.home_goals;
            
            goalsFor += ourGoals;
            goalsAgainst += theirGoals;
            
            if (ourGoals > 0 && theirGoals > 0) bttsCount++;
            
            if (ourGoals > theirGoals) {
                wins++;
                formChars.push('W');
            } else if (ourGoals < theirGoals) {
                losses++;
                formChars.push('L');
            } else {
                draws++;
                formChars.push('D');
            }
        });
        
        return {
            winRate: matches.length > 0 ? wins / matches.length : 0,
            drawRate: matches.length > 0 ? draws / matches.length : 0,
            avgGoalsFor: matches.length > 0 ? goalsFor / matches.length : 0,
            avgGoalsAgainst: matches.length > 0 ? goalsAgainst / matches.length : 0,
            bttsRate: matches.length > 0 ? bttsCount / matches.length : 0,
            formString: formChars.join(''),
            totalMatches: matches.length
        };
    }
    
    // Helper per calcolare Over/Under da gol attesi
    static calculateOverUnderFromExpected(expectedGoals, period) {
        const thresholds = [0.5, 1.5, 2.5, 3.5];
        const result = { expectedTotal: expectedGoals.toFixed(2) };
        
        thresholds.forEach(threshold => {
            // Usa distribuzione di Poisson per calcolare probabilità
            const overProb = this.poissonOver(expectedGoals, threshold);
            result[`over${threshold.toString().replace('.', '')}`] = (overProb * 100).toFixed(1);
            result[`under${threshold.toString().replace('.', '')}`] = ((1 - overProb) * 100).toFixed(1);
        });
        
        return result;
    }
    
    // Helper per BTTS da analisi squadre
    static calculateBTTSProbability(homeAnalysis, awayAnalysis) {
        // Probabilità che la casa segni * probabilità che l'away segni
        const homeScoringProb = Math.min(0.95, Math.max(0.3, homeAnalysis.avgGoalsFor / 2.5));
        const awayScoringProb = Math.min(0.95, Math.max(0.25, awayAnalysis.avgGoalsFor / 2.5));
        
        return homeScoringProb * awayScoringProb * 100;
    }
    
    // Approssimazione di Poisson per Over/Under
    static poissonOver(lambda, threshold) {
        if (lambda <= 0) return 0;
        
        // Per semplicità, usa approssimazione normale per lambda > 10
        if (lambda > 10) {
            const mean = lambda;
            const std = Math.sqrt(lambda);
            return 1 - this.normalCDF((threshold + 0.5 - mean) / std);
        }
        
        // Calcolo esatto per lambda piccoli
        let cumulative = 0;
        let term = Math.exp(-lambda);
        
        for (let k = 0; k <= threshold; k++) {
            cumulative += term;
            term = term * lambda / (k + 1);
        }
        
        return Math.max(0, Math.min(1, 1 - cumulative));
    }
    
    // Approssimazione CDF normale
    static normalCDF(x) {
        return 0.5 * (1 + this.erf(x / Math.sqrt(2)));
    }
    
    // Approssimazione funzione errore
    static erf(x) {
        const a1 = 0.254829592;
        const a2 = -0.284496736;
        const a3 = 1.421413741;
        const a4 = -1.453152027;
        const a5 = 1.061405429;
        const p = 0.3275911;
        
        const sign = x >= 0 ? 1 : -1;
        x = Math.abs(x);
        
        const t = 1.0 / (1.0 + p * x);
        const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
        
        return sign * y;
    }
    
    // Fallback generico MIGLIORATO
    static getEnhancedGenericProbabilities() {
        return {
            fullTime: {
                '1X2': { home: '46.0', draw: '26.0', away: '28.0' },
                goals: {
                    expectedTotal: '2.65',
                    over05: '88.0', under05: '12.0',
                    over15: '72.0', under15: '28.0',
                    over25: '56.0', under25: '44.0',
                    over35: '32.0', under35: '68.0'
                },
                btts: { btts_yes: '52.0', btts_no: '48.0' }
            },
            halfTime: {
                '1X2': { home: '35.0', draw: '42.0', away: '23.0' },
                goals: {
                    expectedTotal: '1.20',
                    over05: '65.0', under05: '35.0',
                    over15: '28.0', under15: '72.0',
                    over25: '8.0', under25: '92.0',
                    over35: '2.0', under35: '98.0'
                },
                btts: { btts_yes: '32.0', btts_no: '68.0' }
            },
            // AGGIUNTO: Probabilità complete per secondo tempo
            secondHalf: {
                '1X2': { home: '38.0', draw: '35.0', away: '27.0' },
                goals: {
                    expectedTotal: '1.45',
                    over05: '72.0', under05: '28.0',
                    over15: '42.0', under15: '58.0',
                    over25: '18.0', under25: '82.0',
                    over35: '6.0', under35: '94.0'
                },
                btts: { btts_yes: '38.0', btts_no: '62.0' }
            },
            h2hData: null,
            confidence: 45,
            dataSource: 'enhanced_generic_fallback'
        };
    }
    
    static getMatchResult(score) {
        if (score.home > score.away) return 'home';
        if (score.away > score.home) return 'away';
        return 'draw';
    }
}

// ===========================================
// API ENDPOINTS AGGIORNATI
// ===========================================

// Endpoint principale (invariato)
app.get('/api/matches/:leagueId', async (req, res) => {
    const start = Date.now();
    
    try {
        const { leagueId } = req.params;
        const { season } = req.query;
        
        console.log(`🚀 Processing ${leagueId} season ${season || 'current'}`);
        
        const matches = await MainAPI.getSmartMatches(leagueId, season ? parseInt(season) : null);
        
        if (!matches?.length) {
            return res.json({ success: true, matches: [], message: 'No matches found' });
        }

        const competitionId = API_CONFIG.competitions[leagueId];
        const now = new Date();

        const enriched = await Promise.all(
            matches.map(async (match) => {
                const matchDate = new Date(match.utcDate);
                const isFuture = matchDate > now;
                const isFinished = match.status === 'FINISHED';
                const canAnalyze = isFuture;

                let analysis = null;
                if (canAnalyze) {
                    try {
                        console.log(`[ANALYZING] ${match.homeTeam.name} vs ${match.awayTeam.name}`);
                        
                        const [probabilities, homeForm, awayForm] = await Promise.all([
                            SmartCalculator.calculateProbabilities(match.homeTeam.id, match.awayTeam.id, competitionId),
                            MainAPI.getTeamForm(match.homeTeam.id, competitionId),
                            MainAPI.getTeamForm(match.awayTeam.id, competitionId)
                        ]);
                        
                        analysis = {
                            probabilities,
                            homeForm,
                            awayForm,
                            confidence: probabilities.confidence,
                            dataSource: probabilities.dataSource
                        };
                        
                    } catch (error) {
                        console.error(`❌ Analysis error: ${error.message}`);
                    }
                }

                return {
                    ...match,
                    canAnalyze,
                    isFuture,
                    isFinished,
                    hasResult: match.score?.fullTime?.home !== null,
                    analysis,
                    displayStatus: isFinished ? 'Terminata' : isFuture ? 'Programmata' : match.status,
                    timeInfo: getTimeInfo(match)
                };
            })
        );

        const time = Date.now() - start;

        res.json({
            success: true,
            matches: enriched,
            metadata: {
                league: leagueId,
                season: season || 'current',
                totalMatches: enriched.length,
                analyzableMatches: enriched.filter(m => m.canAnalyze).length,
                finishedMatches: enriched.filter(m => m.isFinished).length,
                upcomingMatches: enriched.filter(m => m.isFuture).length,
                withAnalysis: enriched.filter(m => m.analysis).length,
                processingTime: `${time}ms`,
                strategy: 'smart_recent_and_upcoming',
                halftimeSupport: true // NUOVO FLAG
            }
        });
        
    } catch (error) {
        console.error('❌ API Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// NUOVO ENDPOINT per analisi estesa
app.get('/api/extended-analysis/:homeId/:awayId', async (req, res) => {
    try {
        const { homeId, awayId } = req.params;
        const { league = 'SA' } = req.query;
        const competitionId = API_CONFIG.competitions[league];
        
        const analysis = await SmartCalculator.calculateProbabilities(
            parseInt(homeId), 
            parseInt(awayId), 
            competitionId
        );
        
        res.json({
            success: true,
            homeTeamId: homeId,
            awayTeamId: awayId,
            league,
            analysis,
            breakdown: {
                fullTime: 'Risultato finale (90 minuti)',
                halfTime: 'Risultato primo tempo (45 minuti)', 
                secondHalf: 'Solo secondo tempo (45-90 min)'
            },
            isExtendedAnalysis: !!(analysis.fullTime || analysis.halfTime)
        });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Resto del codice invariato (MainAPI, endpoints, etc...)
class MainAPI {
    static async getSmartMatches(leagueId, season = null) {
        if (!season) season = new Date().getFullYear();
        
        const cacheKey = `matches_${leagueId}_${season}`;
        const cached = await cache.get(cacheKey);
        if (cached) return cached;

        const competitionId = API_CONFIG.competitions[leagueId];
        if (!competitionId) throw new Error(`Unknown league: ${leagueId}`);

        try {
            const response = await rateLimitedCall(async () => {
                return await axios.get(
                    `${API_CONFIG.baseUrl}/competitions/${competitionId}/matches`,
                    {
                        headers: API_CONFIG.headers,
                        params: { season },
                        timeout: 15000
                    }
                );
            });

            const allMatches = response.data.matches || [];
            console.log(`📊 Retrieved ${allMatches.length} matches for ${leagueId} ${season}`);
            
            const now = new Date();
            const finished = allMatches
                .filter(m => m.status === 'FINISHED' && new Date(m.utcDate) <= now)
                .sort((a, b) => new Date(b.utcDate) - new Date(a.utcDate))
                .slice(0, 15);
                
            const upcoming = allMatches
                .filter(m => ['SCHEDULED', 'TIMED'].includes(m.status) && new Date(m.utcDate) > now)
                .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate))
                .slice(0, 15);
            
            const smartSelection = [...finished, ...upcoming];
            console.log(`🎯 Smart selection: ${finished.length} finished + ${upcoming.length} upcoming`);
            
            await cache.set(cacheKey, smartSelection, 20);
            return smartSelection;

        } catch (error) {
            console.error(`❌ Error fetching matches:`, error.message);
            throw error;
        }
    }
    
    static async getTeamForm(teamId, competitionId) {
        const matches = await HistoricalManager.getTeamForm(teamId, competitionId, 5);
        
        let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0;
        const form = [];
        
        matches.forEach(match => {
            const isHome = match.home_team_id === teamId;
            const ourGoals = isHome ? match.home_goals : match.away_goals;
            const theirGoals = isHome ? match.away_goals : match.home_goals;
            
            goalsFor += ourGoals;
            goalsAgainst += theirGoals;
            
            if (ourGoals > theirGoals) {
                wins++;
                form.push('W');
            } else if (ourGoals < theirGoals) {
                losses++;
                form.push('L');
            } else {
                draws++;
                form.push('D');
            }
        });
        
        return {
            matches: matches.length,
            wins, draws, losses,
            goalsFor, goalsAgainst,
            formString: form.join(''),
            points: wins * 3 + draws,
            avgGoalsFor: matches.length > 0 ? (goalsFor / matches.length).toFixed(1) : '0.0',
            recentMatches: matches.slice(0, 3).map(m => ({
                date: m.match_date.split('T')[0],
                opponent: m.home_team_id === teamId ? m.away_team_name : m.home_team_name,
                result: `${m.home_team_id === teamId ? m.home_goals : m.away_goals}-${m.home_team_id === teamId ? m.away_goals : m.home_goals}`,
                wasHome: m.home_team_id === teamId
            }))
        };
    }
}

// ===========================================
// INIZIALIZZAZIONE AUTOMATICA AGGIORNATA
// ===========================================
class AutoInitializer {
    
    static async checkAndInitialize() {
        console.log('🔍 Checking database initialization status...');
        
        const hasData = await this.checkExistingData();
        
        if (hasData) {
            console.log('✅ Historical data already exists');
            // Controlla se abbiamo dati primo tempo
            await this.checkHalftimeData();
            return;
        }
        
        console.log('📥 No historical data found, starting automatic population...');
        console.log('⏱️  This will take approximately 15-20 minutes but only happens once');
        
        await this.populateAllLeagues();
    }
    
    static async checkExistingData() {
        return new Promise((resolve) => {
            db.get(`
                SELECT COUNT(*) as count 
                FROM historical_matches 
                WHERE season >= ?
            `, [new Date().getFullYear() - 4], (err, row) => {
                if (err) {
                    console.log('Database check error:', err.message);
                    resolve(false);
                } else {
                    const hasEnoughData = (row?.count || 0) > 1000;
                    console.log(`📊 Found ${row?.count || 0} historical matches`);
                    resolve(hasEnoughData);
                }
            });
        });
    }
    
    static async checkHalftimeData() {
        return new Promise((resolve) => {
            db.get(`
                SELECT 
                    COUNT(*) as total,
                    COUNT(home_goals_ht) as with_ht,
                    ROUND(AVG(COALESCE(total_goals_ht, 0)), 2) as avg_ht_goals
                FROM historical_matches 
                WHERE season >= ?
            `, [new Date().getFullYear() - 2], (err, row) => {
                if (err) {
                    console.log('HT check error:', err.message);
                    resolve();
                    return;
                }
                
                const total = row?.total || 0;
                const withHT = row?.with_ht || 0;
                const coverage = total > 0 ? ((withHT / total) * 100).toFixed(1) : '0.0';
                
                console.log(`📊 Halftime Data Status:`);
                console.log(`   Total matches: ${total}`);
                console.log(`   With HT data: ${withHT}`);
                console.log(`   Coverage: ${coverage}%`);
                console.log(`   Avg HT goals: ${row?.avg_ht_goals || '0.00'}`);
                
                if (withHT < total * 0.8) {
                    console.log('⚠️  Low halftime data coverage, but this is normal');
                    console.log('   New matches will automatically include HT data');
                }
                
                resolve();
            });
        });
    }
    
    static async populateAllLeagues() {
        const leagues = Object.keys(API_CONFIG.competitions);
        const currentYear = new Date().getFullYear();
        const startYear = currentYear - 4;
        
        console.log(`🏆 Populating ${leagues.length} leagues from ${startYear} to ${currentYear}`);
        
        for (const leagueId of leagues) {
            try {
                console.log(`\n=== Processing ${leagueId} ===`);
                await this.populateLeague(leagueId, startYear, currentYear);
                console.log(`✅ Completed ${leagueId}`);
                
                await new Promise(resolve => setTimeout(resolve, 2000));
                
            } catch (error) {
                console.error(`❌ Failed to populate ${leagueId}:`, error.message);
            }
        }
        
        console.log('\n🎉 Database initialization completed with halftime support!');
        console.log('📊 Server is now ready with full historical data including first half statistics');
    }
    
    static async populateLeague(leagueId, startYear, endYear) {
        const competitionId = API_CONFIG.competitions[leagueId];
        if (!competitionId) {
            throw new Error(`Unknown league: ${leagueId}`);
        }
        
        for (let season = startYear; season <= endYear; season++) {
            try {
                console.log(`  📅 Fetching ${leagueId} season ${season}...`);
                
                const response = await rateLimitedCall(async () => {
                    return await axios.get(
                        `${API_CONFIG.baseUrl}/competitions/${competitionId}/matches`,
                        {
                            headers: API_CONFIG.headers,
                            params: { 
                                season,
                                status: 'FINISHED' 
                            },
                            timeout: 20000
                        }
                    );
                });
                
                const matches = response.data.matches || [];
                console.log(`    📋 Found ${matches.length} finished matches`);
                
                let saved = 0;
                for (const match of matches) {
                    if (await HistoricalManager.saveMatch(match, season, competitionId)) {
                        saved++;
                    }
                }
                
                console.log(`    💾 Saved ${saved} matches with HT data to database`);
                
            } catch (error) {
                console.error(`    ❌ Error season ${season}:`, error.message);
                
                if (error.response?.status === 429) {
                    console.log('    ⏳ Rate limited, waiting 30 seconds...');
                    await new Promise(resolve => setTimeout(resolve, 30000));
                }
            }
        }
    }
}

// ===========================================
// ALTRI ENDPOINTS
// ===========================================

// Test intelligente aggiornato
app.get('/api/test/:homeId/:awayId', async (req, res) => {
    try {
        const { homeId, awayId } = req.params;
        const { league = 'SA' } = req.query;
        const competitionId = API_CONFIG.competitions[league];
        
        const [probabilities, homeForm, awayForm, h2h] = await Promise.all([
            SmartCalculator.calculateProbabilities(parseInt(homeId), parseInt(awayId), competitionId),
            MainAPI.getTeamForm(parseInt(homeId), competitionId),
            MainAPI.getTeamForm(parseInt(awayId), competitionId),
            HistoricalManager.getH2HWithHalftime(parseInt(homeId), parseInt(awayId))
        ]);
        
        res.json({
            success: true,
            probabilities,
            homeForm: {
                teamId: homeId,
                formString: homeForm.formString,
                points: homeForm.points,
                avgGoals: homeForm.avgGoalsFor,
                recentMatches: homeForm.recentMatches
            },
            awayForm: {
                teamId: awayId,
                formString: awayForm.formString,
                points: awayForm.points,
                avgGoals: awayForm.avgGoalsFor,
                recentMatches: awayForm.recentMatches
            },
            h2hSummary: {
                totalMatches: h2h.length,
                dataSource: probabilities.dataSource,
                confidence: probabilities.confidence,
                hasHalftimeData: h2h.some(m => m.home_goals_ht !== null)
            }
        });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Health check aggiornato
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK',
        features: [
            'Historical Database (4+ years)',
            'Smart H2H Calculations', 
            'Team Form Analysis',
            'Intelligent Fallbacks',
            'Smart Match Selection',
            '🆕 First Half Statistics (45 min)', // NUOVO
            '🆕 Second Half Analysis (45-90 min)', // NUOVO
            '🆕 Multi-Period Probabilities' // NUOVO
        ],
        apis: {
            footballData: process.env.FOOTBALL_DATA_API_KEY ? 'Configured' : 'Missing'
        },
        halftimeSupport: true // NUOVO FLAG
    });
});

// Statistiche database aggiornate
app.get('/api/db-stats', (req, res) => {
    const queries = [
        'SELECT COUNT(*) as total FROM historical_matches',
        'SELECT COUNT(DISTINCT home_team_id) as teams FROM historical_matches',
        'SELECT season, COUNT(*) as matches FROM historical_matches GROUP BY season ORDER BY season DESC LIMIT 5',
        // NUOVE QUERY per statistiche primo tempo
        `SELECT 
            COUNT(*) as total_matches,
            COUNT(home_goals_ht) as with_halftime_data,
            ROUND(AVG(COALESCE(total_goals_ht, 0)), 2) as avg_ht_goals,
            ROUND(AVG(total_goals), 2) as avg_ft_goals,
            ROUND(
                COUNT(CASE WHEN COALESCE(home_goals_ht, 0) > 0 AND COALESCE(away_goals_ht, 0) > 0 THEN 1 END) * 100.0 / 
                COUNT(CASE WHEN home_goals_ht IS NOT NULL THEN 1 END), 1
            ) as btts_ht_percentage
        FROM historical_matches`
    ];
    
    Promise.all(queries.map(q => 
        new Promise((resolve) => {
            if (q.includes('GROUP BY')) {
                db.all(q, (err, rows) => resolve(rows || []));
            } else {
                db.get(q, (err, row) => resolve(row || {}));
            }
        })
    )).then(([total, teams, seasons, halftimeStats]) => {
        res.json({
            success: true,
            database: {
                totalMatches: total.total || 0,
                totalTeams: teams.teams || 0,
                seasonBreakdown: seasons,
                // NUOVE STATISTICHE primo tempo
                halftimeData: {
                    totalMatches: halftimeStats.total_matches || 0,
                    withHalftimeData: halftimeStats.with_halftime_data || 0,
                    coverage: halftimeStats.total_matches > 0 ? 
                        `${((halftimeStats.with_halftime_data / halftimeStats.total_matches) * 100).toFixed(1)}%` : '0%',
                    avgHalftimeGoals: halftimeStats.avg_ht_goals || '0.00',
                    avgFulltimeGoals: halftimeStats.avg_ft_goals || '0.00',
                    bttsHalftimePercentage: halftimeStats.btts_ht_percentage || '0.0',
                    goalRatio: halftimeStats.avg_ft_goals > 0 ? 
                        (halftimeStats.avg_ht_goals / halftimeStats.avg_ft_goals).toFixed(2) : '0.00'
                }
            },
            halftimeSupport: true
        });
    });
});

// Helpers
function getTimeInfo(match) {
    const matchDate = new Date(match.utcDate);
    const now = new Date();
    const diff = Math.floor((matchDate - now) / (24 * 60 * 60 * 1000));
    
    if (match.status === 'FINISHED') return 'Terminata';
    if (diff < 0) return 'Passata';
    if (diff === 0) return 'Oggi';
    if (diff === 1) return 'Domani';
    if (diff <= 7) return `Tra ${diff} giorni`;
    return matchDate.toLocaleDateString('it-IT');
}

// Cleanup
setInterval(() => {
    db.run(`DELETE FROM cache_simple WHERE expires_at < datetime('now')`);
}, 3600000);

const path = require('path');

if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'client', 'dist')));

    app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'client', 'dist', 'index.html'));
    });
}

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Football API Server running on port ${PORT}`);
    console.log('📊 Features:');
    console.log('  - Historical database with real match data');
    console.log('  - Intelligent H2H calculations from local DB');
    console.log('  - Team form analysis (last 5 matches)');
    console.log('  - Smart fallback calculations');
    console.log('  - Optimized match selection strategy');
    console.log('  🆕 - First half statistics (45 min analysis)');
    console.log('  🆕 - Second half analysis (45-90 min)');
    console.log('  🆕 - Multi-period probability calculations');
    console.log('🌐 Endpoints:');
    console.log('  - GET /api/matches/:leagueId (enhanced with HT support)');
    console.log('  - GET /api/extended-analysis/:homeId/:awayId (NEW - multi-period analysis)');
    console.log('  - GET /api/db-stats (enhanced with HT statistics)');
    console.log('  - GET /api/health (updated features list)');
    console.log('');
    console.log('🎯 All new matches will automatically include first half data');
    console.log('📈 Enhanced H2H analysis with multi-period statistics');
});

// Avvia l'inizializzazione automatica aggiornata
setTimeout(() => {
    AutoInitializer.checkAndInitialize()
        .then(() => console.log('✅ Auto-initialization check completed with halftime support'))
        .catch(err => console.error('❌ Auto-initialization failed:', err));
}, 3000);

process.on('SIGINT', () => {
    console.log('Shutting down server...');
    db.close(() => {
        console.log('Database closed');
        process.exit(0);
    });
});

module.exports = app;