// initDatabase.js - Inizializzazione completa database SQLite
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'football_data.db');

class DatabaseInitializer {
    constructor() {
        this.db = new sqlite3.Database(DB_PATH);
    }

    async initialize() {
        console.log('🔧 Inizializzazione database SQLite...');
        
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                // 1. Tabella leagues (campionati)
                this.db.run(`CREATE TABLE IF NOT EXISTS leagues (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    country TEXT NOT NULL,
                    flag TEXT,
                    season_start INTEGER,
                    season_end INTEGER,
                    current_matchday INTEGER DEFAULT 1,
                    total_teams INTEGER DEFAULT 20,
                    api_id TEXT,
                    status TEXT DEFAULT 'active',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`, (err) => {
                    if (err) console.error('Error creating leagues table:', err);
                    else console.log('✅ Tabella leagues creata');
                });

                // 2. Tabella matches (partite)
                this.db.run(`CREATE TABLE IF NOT EXISTS matches (
                    id TEXT PRIMARY KEY,
                    season INTEGER NOT NULL,
                    matchday INTEGER,
                    league_id TEXT NOT NULL,
                    home_team_id INTEGER NOT NULL,
                    away_team_id INTEGER NOT NULL,
                    home_team_name TEXT NOT NULL,
                    away_team_name TEXT NOT NULL,
                    match_date TEXT NOT NULL,
                    venue TEXT,
                    referee TEXT,
                    home_score INTEGER DEFAULT NULL,
                    away_score INTEGER DEFAULT NULL,
                    ht_home_score INTEGER DEFAULT NULL,
                    ht_away_score INTEGER DEFAULT NULL,
                    status TEXT DEFAULT 'SCHEDULED',
                    competition_stage TEXT DEFAULT 'REGULAR_SEASON',
                    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                    api_last_fetch DATETIME,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(league_id) REFERENCES leagues(id)
                )`, (err) => {
                    if (err) console.error('Error creating matches table:', err);
                    else console.log('✅ Tabella matches creata');
                });

                // 3. Tabella teams (squadre)
                this.db.run(`CREATE TABLE IF NOT EXISTS teams (
                    id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL UNIQUE,
                    short_name TEXT,
                    tla TEXT, -- Three Letter Abbreviation
                    logo_url TEXT,
                    founded INTEGER,
                    club_colors TEXT,
                    venue TEXT,
                    website TEXT,
                    league_id TEXT,
                    current_elo_rating REAL DEFAULT 1500,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(league_id) REFERENCES leagues(id)
                )`, (err) => {
                    if (err) console.error('Error creating teams table:', err);
                    else console.log('✅ Tabella teams creata');
                });

                // 4. Tabella odds (quote)
                this.db.run(`CREATE TABLE IF NOT EXISTS odds (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    match_id TEXT NOT NULL,
                    market_type TEXT NOT NULL,
                    outcome TEXT NOT NULL,
                    odds_value REAL NOT NULL,
                    bookmaker TEXT DEFAULT 'system',
                    probability REAL,
                    is_value_bet BOOLEAN DEFAULT 0,
                    value_percentage REAL DEFAULT 0,
                    confidence_score REAL DEFAULT 0,
                    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(match_id) REFERENCES matches(id)
                )`, (err) => {
                    if (err) console.error('Error creating odds table:', err);
                    else console.log('✅ Tabella odds creata');
                });

                // 5. Tabella team_stats (statistiche squadre)
                this.db.run(`CREATE TABLE IF NOT EXISTS team_stats (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    team_id INTEGER NOT NULL,
                    team_name TEXT NOT NULL,
                    season INTEGER NOT NULL,
                    league_id TEXT NOT NULL,
                    matches_played INTEGER DEFAULT 0,
                    wins INTEGER DEFAULT 0,
                    draws INTEGER DEFAULT 0,
                    losses INTEGER DEFAULT 0,
                    goals_for INTEGER DEFAULT 0,
                    goals_against INTEGER DEFAULT 0,
                    goal_difference INTEGER DEFAULT 0,
                    points INTEGER DEFAULT 0,
                    home_wins INTEGER DEFAULT 0,
                    home_draws INTEGER DEFAULT 0,
                    home_losses INTEGER DEFAULT 0,
                    home_goals_for INTEGER DEFAULT 0,
                    home_goals_against INTEGER DEFAULT 0,
                    away_wins INTEGER DEFAULT 0,
                    away_draws INTEGER DEFAULT 0,
                    away_losses INTEGER DEFAULT 0,
                    away_goals_for INTEGER DEFAULT 0,
                    away_goals_against INTEGER DEFAULT 0,
                    clean_sheets INTEGER DEFAULT 0,
                    failed_to_score INTEGER DEFAULT 0,
                    btts_count INTEGER DEFAULT 0,
                    over_25_count INTEGER DEFAULT 0,
                    under_25_count INTEGER DEFAULT 0,
                    avg_goals_for REAL DEFAULT 0,
                    avg_goals_against REAL DEFAULT 0,
                    btts_percentage REAL DEFAULT 0,
                    over_25_percentage REAL DEFAULT 0,
                    clean_sheet_percentage REAL DEFAULT 0,
                    win_percentage REAL DEFAULT 0,
                    form_points REAL DEFAULT 0,
                    strength_rating REAL DEFAULT 50,
                    attack_strength REAL DEFAULT 50,
                    defense_strength REAL DEFAULT 50,
                    last_5_form TEXT, -- WWLDW format
                    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(team_id) REFERENCES teams(id),
                    FOREIGN KEY(league_id) REFERENCES leagues(id),
                    UNIQUE(team_id, season, league_id)
                )`, (err) => {
                    if (err) console.error('Error creating team_stats table:', err);
                    else console.log('✅ Tabella team_stats creata');
                });

                // 6. Tabella head_to_head (scontri diretti)
                this.db.run(`CREATE TABLE IF NOT EXISTS head_to_head (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    team1_id INTEGER NOT NULL,
                    team2_id INTEGER NOT NULL,
                    team1_name TEXT NOT NULL,
                    team2_name TEXT NOT NULL,
                    total_matches INTEGER DEFAULT 0,
                    team1_wins INTEGER DEFAULT 0,
                    team2_wins INTEGER DEFAULT 0,
                    draws INTEGER DEFAULT 0,
                    team1_goals INTEGER DEFAULT 0,
                    team2_goals INTEGER DEFAULT 0,
                    recent_matches_json TEXT, -- JSON degli ultimi scontri
                    team1_wins_home INTEGER DEFAULT 0,
                    team1_wins_away INTEGER DEFAULT 0,
                    team2_wins_home INTEGER DEFAULT 0,
                    team2_wins_away INTEGER DEFAULT 0,
                    avg_total_goals REAL DEFAULT 0,
                    btts_percentage REAL DEFAULT 0,
                    over_25_percentage REAL DEFAULT 0,
                    home_advantage_percentage REAL DEFAULT 0,
                    last_meeting_date TEXT,
                    last_meeting_score TEXT,
                    seasons_analyzed INTEGER DEFAULT 5,
                    confidence_score REAL DEFAULT 0,
                    predictive_trend TEXT, -- JSON con trend predittivi
                    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(team1_id) REFERENCES teams(id),
                    FOREIGN KEY(team2_id) REFERENCES teams(id),
                    UNIQUE(team1_id, team2_id)
                )`, (err) => {
                    if (err) console.error('Error creating head_to_head table:', err);
                    else console.log('✅ Tabella head_to_head creata');
                });

                // 7. Tabella value_bets (scommesse di valore)
                this.db.run(`CREATE TABLE IF NOT EXISTS value_bets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    match_id TEXT NOT NULL,
                    home_team TEXT NOT NULL,
                    away_team TEXT NOT NULL,
                    league_id TEXT NOT NULL,
                    match_date TEXT NOT NULL,
                    market_type TEXT NOT NULL,
                    outcome TEXT NOT NULL,
                    bookmaker_odds REAL NOT NULL,
                    fair_odds REAL NOT NULL,
                    real_probability REAL NOT NULL,
                    implied_probability REAL NOT NULL,
                    value_percentage REAL NOT NULL,
                    confidence_score REAL NOT NULL,
                    kelly_percentage REAL DEFAULT 0,
                    expected_roi REAL DEFAULT 0,
                    risk_level TEXT DEFAULT 'medium',
                    bet_size_recommendation REAL DEFAULT 0,
                    status TEXT DEFAULT 'active',
                    notes TEXT,
                    algorithm_version TEXT DEFAULT 'v1.0',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    expires_at DATETIME,
                    FOREIGN KEY(match_id) REFERENCES matches(id),
                    FOREIGN KEY(league_id) REFERENCES leagues(id)
                )`, (err) => {
                    if (err) console.error('Error creating value_bets table:', err);
                    else console.log('✅ Tabella value_bets creata');
                });

                // 8. Tabella predictions (predizioni AI)
                this.db.run(`CREATE TABLE IF NOT EXISTS predictions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    match_id TEXT NOT NULL,
                    home_team_id INTEGER NOT NULL,
                    away_team_id INTEGER NOT NULL,
                    predicted_home_goals REAL NOT NULL,
                    predicted_away_goals REAL NOT NULL,
                    predicted_total_goals REAL NOT NULL,
                    home_win_probability REAL NOT NULL,
                    draw_probability REAL NOT NULL,
                    away_win_probability REAL NOT NULL,
                    btts_probability REAL NOT NULL,
                    over_25_probability REAL NOT NULL,
                    under_25_probability REAL NOT NULL,
                    correct_score_predictions TEXT, -- JSON con probabilità risultati esatti
                    poisson_predictions TEXT, -- JSON con distribuzione Poisson
                    home_clean_sheet_probability REAL DEFAULT 0,
                    away_clean_sheet_probability REAL DEFAULT 0,
                    first_goal_probabilities TEXT, -- JSON con probabilità primo gol
                    model_confidence REAL NOT NULL,
                    algorithm_version TEXT DEFAULT 'v1.0',
                    input_features TEXT, -- JSON con feature utilizzate
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(match_id) REFERENCES matches(id),
                    FOREIGN KEY(home_team_id) REFERENCES teams(id),
                    FOREIGN KEY(away_team_id) REFERENCES teams(id)
                )`, (err) => {
                    if (err) console.error('Error creating predictions table:', err);
                    else console.log('✅ Tabella predictions creata');
                });

                // 9. Tabella bookmakers (bookmaker)
                this.db.run(`CREATE TABLE IF NOT EXISTS bookmakers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    display_name TEXT NOT NULL,
                    country TEXT,
                    website TEXT,
                    api_key TEXT,
                    margin_percentage REAL DEFAULT 5.0,
                    reliability_score REAL DEFAULT 7.0,
                    update_frequency INTEGER DEFAULT 300, -- seconds
                    supported_markets TEXT, -- JSON array
                    is_active BOOLEAN DEFAULT 1,
                    last_update DATETIME,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`, (err) => {
                    if (err) console.error('Error creating bookmakers table:', err);
                    else console.log('✅ Tabella bookmakers creata');
                });

                // Crea indici per ottimizzare le performance
                this.createIndexes();
                
                console.log('🎯 Database inizializzato con successo!');
                resolve();
            });
        });
    }

    createIndexes() {
        console.log('📊 Creazione indici per ottimizzazione...');

        // Indici per matches
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_matches_league_date ON matches(league_id, match_date)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_matches_teams ON matches(home_team_id, away_team_id)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_matches_season ON matches(season, league_id)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status)`);

        // Indici per odds
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_odds_match_market ON odds(match_id, market_type)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_odds_value_bets ON odds(is_value_bet, value_percentage)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_odds_bookmaker ON odds(bookmaker)`);

        // Indici per team_stats
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_team_stats_team_season ON team_stats(team_id, season)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_team_stats_league ON team_stats(league_id, season)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_team_stats_strength ON team_stats(strength_rating)`);

        // Indici per head_to_head
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_h2h_teams ON head_to_head(team1_id, team2_id)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_h2h_confidence ON head_to_head(confidence_score)`);

        // Indici per value_bets
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_value_bets_active ON value_bets(status, value_percentage)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_value_bets_league_date ON value_bets(league_id, match_date)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_value_bets_confidence ON value_bets(confidence_score)`);

        // Indici per predictions
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_predictions_match ON predictions(match_id)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_predictions_confidence ON predictions(model_confidence)`);

        console.log('✅ Indici creati per ottimizzazione performance');
    }

    close() {
        return new Promise((resolve) => {
            this.db.close((err) => {
                if (err) console.error('Error closing database:', err);
                else console.log('📦 Database connection closed');
                resolve();
            });
        });
    }
}

// Esegui inizializzazione se script chiamato direttamente
if (require.main === module) {
    const initializer = new DatabaseInitializer();
    
    initializer.initialize()
        .then(() => {
            console.log('🚀 Inizializzazione completata con successo!');
            return initializer.close();
        })
        .catch((error) => {
            console.error('❌ Errore durante inizializzazione:', error);
            process.exit(1);
        });
}

module.exports = DatabaseInitializer;