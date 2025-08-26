// scripts/initDatabase.js - Inizializzazione corretta per dati persistenti
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = './football_stats.db'; // Cambiato nome per evitare conflitti

class RealDataDatabase {
    constructor() {
        this.db = new sqlite3.Database(DB_PATH);
    }

    async initialize() {
        console.log('🔧 Inizializzazione database per dati reali...');
        
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                // 1. Tabella teams (squadre con ID API reali)
                this.db.run(`CREATE TABLE IF NOT EXISTS teams (
                    id INTEGER PRIMARY KEY,
                    api_id INTEGER UNIQUE NOT NULL,
                    name TEXT NOT NULL,
                    short_name TEXT,
                    tla TEXT,
                    country TEXT,
                    founded INTEGER,
                    venue TEXT,
                    logo_url TEXT,
                    current_league_id TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`, (err) => {
                    if (err) console.error('❌ Error creating teams table:', err);
                    else console.log('✅ Tabella teams creata');
                });

                // 2. Statistiche stagionali REALI (dati persistenti!)
                this.db.run(`CREATE TABLE IF NOT EXISTS team_season_stats (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    team_api_id INTEGER NOT NULL,
                    team_name TEXT NOT NULL,
                    season INTEGER NOT NULL,
                    league_id TEXT NOT NULL,
                    competition_name TEXT,
                    matches_played INTEGER DEFAULT 0,
                    wins INTEGER DEFAULT 0,
                    draws INTEGER DEFAULT 0,
                    losses INTEGER DEFAULT 0,
                    goals_for INTEGER DEFAULT 0,
                    goals_against INTEGER DEFAULT 0,
                    goal_difference INTEGER DEFAULT 0,
                    points INTEGER DEFAULT 0,
                    
                    -- Statistiche Casa
                    home_matches INTEGER DEFAULT 0,
                    home_wins INTEGER DEFAULT 0,
                    home_draws INTEGER DEFAULT 0,
                    home_losses INTEGER DEFAULT 0,
                    home_goals_for INTEGER DEFAULT 0,
                    home_goals_against INTEGER DEFAULT 0,
                    
                    -- Statistiche Trasferta
                    away_matches INTEGER DEFAULT 0,
                    away_wins INTEGER DEFAULT 0,
                    away_draws INTEGER DEFAULT 0,
                    away_losses INTEGER DEFAULT 0,
                    away_goals_for INTEGER DEFAULT 0,
                    away_goals_against INTEGER DEFAULT 0,
                    
                    -- Statistiche Speciali
                    clean_sheets INTEGER DEFAULT 0,
                    failed_to_score INTEGER DEFAULT 0,
                    btts_matches INTEGER DEFAULT 0,
                    over_15_matches INTEGER DEFAULT 0,
                    over_25_matches INTEGER DEFAULT 0,
                    over_35_matches INTEGER DEFAULT 0,
                    under_25_matches INTEGER DEFAULT 0,
                    
                    -- Metadata
                    data_source TEXT DEFAULT 'football_data_api',
                    api_last_fetch DATETIME,
                    is_complete BOOLEAN DEFAULT 1,
                    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    
                    UNIQUE(team_api_id, season, league_id)
                )`, (err) => {
                    if (err) console.error('❌ Error creating team_season_stats table:', err);
                    else console.log('✅ Tabella team_season_stats creata');
                });

                // 3. Head-to-Head matches REALI (scontri storici veri)
                this.db.run(`CREATE TABLE IF NOT EXISTS head_to_head_matches (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    match_api_id INTEGER UNIQUE,
                    team1_api_id INTEGER NOT NULL,
                    team2_api_id INTEGER NOT NULL,
                    team1_name TEXT NOT NULL,
                    team2_name TEXT NOT NULL,
                    
                    -- Dettagli Match
                    match_date TEXT NOT NULL,
                    season INTEGER NOT NULL,
                    matchday INTEGER,
                    home_team_api_id INTEGER NOT NULL,
                    away_team_api_id INTEGER NOT NULL,
                    home_team_name TEXT NOT NULL,
                    away_team_name TEXT NOT NULL,
                    
                    -- Risultato
                    home_goals INTEGER NOT NULL,
                    away_goals INTEGER NOT NULL,
                    total_goals INTEGER GENERATED ALWAYS AS (home_goals + away_goals) STORED,
                    match_result TEXT NOT NULL, -- 'home', 'draw', 'away'
                    is_btts BOOLEAN GENERATED ALWAYS AS (home_goals > 0 AND away_goals > 0) STORED,
                    is_over_25 BOOLEAN GENERATED ALWAYS AS (home_goals + away_goals > 2.5) STORED,
                    
                    -- Metadata
                    competition_name TEXT,
                    competition_type TEXT,
                    venue TEXT,
                    status TEXT DEFAULT 'FINISHED',
                    data_source TEXT DEFAULT 'football_data_api',
                    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    
                    UNIQUE(team1_api_id, team2_api_id, match_date)
                )`, (err) => {
                    if (err) console.error('❌ Error creating head_to_head_matches table:', err);
                    else console.log('✅ Tabella head_to_head_matches creata');
                });

                // 4. Cache API per evitare chiamate eccessive
                this.db.run(`CREATE TABLE IF NOT EXISTS api_cache (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    cache_key TEXT UNIQUE NOT NULL,
                    endpoint TEXT NOT NULL,
                    request_params TEXT, -- JSON
                    response_data TEXT NOT NULL, -- JSON
                    expires_at DATETIME NOT NULL,
                    hit_count INTEGER DEFAULT 1,
                    last_hit DATETIME DEFAULT CURRENT_TIMESTAMP,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`, (err) => {
                    if (err) console.error('❌ Error creating api_cache table:', err);
                    else console.log('✅ Tabella api_cache creata');
                });

                // 5. Competitions (campionati)
                this.db.run(`CREATE TABLE IF NOT EXISTS competitions (
                    id TEXT PRIMARY KEY,
                    api_id INTEGER UNIQUE NOT NULL,
                    name TEXT NOT NULL,
                    code TEXT,
                    type TEXT,
                    country TEXT,
                    country_code TEXT,
                    country_flag TEXT,
                    current_season_id INTEGER,
                    current_matchday INTEGER,
                    total_teams INTEGER DEFAULT 20,
                    total_matchdays INTEGER DEFAULT 38,
                    plan TEXT DEFAULT 'TIER_ONE',
                    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
                )`, (err) => {
                    if (err) console.error('❌ Error creating competitions table:', err);
                    else console.log('✅ Tabella competitions creata');
                });

                // 6. Seasons
                this.db.run(`CREATE TABLE IF NOT EXISTS seasons (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    api_id INTEGER UNIQUE,
                    competition_id TEXT NOT NULL,
                    year INTEGER NOT NULL,
                    start_date TEXT,
                    end_date TEXT,
                    current_matchday INTEGER DEFAULT 1,
                    is_current BOOLEAN DEFAULT 0,
                    winner_name TEXT,
                    total_matches INTEGER,
                    matches_finished INTEGER DEFAULT 0,
                    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(competition_id) REFERENCES competitions(id)
                )`, (err) => {
                    if (err) console.error('❌ Error creating seasons table:', err);
                    else console.log('✅ Tabella seasons creata');
                });

                // 7. Matches attuali (per il frontend)
                this.db.run(`CREATE TABLE IF NOT EXISTS current_matches (
                    id TEXT PRIMARY KEY,
                    api_id INTEGER UNIQUE,
                    competition_id TEXT NOT NULL,
                    season_id INTEGER,
                    matchday INTEGER,
                    status TEXT NOT NULL,
                    utc_date TEXT NOT NULL,
                    home_team_api_id INTEGER NOT NULL,
                    away_team_api_id INTEGER NOT NULL,
                    home_team_name TEXT NOT NULL,
                    away_team_name TEXT NOT NULL,
                    home_score INTEGER,
                    away_score INTEGER,
                    venue TEXT,
                    referee TEXT,
                    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(competition_id) REFERENCES competitions(id)
                )`, (err) => {
                    if (err) console.error('❌ Error creating current_matches table:', err);
                    else console.log('✅ Tabella current_matches creata');
                });

                // 8. Analysis results (per cachare calcoli complessi)
                this.db.run(`CREATE TABLE IF NOT EXISTS analysis_results (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    match_id TEXT NOT NULL,
                    home_team_api_id INTEGER NOT NULL,
                    away_team_api_id INTEGER NOT NULL,
                    analysis_type TEXT NOT NULL, -- 'probabilities', 'suggestions', 'insights'
                    result_data TEXT NOT NULL, -- JSON
                    confidence_score REAL,
                    data_quality_score INTEGER,
                    algorithm_version TEXT DEFAULT 'v1.0',
                    expires_at DATETIME NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(match_id, analysis_type)
                )`, (err) => {
                    if (err) console.error('❌ Error creating analysis_results table:', err);
                    else console.log('✅ Tabella analysis_results creata');
                });

                // Crea indici per performance
                this.createIndexes();
                
                // Inserisci dati iniziali
                this.seedInitialData();
                
                console.log('🎯 Database inizializzato con successo!');
                resolve();
            });
        });
    }

    createIndexes() {
        console.log('📊 Creazione indici per ottimizzazione...');

        // Indici per team_season_stats
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_team_season ON team_season_stats(team_api_id, season DESC)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_league_season ON team_season_stats(league_id, season DESC)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_team_name_season ON team_season_stats(team_name, season DESC)`);

        // Indici per head_to_head_matches
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_h2h_teams ON head_to_head_matches(team1_api_id, team2_api_id)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_h2h_reverse ON head_to_head_matches(team2_api_id, team1_api_id)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_h2h_date ON head_to_head_matches(match_date DESC)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_h2h_season ON head_to_head_matches(season DESC)`);

        // Indici per api_cache
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_cache_key ON api_cache(cache_key)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_cache_expires ON api_cache(expires_at)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_cache_endpoint ON api_cache(endpoint)`);

        // Indici per current_matches
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_matches_competition ON current_matches(competition_id, utc_date)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_matches_teams ON current_matches(home_team_api_id, away_team_api_id)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_matches_date ON current_matches(utc_date)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_matches_status ON current_matches(status)`);

        // Indici per analysis_results
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_analysis_match ON analysis_results(match_id, analysis_type)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_analysis_expires ON analysis_results(expires_at)`);

        console.log('✅ Indici creati per ottimizzazione performance');
    }

    seedInitialData() {
        console.log('🌱 Inserimento dati iniziali...');

        // Inserisci competizioni principali
        const competitions = [
            { id: 'SA', api_id: 2019, name: 'Serie A', code: 'SA', country: 'Italy', country_code: 'IT', country_flag: '🇮🇹' },
            { id: 'PL', api_id: 2021, name: 'Premier League', code: 'PL', country: 'England', country_code: 'GB-ENG', country_flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
            { id: 'BL1', api_id: 2002, name: 'Bundesliga', code: 'BL1', country: 'Germany', country_code: 'DE', country_flag: '🇩🇪' },
            { id: 'FL1', api_id: 2015, name: 'Ligue 1', code: 'FL1', country: 'France', country_code: 'FR', country_flag: '🇫🇷' },
            { id: 'PD', api_id: 2014, name: 'Primera División', code: 'PD', country: 'Spain', country_code: 'ES', country_flag: '🇪🇸' },
            { id: 'DED', api_id: 2003, name: 'Eredivisie', code: 'DED', country: 'Netherlands', country_code: 'NL', country_flag: '🇳🇱' },
            { id: 'PPL', api_id: 2017, name: 'Primeira Liga', code: 'PPL', country: 'Portugal', country_code: 'PT', country_flag: '🇵🇹' },
            { id: 'CL', api_id: 2001, name: 'UEFA Champions League', code: 'CL', country: 'Europe', country_code: 'EU', country_flag: '🌍' }
        ];

        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO competitions 
            (id, api_id, name, code, country, country_code, country_flag) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        competitions.forEach(comp => {
            stmt.run([comp.id, comp.api_id, comp.name, comp.code, comp.country, comp.country_code, comp.country_flag]);
        });

        stmt.finalize();

        // Inserisci stagioni recenti
        const currentYear = new Date().getFullYear();
        const seasonStmt = this.db.prepare(`
            INSERT OR REPLACE INTO seasons 
            (competition_id, year, is_current) 
            VALUES (?, ?, ?)
        `);

        competitions.forEach(comp => {
            for (let year = currentYear - 4; year <= currentYear; year++) {
                const isCurrent = year === currentYear;
                seasonStmt.run([comp.id, year, isCurrent ? 1 : 0]);
            }
        });

        seasonStmt.finalize();

        console.log('✅ Dati iniziali inseriti');
    }

    // Utility methods
    async cleanExpiredCache() {
        return new Promise((resolve) => {
            this.db.run(
                'DELETE FROM api_cache WHERE expires_at < datetime("now")',
                [],
                function(err) {
                    if (err) console.error('❌ Error cleaning cache:', err);
                    else console.log(`🧹 Cleaned ${this.changes} expired cache entries`);
                    resolve();
                }
            );
        });
    }

    async cleanExpiredAnalysis() {
        return new Promise((resolve) => {
            this.db.run(
                'DELETE FROM analysis_results WHERE expires_at < datetime("now")',
                [],
                function(err) {
                    if (err) console.error('❌ Error cleaning analysis:', err);
                    else console.log(`🧹 Cleaned ${this.changes} expired analysis results`);
                    resolve();
                }
            );
        });
    }

    async getDbStats() {
        return new Promise((resolve) => {
            const stats = {};
            
            this.db.serialize(() => {
                this.db.get('SELECT COUNT(*) as count FROM teams', (err, row) => {
                    stats.teams = row?.count || 0;
                });
                
                this.db.get('SELECT COUNT(*) as count FROM team_season_stats', (err, row) => {
                    stats.seasonStats = row?.count || 0;
                });
                
                this.db.get('SELECT COUNT(*) as count FROM head_to_head_matches', (err, row) => {
                    stats.h2hMatches = row?.count || 0;
                });
                
                this.db.get('SELECT COUNT(*) as count FROM api_cache', (err, row) => {
                    stats.cacheEntries = row?.count || 0;
                });
                
                this.db.get('SELECT COUNT(*) as count FROM current_matches', (err, row) => {
                    stats.currentMatches = row?.count || 0;
                    resolve(stats);
                });
            });
        });
    }

    async close() {
        return new Promise((resolve) => {
            this.db.close((err) => {
                if (err) console.error('❌ Error closing database:', err);
                else console.log('📦 Database connection closed');
                resolve();
            });
        });
    }
}

// Helper functions per manutenzione
class DatabaseMaintenance {
    static async performMaintenance() {
        const db = new RealDataDatabase();
        await db.cleanExpiredCache();
        await db.cleanExpiredAnalysis();
        
        const stats = await db.getDbStats();
        console.log('📊 Database Statistics:');
        console.table(stats);
        
        await db.close();
    }

    static async resetDatabase() {
        const fs = require('fs');
        if (fs.existsSync(DB_PATH)) {
            fs.unlinkSync(DB_PATH);
            console.log('🗑️ Database file deleted');
        }
        
        const db = new RealDataDatabase();
        await db.initialize();
        await db.close();
        console.log('🔄 Database reset complete');
    }

    static async backupDatabase() {
        const fs = require('fs');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = `./backups/football_stats_${timestamp}.db`;
        
        // Crea directory backup se non esiste
        if (!fs.existsSync('./backups')) {
            fs.mkdirSync('./backups', { recursive: true });
        }
        
        fs.copyFileSync(DB_PATH, backupPath);
        console.log(`💾 Database backed up to: ${backupPath}`);
    }
}

// Esegui inizializzazione se script chiamato direttamente
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];
    
    if (command === 'reset') {
        DatabaseMaintenance.resetDatabase()
            .then(() => process.exit(0))
            .catch(err => {
                console.error('❌ Reset failed:', err);
                process.exit(1);
            });
    } else if (command === 'maintenance') {
        DatabaseMaintenance.performMaintenance()
            .then(() => process.exit(0))
            .catch(err => {
                console.error('❌ Maintenance failed:', err);
                process.exit(1);
            });
    } else if (command === 'backup') {
        DatabaseMaintenance.backupDatabase()
            .then(() => process.exit(0))
            .catch(err => {
                console.error('❌ Backup failed:', err);
                process.exit(1);
            });
    } else {
        // Inizializzazione standard
        const db = new RealDataDatabase();
        
        db.initialize()
            .then(async () => {
                console.log('🚀 Inizializzazione completata con successo!');
                const stats = await db.getDbStats();
                console.log('📊 Database Statistics:');
                console.table(stats);
                return db.close();
            })
            .catch((error) => {
                console.error('❌ Errore durante inizializzazione:', error);
                process.exit(1);
            });
    }
}

module.exports = { RealDataDatabase, DatabaseMaintenance };