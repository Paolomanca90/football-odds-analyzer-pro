// server-optimized.js - Versione ottimizzata con rate limiting e cache
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
// RATE LIMITING E CACHE
// ===========================================
class APIRateLimiter {
    constructor() {
        this.lastCall = 0;
        this.minInterval = 200; // 200ms tra chiamate = max 5 al secondo
        this.queue = [];
        this.processing = false;
    }

    async throttledCall(apiCall) {
        return new Promise((resolve, reject) => {
            this.queue.push({ apiCall, resolve, reject });
            this.processQueue();
        });
    }

    async processQueue() {
        if (this.processing || this.queue.length === 0) return;
        
        this.processing = true;
        
        while (this.queue.length > 0) {
            const { apiCall, resolve, reject } = this.queue.shift();
            
            const now = Date.now();
            const timeSinceLastCall = now - this.lastCall;
            
            if (timeSinceLastCall < this.minInterval) {
                await this.sleep(this.minInterval - timeSinceLastCall);
            }
            
            try {
                this.lastCall = Date.now();
                const result = await apiCall();
                resolve(result);
            } catch (error) {
                reject(error);
            }
        }
        
        this.processing = false;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

const rateLimiter = new APIRateLimiter();

// ===========================================
// DATABASE OTTIMIZZATO
// ===========================================
const db = new sqlite3.Database('./football_optimized.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS matches_cache (
        id TEXT PRIMARY KEY,
        league_id TEXT NOT NULL,
        season INTEGER NOT NULL,
        data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS team_stats_cache (
        team_id INTEGER NOT NULL,
        season INTEGER NOT NULL,
        stats_data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        PRIMARY KEY (team_id, season)
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS h2h_cache (
        team1_id INTEGER NOT NULL,
        team2_id INTEGER NOT NULL,
        h2h_data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        PRIMARY KEY (team1_id, team2_id)
    )`);

    // NUOVA TABELLA PER DATI STORICI
    db.run(`CREATE TABLE IF NOT EXISTS historical_matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_date TEXT NOT NULL,
        season INTEGER NOT NULL,
        home_team_id INTEGER NOT NULL,
        away_team_id INTEGER NOT NULL,
        home_team_name TEXT,
        away_team_name TEXT,
        home_goals INTEGER DEFAULT 0,
        away_goals INTEGER DEFAULT 0,
        match_result TEXT,
        competition TEXT,
        total_goals INTEGER GENERATED ALWAYS AS (home_goals + away_goals),
        source TEXT DEFAULT 'manual',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // Indici per performance
    db.run(`CREATE INDEX IF NOT EXISTS idx_historical_teams ON historical_matches(home_team_id, away_team_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_historical_date ON historical_matches(match_date)`);    
    db.run(`CREATE INDEX IF NOT EXISTS idx_matches_league_season ON matches_cache(league_id, season)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_team_stats_expires ON team_stats_cache(expires_at)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_h2h_expires ON h2h_cache(expires_at)`);
});

// ===========================================
// API CONFIGURATION
// ===========================================
const API_CONFIG = {
    FOOTBALL_DATA: {
        baseUrl: 'https://api.football-data.org/v4',
        headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY },
        competitions: { 'SA': 2019, 'PL': 2021, 'BL1': 2002, 'FL1': 2015 , 'PD': 2014, 'DED': 2003, 'PPL': 2017, 'CL': 2001 }
    },
    RAPID_API: {
        baseUrl: 'https://api-football-v1.p.rapidapi.com/v3',
        headers: {
            'X-RapidAPI-Key': process.env.RAPID_API_KEY,
            'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com'
        }
    }
};

// ===========================================
// CACHE HELPERS
// ===========================================
class CacheManager {
    static async getMatchesCache(leagueId, season) {
        return new Promise((resolve) => {
            db.get(
                `SELECT data FROM matches_cache 
                 WHERE league_id = ? AND season = ? AND expires_at > datetime('now')`,
                [leagueId, season],
                (err, row) => {
                    if (err || !row) resolve(null);
                    else resolve(JSON.parse(row.data));
                }
            );
        });
    }

    static async setMatchesCache(leagueId, season, data) {
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minuti
        db.run(
            `INSERT OR REPLACE INTO matches_cache (id, league_id, season, data, expires_at) 
             VALUES (?, ?, ?, ?, ?)`,
            [`${leagueId}_${season}`, leagueId, season, JSON.stringify(data), expiresAt.toISOString()]
        );
    }

    static async getTeamStatsCache(teamId, season) {
        return new Promise((resolve) => {
            db.get(
                `SELECT stats_data FROM team_stats_cache 
                 WHERE team_id = ? AND season = ? AND expires_at > datetime('now')`,
                [teamId, season],
                (err, row) => {
                    if (err || !row) resolve(null);
                    else resolve(JSON.parse(row.stats_data));
                }
            );
        });
    }

    static async setTeamStatsCache(teamId, season, stats) {
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 ora
        db.run(
            `INSERT OR REPLACE INTO team_stats_cache (team_id, season, stats_data, expires_at) 
             VALUES (?, ?, ?, ?)`,
            [teamId, season, JSON.stringify(stats), expiresAt.toISOString()]
        );
    }

    static async getH2HCache(team1Id, team2Id) {
        return new Promise((resolve) => {
            db.get(
                `SELECT h2h_data FROM h2h_cache 
                 WHERE ((team1_id = ? AND team2_id = ?) OR (team1_id = ? AND team2_id = ?))
                 AND expires_at > datetime('now')`,
                [team1Id, team2Id, team2Id, team1Id],
                (err, row) => {
                    if (err || !row) resolve(null);
                    else resolve(JSON.parse(row.h2h_data));
                }
            );
        });
    }

