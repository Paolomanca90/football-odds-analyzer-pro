// server-complete-final.js - Versione finale completa
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

// Rate limiting migliorato
let lastApiCall = 0;
const MIN_INTERVAL = 6100; // 6.1 secondi per sicurezza

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
// DATABASE SETUP
// ===========================================
const db = new sqlite3.Database('./football_final.db');

db.serialize(() => {
    // Tabella partite storiche
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(id) ON CONFLICT REPLACE
    )`);
    
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
    
    console.log('📦 Database initialized');
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
// INIZIALIZZAZIONE AUTOMATICA
// ===========================================
class AutoInitializer {
    
    static async checkAndInitialize() {
        console.log('Checking database initialization status...');
        
        // Controlla se abbiamo già dati storici
        const hasData = await this.checkExistingData();
        
        if (hasData) {
            console.log('Historical data already exists, skipping initialization');
            return;
        }
        
        console.log('No historical data found, starting automatic population...');
        console.log('This will take approximately 15-20 minutes but only happens once');
        
        // Avvia popolazione di tutti i campionati
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
                    const hasEnoughData = (row?.count || 0) > 1000; // Soglia minima
                    console.log(`Found ${row?.count || 0} historical matches`);
                    resolve(hasEnoughData);
                }
            });
        });
    }
    
    static async populateAllLeagues() {
        const leagues = Object.keys(API_CONFIG.competitions);
        const currentYear = new Date().getFullYear();
        const startYear = currentYear - 4;
        
        console.log(`Populating ${leagues.length} leagues from ${startYear} to ${currentYear}`);
        
        for (const leagueId of leagues) {
            try {
                console.log(`\n=== Processing ${leagueId} ===`);
                await this.populateLeague(leagueId, startYear, currentYear);
                console.log(`✅ Completed ${leagueId}`);
                
                // Pausa tra campionati per non sovraccaricare l'API
                await new Promise(resolve => setTimeout(resolve, 2000));
                
            } catch (error) {
                console.error(`❌ Failed to populate ${leagueId}:`, error.message);
                // Continua con il prossimo campionato anche se questo fallisce
            }
        }
        
        console.log('\n🎯 Database initialization completed!');
        console.log('Server is now ready with full historical data');
    }
    
    static async populateLeague(leagueId, startYear, endYear) {
        const competitionId = API_CONFIG.competitions[leagueId];
        if (!competitionId) {
            throw new Error(`Unknown league: ${leagueId}`);
        }
        
        for (let season = startYear; season <= endYear; season++) {
            try {
                console.log(`  Fetching ${leagueId} season ${season}...`);
                
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
                console.log(`    Found ${matches.length} finished matches`);
                
                let saved = 0;
                for (const match of matches) {
                    if (await HistoricalManager.saveMatch(match, season, competitionId)) {
                        saved++;
                    }
                }
                
                console.log(`    Saved ${saved} matches to database`);
                
            } catch (error) {
                console.error(`    Error season ${season}:`, error.message);
                
                if (error.response?.status === 429) {
                    console.log('    Rate limited, waiting 30 seconds...');
                    await new Promise(resolve => setTimeout(resolve, 30000));
                }
                // Continua con la prossima stagione
            }
        }
    }
}

// ===========================================
// GESTIONE DATI STORICI (AGGIORNATA)
// ===========================================
class HistoricalManager {
    
    // Popola database con dati storici
    static async populateHistorical(leagueId, years = 4) {
        const competitionId = API_CONFIG.competitions[leagueId];
        if (!competitionId) throw new Error(`Unknown league: ${leagueId}`);
        
        const currentYear = new Date().getFullYear();
        const startYear = currentYear - years;
        
        console.log(`📚 Populating ${leagueId} from ${startYear} to ${currentYear}`);
        
        for (let season = startYear; season <= currentYear; season++) {
            try {
                console.log(`📅 Processing season ${season}...`);
                
                const response = await rateLimitedCall(async () => {
                    return await axios.get(
                        `${API_CONFIG.baseUrl}/competitions/${competitionId}/matches`,
                        {
                            headers: API_CONFIG.headers,
                            params: { season, status: 'FINISHED' },
                            timeout: 15000
                        }
                    );
                });
                
                const matches = response.data.matches || [];
                console.log(`  Found ${matches.length} finished matches`);
                
                let saved = 0;
                for (const match of matches) {
                    if (await this.saveMatch(match, season, competitionId)) {
                        saved++;
                    }
                }
                
                console.log(`  Saved ${saved} matches to database`);
                
            } catch (error) {
                console.error(`❌ Error season ${season}:`, error.message);
                if (error.response?.status === 429) {
                    console.log('  Rate limited, waiting extra time...');
                    await new Promise(resolve => setTimeout(resolve, 30000));
                }
            }
        }
        
        console.log(`✅ Historical data population completed`);
    }
    
    // Salva singola partita
    static async saveMatch(match, season, competitionId) {
        if (!match.score?.fullTime || match.score.fullTime.home === null) {
            return false;
        }
        
        return new Promise((resolve) => {
            const result = this.getMatchResult(match.score.fullTime);
            
            db.run(`
                INSERT OR REPLACE INTO historical_matches 
                (id, match_date, season, competition_id, matchday, home_team_id, away_team_id, 
                 home_team_name, away_team_name, home_goals, away_goals, match_result, status, winner)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                result,
                match.status,
                match.score.winner
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
    
    // Ottieni H2H dal database
    static async getH2H(team1Id, team2Id, years = 5) {
        const cutoff = new Date();
        cutoff.setFullYear(cutoff.getFullYear() - years);
        
        return new Promise((resolve) => {
            db.all(`
                SELECT * FROM historical_matches 
                WHERE ((home_team_id = ? AND away_team_id = ?) OR (home_team_id = ? AND away_team_id = ?))
                AND match_date >= ?
                ORDER BY match_date DESC
                LIMIT 15
            `, [team1Id, team2Id, team2Id, team1Id, cutoff.toISOString()], (err, rows) => {
                resolve(err ? [] : rows || []);
            });
        });
    }
    
    // Ottieni forma squadra (ultime 5 partite)
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
    
    // Statistiche squadra dal DB
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
                    AVG(total_goals) as avg_total_goals
                FROM historical_matches 
                WHERE (home_team_id = ? OR away_team_id = ?) 
                AND competition_id = ? 
                AND season >= ?
            `, [teamId, teamId, teamId, teamId, teamId, teamId, competitionId, startYear], (err, row) => {
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
// CALCOLI INTELLIGENTI
// ===========================================
class SmartCalculator {
    
    static async calculateProbabilities(homeId, awayId, competitionId) {
        console.log(`🧮 Calculating for ${homeId} vs ${awayId}`);
        
        // 1. Prova H2H
        const h2h = await HistoricalManager.getH2H(homeId, awayId);
        if (h2h.length >= 3) {
            console.log(`✅ Using H2H (${h2h.length} matches)`);
            return this.fromH2H(h2h, homeId, awayId);
        }
        
        // 2. Usa statistiche squadre
        console.log(`🔄 Using team stats fallback`);
        const [homeStats, awayStats] = await Promise.all([
            HistoricalManager.getTeamStats(homeId, competitionId),
            HistoricalManager.getTeamStats(awayId, competitionId)
        ]);
        
        if (homeStats?.total_matches >= 15 && awayStats?.total_matches >= 15) {
            return this.fromTeamStats(homeStats, awayStats);
        }
        
        // 3. Fallback generico
        console.log(`⚠️ Using generic fallback`);
        return this.getGenericProbabilities();
    }
    
    // Calcolo da H2H reali
    static fromH2H(matches, currentHomeId, currentAwayId) {
        const total = matches.length;
        let homeWins = 0, awayWins = 0, draws = 0;
        let totalGoals = 0, btts = 0, over25 = 0;
        
        matches.forEach(match => {
            totalGoals += match.total_goals;
            if (match.home_goals > 0 && match.away_goals > 0) btts++;
            if (match.total_goals > 2.5) over25++;
            
            if (match.match_result === 'draw') {
                draws++;
            } else if (
                (match.match_result === 'home' && match.home_team_id === currentHomeId) ||
                (match.match_result === 'away' && match.away_team_id === currentHomeId)
            ) {
                homeWins++;
            } else {
                awayWins++;
            }
        });
        
        const avgGoals = totalGoals / total;
        
        // Aggiungi vantaggio casa del 15%
        let homeProb = (homeWins / total) * 1.15;
        let drawProb = draws / total;
        let awayProb = awayWins / total;
        
        // Normalizza per sommare a 100%
        const sum = homeProb + drawProb + awayProb;
        
        return {
            '1X2': {
                home: ((homeProb / sum) * 100).toFixed(1),
                draw: ((drawProb / sum) * 100).toFixed(1),
                away: ((awayProb / sum) * 100).toFixed(1)
            },
            goals: {
                expectedTotal: avgGoals.toFixed(2),
                over25: ((over25 / total) * 100).toFixed(1),
                under25: (((total - over25) / total) * 100).toFixed(1)
            },
            btts: {
                btts_yes: ((btts / total) * 100).toFixed(1),
                btts_no: (((total - btts) / total) * 100).toFixed(1)
            },
            h2hData: {
                matches: matches.map(m => ({
                    date: m.match_date,
                    homeTeamName: m.home_team_name,
                    awayTeamName: m.away_team_name,
                    homeGoals: m.home_goals,
                    awayGoals: m.away_goals,
                    totalGoals: m.total_goals,
                    isBTTS: m.home_goals > 0 && m.away_goals > 0
                })).slice(0, 8),
                summary: {
                    totalMatches: total,
                    avgTotalGoals: avgGoals.toFixed(2),
                    over25Percentage: ((over25 / total) * 100).toFixed(1),
                    bttsPercentage: ((btts / total) * 100).toFixed(1),
                    currentHomeTeamWins: homeWins,
                    currentAwayTeamWins: awayWins,
                    draws: draws
                },
                reliability: total >= 6 ? 'high' : 'medium'
            },
            confidence: Math.min(85, 50 + (total * 4)),
            dataSource: 'h2h_database'
        };
    }
    
    // Calcolo da statistiche squadre
    static fromTeamStats(homeStats, awayStats) {
        const homeWinRate = homeStats.wins / homeStats.total_matches;
        const awayWinRate = awayStats.wins / awayStats.total_matches;
        
        let homeProb = homeWinRate * 1.2; // vantaggio casa
        let awayProb = awayWinRate;
        let drawProb = 0.26;
        
        const sum = homeProb + awayProb + drawProb;
        
        const expectedGoals = parseFloat(homeStats.avg_goals_for) + parseFloat(awayStats.avg_goals_for);
        const over25Prob = expectedGoals > 2.5 ? 
            Math.min(75, 45 + (expectedGoals - 2.5) * 15) : 
            Math.max(25, 45 - (2.5 - expectedGoals) * 10);
        
        return {
            '1X2': {
                home: ((homeProb / sum) * 100).toFixed(1),
                draw: ((drawProb / sum) * 100).toFixed(1),
                away: ((awayProb / sum) * 100).toFixed(1)
            },
            goals: {
                expectedTotal: expectedGoals.toFixed(2),
                over25: over25Prob.toFixed(1),
                under25: (100 - over25Prob).toFixed(1)
            },
            btts: {
                btts_yes: '54.0',
                btts_no: '46.0'
            },
            h2hData: null,
            confidence: 68,
            dataSource: 'team_statistics'
        };
    }
    
    // Probabilità generiche realistiche
    static getGenericProbabilities() {
        return {
            '1X2': {
                home: '46.0',
                draw: '26.0',
                away: '28.0'
            },
            goals: {
                expectedTotal: '2.65',
                over25: '56.0',
                under25: '44.0'
            },
            btts: {
                btts_yes: '52.0',
                btts_no: '48.0'
            },
            h2hData: null,
            confidence: 45,
            dataSource: 'generic_fallback'
        };
    }
}

// ===========================================
// API PRINCIPALE
// ===========================================
class MainAPI {
    
    // Ottieni partite intelligenti
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
            
            // Logica intelligente: ultime 15 finite + prossime 15
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
    
    // Ottieni forma squadra
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
// ENDPOINTS
// ===========================================

// Endpoint principale
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

        // Processa partite con analisi
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
                strategy: 'smart_recent_and_upcoming'
            }
        });
        
    } catch (error) {
        console.error('❌ API Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Popola database
app.post('/api/populate/:leagueId', async (req, res) => {
    try {
        const { leagueId } = req.params;
        const { years = 4 } = req.body;
        
        res.json({ success: true, message: 'Population started in background' });
        
        // Esegui in background
        HistoricalManager.populateHistorical(leagueId, years)
            .then(() => console.log(`✅ Population completed for ${leagueId}`))
            .catch(err => console.error(`❌ Population failed for ${leagueId}:`, err));
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Test intelligente
app.get('/api/test/:homeId/:awayId', async (req, res) => {
    try {
        const { homeId, awayId } = req.params;
        const { league = 'SA' } = req.query;
        const competitionId = API_CONFIG.competitions[league];
        
        const [probabilities, homeForm, awayForm, h2h] = await Promise.all([
            SmartCalculator.calculateProbabilities(parseInt(homeId), parseInt(awayId), competitionId),
            MainAPI.getTeamForm(parseInt(homeId), competitionId),
            MainAPI.getTeamForm(parseInt(awayId), competitionId),
            HistoricalManager.getH2H(parseInt(homeId), parseInt(awayId))
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
                confidence: probabilities.confidence
            }
        });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK',
        features: [
            'Historical Database (4+ years)',
            'Smart H2H Calculations', 
            'Team Form Analysis',
            'Intelligent Fallbacks',
            'Smart Match Selection'
        ],
        apis: {
            footballData: process.env.FOOTBALL_DATA_API_KEY ? 'Configured' : 'Missing'
        }
    });
});

// Endpoint per monitorare progresso inizializzazione
app.get('/api/init-status', (req, res) => {
    db.all(`
        SELECT 
            competition_id,
            season,
            COUNT(*) as matches
        FROM historical_matches 
        GROUP BY competition_id, season
        ORDER BY competition_id, season DESC
    `, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            // Raggruppa per competizione
            const byCompetition = {};
            const competitionNames = {
                2019: 'Serie A', 2021: 'Premier League', 2002: 'Bundesliga',
                2015: 'Ligue 1', 2014: 'La Liga', 2003: 'Eredivisie',
                2017: 'Primeira Liga', 2001: 'Champions League'
            };
            
            rows.forEach(row => {
                const name = competitionNames[row.competition_id] || `Competition ${row.competition_id}`;
                if (!byCompetition[name]) {
                    byCompetition[name] = [];
                }
                byCompetition[name].push({
                    season: row.season,
                    matches: row.matches
                });
            });
            
            db.get('SELECT COUNT(*) as total FROM historical_matches', (err, total) => {
                res.json({
                    success: true,
                    totalMatches: total?.total || 0,
                    competitionBreakdown: byCompetition,
                    isInitialized: (total?.total || 0) > 1000,
                    lastUpdated: new Date().toISOString()
                });
            });
        }
    });
});

// Database stats
app.get('/api/db-stats', (req, res) => {
    const queries = [
        'SELECT COUNT(*) as total FROM historical_matches',
        'SELECT COUNT(DISTINCT home_team_id) as teams FROM historical_matches',
        'SELECT season, COUNT(*) as matches FROM historical_matches GROUP BY season ORDER BY season DESC LIMIT 5'
    ];
    
    Promise.all(queries.map(q => 
        new Promise((resolve) => {
            if (q.includes('GROUP BY')) {
                db.all(q, (err, rows) => resolve(rows || []));
            } else {
                db.get(q, (err, row) => resolve(row || {}));
            }
        })
    )).then(([total, teams, seasons]) => {
        res.json({
            success: true,
            database: {
                totalMatches: total.total || 0,
                totalTeams: teams.teams || 0,
                seasonBreakdown: seasons
            }
        });
    });
});

// Helpers
function getTimeInfo(match) {
    const matchDate = new Date(match.utcDate);
    const now = new Date();
    const diff = Math.ceil((matchDate - now) / (24 * 60 * 60 * 1000));
    
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
}, 3600000); // ogni ora

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Football API Server running on port ${PORT}`);
    console.log('📊 Features:');
    console.log('  - Historical database with real match data');
    console.log('  - Intelligent H2H calculations from local DB');
    console.log('  - Team form analysis (last 5 matches)');
    console.log('  - Smart fallback calculations');
    console.log('  - Optimized match selection strategy');
    console.log('🌐 Endpoints:');
    console.log('  - GET /api/db-stats (database statistics)');
    console.log('  - GET /api/health (system health)');
    console.log('');
    console.log('First run: POST /api/populate/SA to build historical database');
    console.log('This will take ~20 minutes but only needs to be done once');
});

// Avvia l'inizializzazione automatica al primo avvio
setTimeout(() => {
    AutoInitializer.checkAndInitialize()
        .then(() => console.log('✅ Auto-initialization check completed'))
        .catch(err => console.error('❌ Auto-initialization failed:', err));
}, 3000); // Ritardo di 3 secondi per permettere al server di avviarsi

process.on('SIGINT', () => {
    console.log('Shutting down server...');
    db.close(() => {
        console.log('Database closed');
        process.exit(0);
    });
});

module.exports = app;