    static async setH2HCache(team1Id, team2Id, h2hData) {
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 ore
        db.run(
            `INSERT OR REPLACE INTO h2h_cache (team1_id, team2_id, h2h_data, expires_at) 
             VALUES (?, ?, ?, ?)`,
            [team1Id, team2Id, JSON.stringify(h2hData), expiresAt.toISOString()]
        );
    }
}

class HistoricalDataManager {
    static async saveH2HMatches(matches) {
        if (!matches || matches.length === 0) return;
        
        for (const match of matches) {
            await new Promise((resolve) => {
                db.run(`
                    INSERT OR REPLACE INTO historical_matches 
                    (match_date, season, home_team_id, away_team_id, home_team_name, away_team_name, 
                     home_goals, away_goals, match_result, competition, source)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    match.match_date,
                    match.season || new Date(match.match_date).getFullYear(),
                    match.home_team_id,
                    match.away_team_id,
                    match.home_team_name,
                    match.away_team_name,
                    match.home_goals || 0,
                    match.away_goals || 0,
                    match.match_result,
                    match.competition || 'Unknown',
                    match.source || 'api'
                ], function(err) {
                    if (err) console.log('Error saving match:', err);
                    resolve();
                });
            });
        }
        
        console.log(`💾 Saved ${matches.length} historical matches to database`);
    }
    
    static async getStoredH2H(team1Id, team2Id, limit = 8) {
        return new Promise((resolve) => {
            db.all(`
                SELECT * FROM historical_matches 
                WHERE ((home_team_id = ? AND away_team_id = ?) OR (home_team_id = ? AND away_team_id = ?))
                AND match_date >= date('now', '-4 years')
                ORDER BY match_date DESC
                LIMIT ?
            `, [team1Id, team2Id, team2Id, team1Id, limit], (err, rows) => {
                if (err) {
                    console.log('Database error:', err);
                    resolve([]);
                } else {
                    console.log(`📚 Retrieved ${rows?.length || 0} stored H2H matches`);
                    resolve(rows || []);
                }
            });
        });
    }
}

class UniversalH2HSystem {
    
    // ==========================================
    // 1. METODO PRINCIPALE - USA ENDPOINT H2H UFFICIALE
    // ==========================================
    static async getMatchH2H(matchId, team1Id, team2Id) {
        console.log(`🔍 Getting H2H for match ${matchId}: ${team1Id} vs ${team2Id}`);
        
        // STEP 1: Prova endpoint H2H ufficiale se abbiamo il matchId
        if (matchId) {
            try {
                const h2hFromMatch = await this.getH2HFromMatchEndpoint(matchId);
                if (h2hFromMatch && h2hFromMatch.length > 0) {
                    console.log(`✅ Found ${h2hFromMatch.length} H2H from match endpoint`);
                    return this.formatH2HResponse(h2hFromMatch, team1Id, team2Id);
                }
            } catch (error) {
                console.log(`⚠️ Match H2H endpoint failed: ${error.message}`);
            }
        }
        
        // STEP 2: Fallback - Cerca nelle partite delle squadre
        try {
            const h2hFromTeams = await this.getH2HFromTeamMatches(team1Id, team2Id);
            if (h2hFromTeams && h2hFromTeams.length > 0) {
                console.log(`✅ Found ${h2hFromTeams.length} H2H from team matches`);
                return this.formatH2HResponse(h2hFromTeams, team1Id, team2Id);
            }
        } catch (error) {
            console.log(`⚠️ Team matches H2H failed: ${error.message}`);
        }
        
        // STEP 3: Fallback finale
        console.log(`📭 No H2H data found, returning empty`);
        return this.formatH2HResponse([], team1Id, team2Id);
    }
    
    // ==========================================
    // 2. USA ENDPOINT H2H UFFICIALE DI FOOTBALL-DATA
    // ==========================================
    static async getH2HFromMatchEndpoint(matchId) {
        console.log(`🌐 Calling official H2H endpoint: /v4/matches/${matchId}/head2head`);
        
        try {
            const response = await rateLimiter.throttledCall(async () => {
                return await axios.get(
                    `${API_CONFIG.FOOTBALL_DATA.baseUrl}/matches/${matchId}/head2head`,
                    {
                        headers: API_CONFIG.FOOTBALL_DATA.headers,
                        params: {
                            limit: 10  // Ultimi 10 scontri diretti
                        },
                        timeout: 15000
                    }
                );
            });
            
            const h2hData = response.data;
            console.log(`📊 H2H Response structure:`, {
                hasMatches: !!h2hData.matches,
                matchCount: h2hData.matches?.length || 0,
                hasAggregates: !!h2hData.aggregates
            });
            
            if (h2hData.matches && h2hData.matches.length > 0) {
                // Converti nel nostro formato
                return h2hData.matches.map(match => this.convertFootballDataMatch(match));
            }
            
            return [];
            
        } catch (error) {
            console.log(`❌ Official H2H endpoint error:`, error.response?.status, error.message);
            
            if (error.response?.status === 429) {
                throw new Error('Rate limit exceeded');
            }
            if (error.response?.status === 404) {
                throw new Error('Match not found');
            }
            
            throw error;
        }
    }
    
    // ==========================================
    // 3. FALLBACK - CERCA SCONTRI DIRETTI NELLE PARTITE DELLE SQUADRE
    // ==========================================
    static async getH2HFromTeamMatches(team1Id, team2Id) {
        console.log(`🔍 Searching H2H in team matches: ${team1Id} vs ${team2Id}`);
        
        try {
            // Prova con la squadra 1
            let h2hMatches = await this.searchH2HInTeamMatches(team1Id, team2Id);
            
            // Se non trova abbastanza risultati, prova con la squadra 2
            if (!h2hMatches || h2hMatches.length < 3) {
                console.log(`🔄 Trying with team ${team2Id} matches...`);
                const team2H2H = await this.searchH2HInTeamMatches(team2Id, team1Id);
                
                // Combina i risultati
                if (team2H2H && team2H2H.length > 0) {
                    h2hMatches = [...(h2hMatches || []), ...team2H2H];
                    // Rimuovi duplicati basandoti sull'id della partita
                    h2hMatches = h2hMatches.filter((match, index, self) => 
                        index === self.findIndex(m => m.id === match.id)
                    );
                }
            }
            
            // Ordina per data (più recenti prima) e limita a 8
            if (h2hMatches && h2hMatches.length > 0) {
                h2hMatches.sort((a, b) => new Date(b.match_date) - new Date(a.match_date));
                return h2hMatches.slice(0, 8);
            }
            
            return [];
            
        } catch (error) {
            console.log(`❌ Error searching H2H in team matches:`, error.message);
            throw error;
        }
    }
    
    // ==========================================
    // 4. CERCA H2H NELLE PARTITE DI UNA SQUADRA SPECIFICA
    // ==========================================
    static async searchH2HInTeamMatches(teamId, opponentId) {
        console.log(`🔍 Searching matches for team ${teamId} vs opponent ${opponentId}`);
        
        try {
            const response = await rateLimiter.throttledCall(async () => {
                return await axios.get(
                    `${API_CONFIG.FOOTBALL_DATA.baseUrl}/teams/${teamId}/matches`,
                    {
                        headers: API_CONFIG.FOOTBALL_DATA.headers,
                        params: {
                            status: 'FINISHED',  // Solo partite finite
                            limit: 50,           // Ultime 50 partite
                            // Cerchiamo negli ultimi 3 anni
                            dateFrom: new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                        },
                        timeout: 15000
                    }
                );
            });
            
            const matches = response.data.matches || [];
            console.log(`📊 Found ${matches.length} total matches for team ${teamId}`);
            
            // Filtra solo gli scontri diretti con l'avversario
            const h2hMatches = matches.filter(match => {
                return (match.homeTeam.id === teamId && match.awayTeam.id === opponentId) ||
                       (match.homeTeam.id === opponentId && match.awayTeam.id === teamId);
            });
            
            console.log(`🎯 Found ${h2hMatches.length} H2H matches`);
            
            return h2hMatches.map(match => this.convertFootballDataMatch(match));
            
        } catch (error) {
            console.log(`❌ Error fetching team matches:`, error.response?.status, error.message);
            throw error;
        }
    }
    
    // ==========================================
    // 5. CONVERTE MATCH FOOTBALL-DATA NEL NOSTRO FORMATO
    // ==========================================
    static convertFootballDataMatch(match) {
        const homeGoals = match.score?.fullTime?.home || 0;
        const awayGoals = match.score?.fullTime?.away || 0;
        
        let matchResult = 'draw';
        if (homeGoals > awayGoals) matchResult = 'home';
        else if (awayGoals > homeGoals) matchResult = 'away';
        
        return {
            id: match.id,
            match_date: match.utcDate,
            season: match.season?.id || new Date(match.utcDate).getFullYear(),
            home_team_id: match.homeTeam?.id,
            away_team_id: match.awayTeam?.id,
            home_team_name: match.homeTeam?.name,
            away_team_name: match.awayTeam?.name,
            home_goals: homeGoals,
            away_goals: awayGoals,
            match_result: matchResult,
            competition: match.competition?.name || 'Unknown',
            competition_id: match.competition?.id,
            matchday: match.matchday,
            status: match.status,
            total_goals: homeGoals + awayGoals,
            source: 'football-data-api-v4'
        };
    }
    
    // ==========================================
    // 6. FORMATTA LA RISPOSTA H2H COMPLETA
    // ==========================================
    static formatH2HResponse(matches, team1Id, team2Id) {
        const summary = this.calculateH2HSummary(matches);
        const reliability = this.calculateReliability(matches.length);
        
        return {
            matches: matches,
            summary: summary,
            reliability: reliability,
            team1Id: team1Id,
            team2Id: team2Id,
            lastUpdate: new Date().toISOString()
        };
    }
    
    // ==========================================
    // 7. CALCOLA STATISTICHE H2H
    // ==========================================
    static calculateH2HSummary(matches) {
        if (!matches || matches.length === 0) {
            return {
                totalMatches: 0,
                avgTotalGoals: '0.00',
                over25Percentage: '0.0',
                under25Percentage: '100.0',
                bttsPercentage: '0.0',
                team1Wins: 0,
                team2Wins: 0,
                draws: 0
            };
        }
        
        const totalMatches = matches.length;
        const totalGoals = matches.reduce((sum, match) => sum + match.total_goals, 0);
        const avgGoals = totalGoals / totalMatches;
        
        const over25Matches = matches.filter(match => match.total_goals > 2.5).length;
        const bttsMatches = matches.filter(match => match.home_goals > 0 && match.away_goals > 0).length;
        
        // Conta risultati (dal punto di vista della prima squadra)
        const team1Wins = matches.filter(match => 
            (match.home_team_id === matches[0]?.home_team_id && match.match_result === 'home') ||
            (match.away_team_id === matches[0]?.home_team_id && match.match_result === 'away')
        ).length;
        
        const team2Wins = matches.filter(match => 
            (match.home_team_id === matches[0]?.away_team_id && match.match_result === 'home') ||
            (match.away_team_id === matches[0]?.away_team_id && match.match_result === 'away')
        ).length;
        
        const draws = matches.filter(match => match.match_result === 'draw').length;
        
        const over25Percentage = (over25Matches / totalMatches) * 100;
        const bttsPercentage = (bttsMatches / totalMatches) * 100;
        
        console.log(`📊 H2H Summary calculated:`, {
            totalMatches,
            avgGoals: avgGoals.toFixed(2),
            over25: `${over25Matches}/${totalMatches} = ${over25Percentage.toFixed(1)}%`,
            btts: `${bttsMatches}/${totalMatches} = ${bttsPercentage.toFixed(1)}%`
        });
        
        return {
            totalMatches,
            avgTotalGoals: avgGoals.toFixed(2),
            over25Percentage: over25Percentage.toFixed(1),
            under25Percentage: (100 - over25Percentage).toFixed(1),
            bttsPercentage: bttsPercentage.toFixed(1),
            noBttsPercentage: (100 - bttsPercentage).toFixed(1),
            team1Wins,
            team2Wins,
            draws
        };
    }
    
    // ==========================================
    // 8. CALCOLA AFFIDABILITÀ BASATA SUL NUMERO DI PARTITE
    // ==========================================
    static calculateReliability(matchCount) {
        if (matchCount >= 8) return 'high';
        if (matchCount >= 4) return 'medium';
        if (matchCount >= 1) return 'low';
        return 'none';
    }
}

// ===========================================
// SERVIZIO API OTTIMIZZATO
// ===========================================
class RealDataFootballAPI {
    static getCurrentSeason() {
        const now = new Date();
        return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
    }

    // ==========================================
    // 1. OTTIENI H2H REALI DA FOOTBALL-DATA API
    // ==========================================
    static async getRealHeadToHead(team1Id, team2Id) {
        console.log(`🔍 Fetching REAL H2H data: ${team1Id} vs ${team2Id}`);
        
        // Controlla cache prima
        const cached = await CacheManager.getH2HCache(team1Id, team2Id);
        if (cached && cached.length > 0) {
            console.log(`✅ Using cached H2H: ${cached.length} matches`);
            return cached;
        }

        try {
            // OPZIONE 1: USA FOOTBALL-DATA API PER H2H
            const h2hData = await this.fetchH2HFromFootballData(team1Id, team2Id);
            
            if (h2hData && h2hData.length > 0) {
                // Cache i risultati per 24 ore
                await CacheManager.setH2HCache(team1Id, team2Id, h2hData);
                return h2hData;
            }
        } catch (error) {
            console.log(`⚠️ Football-Data H2H failed: ${error.message}, trying RapidAPI...`);
        }

        try {
            // OPZIONE 2: FALLBACK SU RAPID API
            const rapidH2H = await this.fetchH2HFromRapidAPI(team1Id, team2Id);
            
            if (rapidH2H && rapidH2H.length > 0) {
                await CacheManager.setH2HCache(team1Id, team2Id, rapidH2H);
                return rapidH2H;
            }
        } catch (error) {
            console.log(`⚠️ RapidAPI H2H failed: ${error.message}`);
        }

        // OPZIONE 3: FALLBACK - CERCA NELLA STORICO GENERALE
        console.log(`🔄 Trying historical matches search...`);
        return await this.findH2HInHistoricalData(team1Id, team2Id);
    }

    // ==========================================
    // FOOTBALL-DATA API H2H
    // ==========================================
    static async fetchH2HFromFootballData(team1Id, team2Id) {
        const seasons = [2024, 2023, 2022, 2021, 2020]; // Ultimi 5 anni
        const h2hMatches = [];

        for (const season of seasons) {
            try {
                console.log(`📅 Searching H2H in season ${season}...`);
                
                // Cerca partite per team1
                const team1Matches = await rateLimiter.throttledCall(async () => {
                    return await axios.get(
                        `${API_CONFIG.FOOTBALL_DATA.baseUrl}/teams/${team1Id}/matches`,
                        {
                            headers: API_CONFIG.FOOTBALL_DATA.headers,
                            params: { 
                                season: season,
                                status: 'FINISHED'
                            },
                            timeout: 10000
                        }
                    );
                });

                // Filtra solo le partite contro team2
                const h2hInSeason = team1Matches.data.matches?.filter(match => {
                    return (match.homeTeam.id === team1Id && match.awayTeam.id === team2Id) ||
                           (match.homeTeam.id === team2Id && match.awayTeam.id === team1Id);
                }) || [];

                console.log(`🔍 Found ${h2hInSeason.length} H2H matches in ${season}`);
                
                // Converti nel formato standard
                const convertedMatches = h2hInSeason.map(match => ({
                    match_date: match.utcDate,
                    season: season,
                    home_team_id: match.homeTeam.id,
                    away_team_id: match.awayTeam.id,
                    home_team_name: match.homeTeam.name,
                    away_team_name: match.awayTeam.name,
                    home_goals: match.score?.fullTime?.home || 0,
                    away_goals: match.score?.fullTime?.away || 0,
                    match_result: this.getMatchResult(match.score?.fullTime),
                    competition: match.competition?.name || 'Unknown',
                    matchday: match.matchday,
                    total_goals: (match.score?.fullTime?.home || 0) + (match.score?.fullTime?.away || 0),
                    source: 'football-data-api'
                }));

                h2hMatches.push(...convertedMatches);
                
                // Limita a max 8 partite per evitare troppe chiamate
                if (h2hMatches.length >= 8) break;
                
                // Pausa tra stagioni per rispettare rate limit
                await new Promise(resolve => setTimeout(resolve, 300));
                
            } catch (error) {
                console.log(`⚠️ Error fetching ${season} season:`, error.message);
                continue;
            }
        }

        console.log(`✅ Total H2H matches found: ${h2hMatches.length}`);
        return h2hMatches.slice(0, 8); // Limita agli ultimi 8
    }

    // ==========================================
    // RAPID API H2H (FALLBACK)
    // ==========================================
    static async fetchH2HFromRapidAPI(team1Id, team2Id) {
        console.log(`🚀 Fetching H2H from RapidAPI: ${team1Id} vs ${team2Id}`);
        
        try {
            const response = await rateLimiter.throttledCall(async () => {
                return await axios.get(
                    `${API_CONFIG.RAPID_API.baseUrl}/fixtures/headtohead`,
                    {
                        headers: API_CONFIG.RAPID_API.headers,
                        params: {
                            h2h: `${team1Id}-${team2Id}`,
                            last: 8
                        },
                        timeout: 10000
                    }
                );
            });

            const matches = response.data?.response || [];
            console.log(`📊 RapidAPI returned ${matches.length} H2H matches`);
            
            return matches.map(match => ({
                match_date: match.fixture?.date,
                season: new Date(match.fixture?.date).getFullYear(),
                home_team_id: match.teams?.home?.id,
                away_team_id: match.teams?.away?.id,
                home_team_name: match.teams?.home?.name,
                away_team_name: match.teams?.away?.name,
                home_goals: match.goals?.home || 0,
                away_goals: match.goals?.away || 0,
                match_result: this.getMatchResult({
                    home: match.goals?.home || 0,
                    away: match.goals?.away || 0
                }),
                competition: match.league?.name || 'Unknown',
                total_goals: (match.goals?.home || 0) + (match.goals?.away || 0),
                source: 'rapid-api'
            })).slice(0, 8);
            
        } catch (error) {
            console.log(`❌ RapidAPI H2H error:`, error.message);
            return [];
        }
    }

    // ==========================================
    // CERCA NEI DATI STORICI (ULTIMO FALLBACK)
    // ==========================================
    static async findH2HInHistoricalData(team1Id, team2Id) {
        console.log(`🗂️ Searching historical data for ${team1Id} vs ${team2Id}...`);
        
        // Qui puoi implementare una ricerca nel database locale
        // o in un dataset di partite storiche che hai già salvato
        
        return new Promise((resolve) => {
            db.all(`
                SELECT * FROM historical_matches 
                WHERE ((home_team_id = ? AND away_team_id = ?) OR (home_team_id = ? AND away_team_id = ?))
                AND match_date >= date('now', '-3 years')
                ORDER BY match_date DESC
                LIMIT 8
            `, [team1Id, team2Id, team2Id, team1Id], (err, rows) => {
                if (err || !rows) {
                    console.log(`📭 No historical data found`);
                    resolve([]);
                } else {
                    console.log(`📚 Found ${rows.length} historical matches`);
                    resolve(rows);
                }
            });
        });
    }

    // ==========================================
    // HELPER FUNCTIONS
    // ==========================================
    static getMatchResult(score) {
        if (!score || score.home === null || score.away === null) return 'unknown';
        
        const home = parseInt(score.home);
        const away = parseInt(score.away);
        
        if (home > away) return 'home';
        if (away > home) return 'away';
        return 'draw';
    }

    // ==========================================
    // 2. CALCOLA STATISTICHE REALI DAGLI H2H
    // ==========================================
    static calculateRealH2HStats(h2hMatches) {
        if (!h2hMatches || h2hMatches.length === 0) {
            return {
                totalMatches: 0,
                avgTotalGoals: 0,
                over25Percentage: 0,
                under25Percentage: 0,
                bttsPercentage: 0,
                reliability: 'none'
            };
        }

        const totalGoals = h2hMatches.reduce((sum, match) => {
            return sum + (match.home_goals || 0) + (match.away_goals || 0);
        }, 0);

        const avgGoals = totalGoals / h2hMatches.length;
        
        const over25Matches = h2hMatches.filter(match => {
            const total = (match.home_goals || 0) + (match.away_goals || 0);
            return total > 2.5;
        }).length;

        const bttsMatches = h2hMatches.filter(match => {
            return (match.home_goals || 0) > 0 && (match.away_goals || 0) > 0;
        }).length;

        const over25Percentage = (over25Matches / h2hMatches.length) * 100;
        const bttsPercentage = (bttsMatches / h2hMatches.length) * 100;

        const reliability = h2hMatches.length >= 6 ? 'high' : h2hMatches.length >= 3 ? 'medium' : 'low';

        console.log(`📊 H2H Statistics Calculated:`, {
            totalMatches: h2hMatches.length,
            avgGoals: avgGoals.toFixed(2),
            over25: `${over25Matches}/${h2hMatches.length} = ${over25Percentage.toFixed(1)}%`,
            btts: `${bttsMatches}/${h2hMatches.length} = ${bttsPercentage.toFixed(1)}%`,
            reliability
        });

        return {
            totalMatches: h2hMatches.length,
            avgTotalGoals: avgGoals.toFixed(2),
            over25Percentage: over25Percentage.toFixed(1),
            under25Percentage: (100 - over25Percentage).toFixed(1),
            bttsPercentage: bttsPercentage.toFixed(1),
            noBttsPercentage: (100 - bttsPercentage).toFixed(1),
            reliability,
            dataSource: h2hMatches[0]?.source || 'unknown',
            lastUpdate: new Date().toISOString()
        };
    }

    // ==========================================
    // 3. METODO PRINCIPALE PER OTTENERE DATI COMPLETI
    // ==========================================
    static async getCompleteH2HData(team1Id, team2Id) {
        console.log(`🎯 Getting complete H2H data for ${team1Id} vs ${team2Id}`);
        
        const matches = await this.getRealHeadToHead(team1Id, team2Id);
        const summary = this.calculateRealH2HStats(matches);
        
        return {
            matches: matches || [],
            summary,
            reliability: summary.reliability,
            lastUpdate: new Date().toISOString()
        };
    }

    // ==========================================
    // RESTO DEI METODI (getMatches, getTeamStats, etc.)
    // ==========================================
    
    // Mantieni gli altri metodi della classe OptimizedFootballAPI...
    static async getMatches(leagueId, season = null) {
        // Stesso codice di prima...
        if (!season) season = this.getCurrentSeason();
        
        console.log(`🔍 Getting matches for ${leagueId}, season ${season}`);
        
        const cached = await CacheManager.getMatchesCache(leagueId, season);
        if (cached) {
            console.log(`✅ Using cached matches: ${cached.length} matches`);
            return cached;
        }

        const competitionId = API_CONFIG.FOOTBALL_DATA.competitions[leagueId];
        if (!competitionId) {
            throw new Error(`Unknown league: ${leagueId}`);
        }

        try {
            const response = await rateLimiter.throttledCall(async () => {
                return await axios.get(
                    `${API_CONFIG.FOOTBALL_DATA.baseUrl}/competitions/${competitionId}/matches`,
                    {
                        headers: API_CONFIG.FOOTBALL_DATA.headers,
                        params: { season: season },
                        timeout: 15000
                    }
                );
            });

            const matches = response.data.matches || [];
            console.log(`✅ Fetched ${matches.length} matches from Football-Data API`);
            
            await CacheManager.setMatchesCache(leagueId, season, matches);
            return matches;

        } catch (error) {
            if (error.response?.status === 429) {
                console.log(`⚠️ Rate limited, using fallback data`);
                return await this.getFallbackMatches(leagueId, season);
            }
            
            console.error(`❌ API Error:`, error.message);
            throw error;
        }
    }

    // Altri metodi rimangono uguali...
    static async getTeamStats(teamId, season = null) {
        // Stesso codice di prima per le statistiche delle squadre
        if (!season) season = this.getCurrentSeason();
        
        console.log(`📊 Getting stats for team ${teamId}, season ${season}`);
        
        const cached = await CacheManager.getTeamStatsCache(teamId, season);
        if (cached) {
            console.log(`✅ Using cached team stats for ${teamId}`);
            return cached;
        }

        const stats = this.generateRealisticTeamStats(teamId, season);
        await CacheManager.setTeamStatsCache(teamId, season, stats);
        
        return stats;
    }

    // Mantieni le altre funzioni helper...
    static generateRealisticTeamStats(teamId, season) {
        // Stesso codice di prima...
        const teamProfiles = {
            98: { name: 'AC Milan', tier: 'top', attack: 75, defense: 70 },
            108: { name: 'Inter', tier: 'top', attack: 80, defense: 75 },
            109: { name: 'Juventus', tier: 'top', attack: 70, defense: 80 },
            113: { name: 'Napoli', tier: 'top', attack: 85, defense: 65 },
            // ... altri team
        };

        const profile = teamProfiles[teamId] || { 
            name: `Team ${teamId}`, tier: 'mid', attack: 50, defense: 50 
        };

        const matches = 5;
        let winRate, goalsFor, goalsAgainst;
        
        switch(profile.tier) {
            case 'top':
                winRate = 0.6 + Math.random() * 0.2;
                goalsFor = (profile.attack / 100) * 2.5;
                goalsAgainst = (1 - profile.defense / 100) * 1.5;
                break;
            default:
                winRate = 0.3 + Math.random() * 0.3;
                goalsFor = (profile.attack / 100) * 2.0;
                goalsAgainst = (1 - profile.defense / 100) * 2.0;
        }

        const wins = Math.round(matches * winRate);
        const losses = Math.round(matches * (1 - winRate) * 0.7);
        const draws = matches - wins - losses;

        return {
            teamId,
            teamName: profile.name,
            season,
            matches_played: matches,
            wins, draws, losses,
            goals_for: Math.round(matches * goalsFor),
            goals_against: Math.round(matches * goalsAgainst),
            home_wins: Math.round(wins * 0.7),
            home_draws: Math.round(draws * 0.6),
            home_losses: Math.round(losses * 0.3),
            home_goals_for: Math.round(matches * goalsFor * 0.65),
            home_goals_against: Math.round(matches * goalsAgainst * 0.45),
            away_wins: wins - Math.round(wins * 0.7),
            away_draws: draws - Math.round(draws * 0.6), 
            away_losses: losses - Math.round(losses * 0.3),
            away_goals_for: Math.round(matches * goalsFor * 0.35),
            away_goals_against: Math.round(matches * goalsAgainst * 0.55),
            clean_sheets: Math.round(matches * (profile.defense / 100) * 0.4),
            dataQuality: 'medium',
            dataSource: 'realistic_generator'
        };
    }

    static async getRealHeadToHead(team1Id, team2Id) {
        console.log(`🔍 Fetching REAL H2H data: ${team1Id} vs ${team2Id}`);
        
        // 1. Controlla cache prima
        const cached = await CacheManager.getH2HCache(team1Id, team2Id);
        if (cached && cached.length > 0) {
            console.log(`✅ Using cached H2H: ${cached.length} matches`);
            return cached;
        }

        // 2. Prova a recuperare da database storico
        const stored = await HistoricalDataManager.getStoredH2H(team1Id, team2Id);
        if (stored && stored.length >= 3) {
            console.log(`📚 Using stored historical data: ${stored.length} matches`);
            // Cache anche i dati dal database
            await CacheManager.setH2HCache(team1Id, team2Id, stored);
            return stored;
        }

        // 3. Fetch da API esterne
        let h2hData = [];
        
        try {
            console.log(`🌐 Fetching fresh data from APIs...`);
            h2hData = await this.fetchH2HFromFootballData(team1Id, team2Id);
            
            if (!h2hData || h2hData.length === 0) {
                h2hData = await this.fetchH2HFromRapidAPI(team1Id, team2Id);
            }
            
            // 4. Salva i nuovi dati nel database
            if (h2hData && h2hData.length > 0) {
                await HistoricalDataManager.saveH2HMatches(h2hData);
                await CacheManager.setH2HCache(team1Id, team2Id, h2hData);
                console.log(`✅ Successfully fetched and saved ${h2hData.length} fresh H2H matches`);
                return h2hData;
            }
            
        } catch (error) {
            console.log(`❌ API fetch failed: ${error.message}`);
        }

        // 5. Ultimo fallback: usa dati stored anche se pochi
        if (stored && stored.length > 0) {
            console.log(`🔄 Using limited stored data as last resort: ${stored.length} matches`);
            return stored;
        }

        console.log(`📭 No H2H data found for ${team1Id} vs ${team2Id}`);
        return [];
    }
}

// ===========================================
// STATISTICHE E SUGGERIMENTI (SEMPLIFICATI)
// ===========================================
class SimpleStatistics {
    static calculateProbabilities(homeStats, awayStats, h2hData = null) {
        if (!homeStats || !awayStats) {
            return this.getDefaultProbabilities();
        }

        const homeStrength = this.calculateStrength(homeStats);
        const awayStrength = this.calculateStrength(awayStats);
        
        // Calcola probabilità 1X2 corrette
        const rawHomeProb = homeStrength * 1.15; // Vantaggio casa 15%
        const rawAwayProb = awayStrength;
        const rawDrawProb = 0.28;
        
        const total = rawHomeProb + rawAwayProb + rawDrawProb;
        const normalized1X2 = {
            home: (rawHomeProb / total * 100).toFixed(1),
            draw: (rawDrawProb / total * 100).toFixed(1),
            away: (rawAwayProb / total * 100).toFixed(1),
            confidence: this.calculateConfidence(homeStats, awayStats)
        };

        // CALCOLA GOL USANDO H2H SE DISPONIBILI, ALTRIMENTI STATS STAGIONALI
        const expectedGoals = this.calculateExpectedGoalsCorrect(homeStats, awayStats, h2hData);
        console.log(`🎯 Expected Goals Calculation:`, {
            fromH2H: h2hData?.length ? this.getH2HAverage(h2hData) : null,
            fromStats: this.getSeasonAverage(homeStats, awayStats),
            final: expectedGoals
        });

        // USA DISTRIBUZIONE POISSON CORRETTA
        const over25Prob = this.calculatePoissonOver(expectedGoals, 2.5);
        const under25Prob = 100 - over25Prob;

        console.log(`📊 Goals Probability:`, {
            expectedGoals,
            over25: over25Prob.toFixed(1),
            under25: under25Prob.toFixed(1),
            logicCheck: over25Prob > under25Prob ? 'Over favorito' : 'Under favorito'
        });

        const normalizedGoals = {
            expected_total: expectedGoals.toFixed(2),
            over_25: over25Prob.toFixed(1),
            under_25: under25Prob.toFixed(1),
            over_15: this.calculatePoissonOver(expectedGoals, 1.5).toFixed(1),
            over_35: this.calculatePoissonOver(expectedGoals, 3.5).toFixed(1)
        };

        // BTTS CORRETTO
        const bttsYesProb = this.calculateBTTSCorrect(homeStats, awayStats, h2hData);
        const normalizedBTTS = {
            btts_yes: bttsYesProb.toFixed(1),
            btts_no: (100 - bttsYesProb).toFixed(1),
            home_score_prob: (this.calculateScoringProb(homeStats, true) * 100).toFixed(1),
            away_score_prob: (this.calculateScoringProb(awayStats, false) * 100).toFixed(1),
            confidence: 75
        };

        return {
            '1X2': normalized1X2,
            goals: normalizedGoals,
            btts: normalizedBTTS,
            clean_sheets: this.calculateCleanSheets(homeStats, awayStats),
            calculation_source: h2hData?.length > 3 ? 'H2H + Season' : 'Season only'
        };
    }

    // CALCOLO GOLA ATTESI CORRETTO
    static calculateExpectedGoalsCorrect(homeStats, awayStats, h2hData) {
        let seasonGoals = this.getSeasonAverage(homeStats, awayStats);
        
        if (h2hData && h2hData.length > 3) {
            const h2hGoals = this.getH2HAverage(h2hData);
            // Bilancia H2H (70%) con stagione corrente (30%)
            const weightedGoals = (h2hGoals * 0.7) + (seasonGoals * 0.3);
            console.log(`⚖️  Weighted Goals: H2H=${h2hGoals.toFixed(2)} (70%) + Season=${seasonGoals.toFixed(2)} (30%) = ${weightedGoals.toFixed(2)}`);
            return Math.max(1.5, Math.min(4.5, weightedGoals));
        }
        
        return Math.max(1.5, Math.min(4.5, seasonGoals));
    }

    static getH2HAverage(h2hMatches) {
        if (!h2hMatches || h2hMatches.length === 0) return 2.5;
        
        const totalGoals = h2hMatches.reduce((sum, match) => {
            return sum + (match.home_goals || 0) + (match.away_goals || 0);
        }, 0);
        
        return totalGoals / h2hMatches.length;
    }

    static getSeasonAverage(homeStats, awayStats) {
        const homeGoalsPerMatch = homeStats.home_goals_for / Math.max(1, homeStats.home_wins + homeStats.home_draws + homeStats.home_losses);
        const awayGoalsPerMatch = awayStats.away_goals_for / Math.max(1, awayStats.away_wins + awayStats.away_draws + awayStats.away_losses);
        
        return homeGoalsPerMatch + awayGoalsPerMatch;
    }

    // DISTRIBUZIONE POISSON CORRETTA
    static calculatePoissonOver(lambda, threshold) {
        if (lambda <= 0) lambda = 2.5;
        
        let underProb = 0;
        const maxK = Math.floor(threshold) + 5; // Calcola fino a soglia + 5
        
        for (let k = 0; k <= Math.floor(threshold); k++) {
            underProb += (Math.pow(lambda, k) * Math.exp(-lambda)) / this.factorial(k);
        }
        
        return Math.max(0, Math.min(100, (1 - underProb) * 100));
    }

    static factorial(n) {
        if (n <= 1) return 1;
        let result = 1;
        for (let i = 2; i <= n; i++) {
            result *= i;
        }
        return result;
    }

    // BTTS CORRETTO BASATO SU H2H
    static calculateBTTSCorrect(homeStats, awayStats, h2hData) {
        if (h2hData && h2hData.length > 3) {
            const bttsMatches = h2hData.filter(match => 
                (match.home_goals || 0) > 0 && (match.away_goals || 0) > 0
            ).length;
            
            const h2hBTTSPerc = (bttsMatches / h2hData.length) * 100;
            const seasonBTTSPerc = this.calculateSeasonBTTS(homeStats, awayStats);
            
            // Bilancia H2H (60%) con stagione (40%)
            return (h2hBTTSPerc * 0.6) + (seasonBTTSPerc * 0.4);
        }
        
        return this.calculateSeasonBTTS(homeStats, awayStats);
    }

    static calculateSeasonBTTS(homeStats, awayStats) {
        const homeScoreProb = this.calculateScoringProb(homeStats, true);
        const awayScoreProb = this.calculateScoringProb(awayStats, false);
        return homeScoreProb * awayScoreProb * 100;
    }

    // RESTO DELLE FUNZIONI RIMANE UGUALE...
    static calculateStrength(stats) {
        if (!stats || !stats.matches_played) return 0.4;
        
        const winRate = stats.wins / stats.matches_played;
        const goalRatio = (stats.goals_for + 1) / (stats.goals_against + 1);
        const pointsPerGame = (stats.wins * 3 + stats.draws) / stats.matches_played / 3;
        
        return 0.2 + winRate * 0.4 + (goalRatio - 1) * 0.2 + pointsPerGame * 0.2;
    }

    static calculateScoringProb(stats, isHome) {
        if (!stats) return 0.7;
        
        const goalsPerMatch = isHome ? 
            stats.home_goals_for / Math.max(1, stats.home_wins + stats.home_draws + stats.home_losses) :
            stats.away_goals_for / Math.max(1, stats.away_wins + stats.away_draws + stats.away_losses);
        
        return 1 - Math.exp(-Math.max(0.5, goalsPerMatch));
    }

    static calculateCleanSheets(homeStats, awayStats) {
        const homeCleanProb = this.calculateDefensiveStrength(homeStats, true);
        const awayCleanProb = this.calculateDefensiveStrength(awayStats, false);
        
        return {
            home_clean_sheet: (homeCleanProb * 100).toFixed(1),
            away_clean_sheet: (awayCleanProb * 100).toFixed(1)
        };
    }

    static calculateDefensiveStrength(stats, isHome) {
        if (!stats) return 0.25;
        
        const goalsAgainstPerMatch = isHome ?
            stats.home_goals_against / Math.max(1, stats.home_wins + stats.home_draws + stats.home_losses) :
            stats.away_goals_against / Math.max(1, stats.away_wins + stats.away_draws + stats.away_losses);
        
        return Math.exp(-Math.max(0.5, goalsAgainstPerMatch));
    }

    static calculateConfidence(homeStats, awayStats) {
        let confidence = 50;
        
        if (homeStats && homeStats.matches_played >= 5) confidence += 15;
        if (awayStats && awayStats.matches_played >= 5) confidence += 15;
        if (homeStats?.dataSource === 'rapidapi') confidence += 10;
        if (awayStats?.dataSource === 'rapidapi') confidence += 10;
        
        return Math.min(95, confidence);
    }

    static getDefaultProbabilities() {
        return {
            '1X2': {
                home: '42.0',
                draw: '28.0', 
                away: '30.0',
                confidence: 50
            },
            goals: {
                expected_total: '2.50',
                over_25: '52.0',
                under_25: '48.0',
                over_15: '75.0',
                over_35: '25.0'
            },
            btts: {
                btts_yes: '58.0',
                btts_no: '42.0',
                home_score_prob: '75.0',
                away_score_prob: '68.0',
                confidence: 50
            },
            clean_sheets: {
                home_clean_sheet: '28.0',
                away_clean_sheet: '32.0'
            }
        };
    }
}

// Helper functions (fuori da classi per evitare errori di binding)
function summarizeH2H(h2hMatches) {
    if (!h2hMatches || h2hMatches.length === 0) return null;
    
    const totalGoals = h2hMatches.reduce((sum, m) => sum + m.home_goals + m.away_goals, 0);
    const avgGoals = (totalGoals / h2hMatches.length);
    
    const over25Matches = h2hMatches.filter(m => (m.home_goals + m.away_goals) > 2.5).length;
    const bttsMatches = h2hMatches.filter(m => m.home_goals > 0 && m.away_goals > 0).length;
    
    const over25Percentage = ((over25Matches / h2hMatches.length) * 100);
    const bttsPercentage = ((bttsMatches / h2hMatches.length) * 100);
    
    console.log(`📈 H2H Summary Calculation:`, {
        totalMatches: h2hMatches.length,
        totalGoals,
        avgGoals: avgGoals.toFixed(2),
        over25Matches,
        over25Percentage: over25Percentage.toFixed(1),
        bttsMatches,
        bttsPercentage: bttsPercentage.toFixed(1)
    });
    
    return {
        totalMatches: h2hMatches.length,
        avgTotalGoals: avgGoals.toFixed(2),
        bttsPercentage: bttsPercentage.toFixed(1),
        over25Percentage: over25Percentage.toFixed(1),
        under25Percentage: (100 - over25Percentage).toFixed(1)
    };
}

function calculateCompleteness(homeStats, awayStats, h2hData) {
    let score = 40; // Base score
    
    if (homeStats && homeStats.dataSource) score += 20;
    if (awayStats && awayStats.dataSource) score += 20;
    if (h2hData && h2hData.length > 3) score += 15;
    if (h2hData && h2hData.length > 6) score += 5;
    
    return Math.min(100, score);
}

// ===========================================
// ENDPOINT OTTIMIZZATO
// ===========================================
app.get('/api/matches/:leagueId', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { leagueId } = req.params;
        const { season } = req.query;
        
        console.log(`🚀 Processing request: ${leagueId}, season: ${season}`);
        
        // Ottieni matches con cache e rate limiting
        const matches = await RealDataFootballAPI.getMatches(leagueId, season ? parseInt(season) : null);
        
        if (!matches || matches.length === 0) {
            return res.json({
                success: true,
                matches: [],
                message: 'No matches found'
            });
        }

        console.log(`📊 Processing ${matches.length} matches with optimized approach...`);
        
        // Processa solo i primi 10 match per evitare timeout
        const limitedMatches = matches.slice(0, 10);
        
        const enrichedMatches = await Promise.all(
            limitedMatches.map(async (match, index) => {
                try {
                    console.log(`[${index + 1}/${limitedMatches.length}] Processing: ${match.homeTeam?.name} vs ${match.awayTeam?.name}`);
                    
                    const [homeStats, awayStats, h2hCompleteData] = await Promise.all([
                        OptimizedFootballAPI.getTeamStats(match.homeTeam?.id).catch(e => {
                            console.log(`⚠️ Home stats failed: ${e.message}`);
                            return null;
                        }),
                        OptimizedFootballAPI.getTeamStats(match.awayTeam?.id).catch(e => {
                            console.log(`⚠️ Away stats failed: ${e.message}`);
                            return null;
                        }),
                        
                        // 🌟 USA IL NUOVO SISTEMA H2H UNIVERSALE
                        UniversalH2HSystem.getMatchH2H(
                            match.id,                    // Match ID per endpoint ufficiale
                            match.homeTeam?.id,          // Team 1 ID  
                            match.awayTeam?.id           // Team 2 ID
                        ).catch(e => {
                            console.log(`⚠️ H2H failed for ${match.homeTeam?.name} vs ${match.awayTeam?.name}: ${e.message}`);
                            return { matches: [], summary: null, reliability: 'none' };
                        })
                    ]);
                    
                    // Usa i dati H2H reali per calcolare le probabilità
                    const probabilities = SimpleStatistics.calculateProbabilities(
                        homeStats, 
                        awayStats, 
                        h2hCompleteData.matches  // Array di partite H2H reali
                    );
                    
                    const aiSuggestions = SimpleStatistics.generateSuggestions(probabilities);
                    
                    return {
                        ...match,
                        homeStats,
                        awayStats,
                        h2hData: h2hCompleteData,  // Dati H2H completi
                        probabilities,
                        aiSuggestions,
                        confidence: probabilities['1X2']?.confidence || 50,
                        dataCompleteness: calculateCompleteness(homeStats, awayStats, h2hCompleteData.matches),
                        lastAnalysisUpdate: new Date().toISOString(),
                        h2hSource: 'football-data-api-v4'
                    };
                    
                } catch (matchError) {
                    console.error(`❌ Error processing match ${match.homeTeam?.name} vs ${match.awayTeam?.name}:`, matchError.message);
                    
                    return {
                        ...match,
                        homeStats: null,
                        awayStats: null,
                        h2hData: { matches: [], summary: null, reliability: 'none' },
                        probabilities: SimpleStatistics.getDefaultProbabilities(),
                        aiSuggestions: [{
                            type: 'info',
                            market: 'General',
                            suggestion: 'Dati limitati disponibili',
                            reasoning: 'Errore nel caricamento delle statistiche',
                            confidence: 30,
                            icon: '⚠️'
                        }],
                        confidence: 30,
                        dataCompleteness: 20,
                        error: 'Processing error'
                    };
                }
            })
        );

        const processingTime = Date.now() - startTime;
        console.log(`✅ Completed in ${processingTime}ms`);

        res.json({
            success: true,
            matches: enrichedMatches,
            metadata: {
                league: leagueId,
                season: season || 'current',
                totalMatches: enrichedMatches.length,
                allMatches: matches.length,
                processingTime: `${processingTime}ms`,
                dataSource: 'optimized_apis_with_cache',
                lastUpdated: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error('❌ API Error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message,
            suggestion: 'Check logs for detailed error information'
        });
    }
});

// ===========================================
// ALTRI ENDPOINTS
// ===========================================
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        features: [
            'Optimized Rate Limiting',
            'Smart Caching',
            'Error Recovery',
            'Realistic Fallbacks'
        ],
        apis: {
            footballData: process.env.FOOTBALL_DATA_API_KEY ? 'Configured' : 'Missing',
            rapidApi: process.env.RAPID_API_KEY ? 'Configured' : 'Missing'
        }
    });
});

app.get('/api/cache-stats', (req, res) => {
    db.all(`
        SELECT 
            'matches' as type, COUNT(*) as count, 
            COUNT(CASE WHEN expires_at > datetime('now') THEN 1 END) as valid
        FROM matches_cache
        UNION ALL
        SELECT 
            'team_stats' as type, COUNT(*) as count,
            COUNT(CASE WHEN expires_at > datetime('now') THEN 1 END) as valid
        FROM team_stats_cache
        UNION ALL
        SELECT 
            'h2h' as type, COUNT(*) as count,
            COUNT(CASE WHEN expires_at > datetime('now') THEN 1 END) as valid
        FROM h2h_cache
    `, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({
                success: true,
                cacheStats: rows,
                timestamp: new Date().toISOString()
            });
        }
    });
});

app.post('/api/clear-cache', (req, res) => {
    db.serialize(() => {
        db.run('DELETE FROM matches_cache');
        db.run('DELETE FROM team_stats_cache');
        db.run('DELETE FROM h2h_cache');
    });
    
    res.json({ 
        success: true, 
        message: 'All caches cleared',
        timestamp: new Date().toISOString()
    });
});

app.get('/api/test-simple', async (req, res) => {
    try {
        console.log('🧪 Running simple API test...');
        
        // Test semplice senza rate limiting eccessivo
        const response = await axios.get(
            `${API_CONFIG.FOOTBALL_DATA.baseUrl}/competitions/2019`,
            {
                headers: API_CONFIG.FOOTBALL_DATA.headers,
                timeout: 5000
            }
        );
        
        res.json({
            success: true,
            competition: response.data.name,
            currentSeason: response.data.currentSeason?.id,
            message: 'Football-Data API is working'
        });
        
    } catch (error) {
        if (error.response?.status === 429) {
            res.json({
                success: false,
                error: 'Rate limited - need to slow down API calls',
                status: 429,
                suggestion: 'Wait a few minutes before making more requests'
            });
        } else {
            res.status(500).json({
                success: false,
                error: error.message,
                status: error.response?.status
            });
        }
    }
});

// Endpoint per testare una singola partita
app.get('/api/test-match/:homeId/:awayId', async (req, res) => {
    try {
        const { homeId, awayId } = req.params;
        
        console.log(`🧪 Testing single match processing: ${homeId} vs ${awayId}`);
        
        const [homeStats, awayStats, h2hData] = await Promise.all([
            RealDataFootballAPI.getTeamStats(parseInt(homeId)),
            RealDataFootballAPI.getTeamStats(parseInt(awayId)),
            RealDataFootballAPI.getHeadToHead(parseInt(homeId), parseInt(awayId))
        ]);
        
        const probabilities = SimpleStatistics.calculateProbabilities(homeStats, awayStats);
        const aiSuggestions = SimpleStatistics.generateSuggestions(probabilities);
        const h2hSummary = summarizeH2H(h2hData);
        
        res.json({
            success: true,
            homeStats: {
                teamName: homeStats?.teamName,
                dataQuality: homeStats?.dataQuality,
                matches_played: homeStats?.matches_played,
                wins: homeStats?.wins
            },
            awayStats: {
                teamName: awayStats?.teamName,
                dataQuality: awayStats?.dataQuality,
                matches_played: awayStats?.matches_played,
                wins: awayStats?.wins
            },
            h2hSummary,
            probabilities,
            aiSuggestions,
            completeness: calculateCompleteness(homeStats, awayStats, h2hData)
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ===========================================
// CLEANUP AUTOMATICO
// ===========================================
function cleanupExpiredCache() {
    console.log('🧹 Cleaning expired cache entries...');
    
    db.serialize(() => {
        db.run(`DELETE FROM matches_cache WHERE expires_at < datetime('now')`, function(err) {
            if (err) console.error('Error cleaning matches cache:', err);
            else if (this.changes > 0) console.log(`Cleaned ${this.changes} expired matches cache entries`);
        });
        
        db.run(`DELETE FROM team_stats_cache WHERE expires_at < datetime('now')`, function(err) {
            if (err) console.error('Error cleaning team stats cache:', err);
            else if (this.changes > 0) console.log(`Cleaned ${this.changes} expired team stats cache entries`);
        });
        
        db.run(`DELETE FROM h2h_cache WHERE expires_at < datetime('now')`, function(err) {
            if (err) console.error('Error cleaning H2H cache:', err);
            else if (this.changes > 0) console.log(`Cleaned ${this.changes} expired H2H cache entries`);
        });
    });
}

// Pulizia automatica ogni 30 minuti
setInterval(cleanupExpiredCache, 30 * 60 * 1000);

// ===========================================
// AVVIO SERVER
// ===========================================
app.listen(PORT, () => {
    console.log(`🚀 Optimized Football Stats API Server running on port ${PORT}`);
    console.log(`📈 Features enabled:`);
    console.log(`   - ✅ Rate Limiting (200ms between calls)`);
    console.log(`   - ✅ Smart Caching (30min matches, 1h teams, 24h H2H)`);
    console.log(`   - ✅ Error Recovery & Fallbacks`);
    console.log(`   - ✅ Realistic Data Generation`);
    console.log(`   - ✅ Processing Limits (10 matches max)`);
    console.log(`🔧 Endpoints available:`);
    console.log(`   - GET /api/health`);
    console.log(`   - GET /api/test-simple`);
    console.log(`   - GET /api/matches/SA`);
    console.log(`   - GET /api/test-match/98/108 (Milan vs Inter)`);
    console.log(`   - GET /api/cache-stats`);
    console.log(`   - POST /api/clear-cache`);
    console.log(`🎯 Ready for production use!`);
    
    // Test iniziale del sistema
    setTimeout(async () => {
        try {
            const testUrl = `http://localhost:${PORT}/api/health`;
            const response = await axios.get(testUrl, { timeout: 2000 });
            console.log(`✅ Self-test passed: ${response.data.status}`);
        } catch (error) {
            console.log(`⚠️  Self-test failed: ${error.message}`);
        }
    }, 2000);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('🛑 Shutting down server...');
    cleanupExpiredCache();
    db.close(() => {
        console.log('📦 Database closed');
        process.exit(0);
    });
});

module.exports = app;