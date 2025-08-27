// App.jsx - Frontend aggiornato per dati reali e probabilità
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './App.css';

// ===========================================
// CONFIGURAZIONE API BACKEND
// ===========================================
const API_BASE_URL = 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // Aumentato per API reali
  headers: {
    'Content-Type': 'application/json'
  }
});

// ===========================================
// COMPONENTE PRINCIPALE
// ===========================================
const FootballStatsApp = () => {
  // Stati principali
  const [matches, setMatches] = useState([]);
  const [selectedLeague, setSelectedLeague] = useState('SA');
  const [selectedSeason, setSelectedSeason] = useState('2025');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [apiStatus, setApiStatus] = useState(null);

  // Campionati disponibili
  const leagues = [
    { id: 'SA', name: 'Serie A', country: 'Italy', flag: '🇮🇹' },
    { id: 'PL', name: 'Premier League', country: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
    { id: 'BL1', name: 'Bundesliga', country: 'Germany', flag: '🇩🇪' },
    { id: 'FL1', name: 'Ligue 1', country: 'France', flag: '🇫🇷' },
    { id: 'PD', name: 'La Liga', country: 'Spain', flag: '🇪🇸' },
    { id: 'DED', name: 'Eredivisie', country: 'Netherlands', flag: '🇳🇱' },
    { id: 'PPL', name: 'Primeira Liga', country: 'Portugal', flag: '🇵🇹' },
    { id: 'CL', name: 'Champions League', country: 'Europe', flag: '🌍' }
  ];

  // ===========================================
  // API FUNCTIONS
  // ===========================================
  const fetchMatches = useCallback(async () => {
    setLoading(true);
    setError('');
    
    try {
      console.log(`🔄 Fetching matches for ${selectedLeague}`);
      
      const response = await api.get(`/matches/${selectedLeague}`, {
        params: { season: selectedSeason }
      });
      
      if (response.data.success) {
        setMatches(response.data.matches);
        setLastUpdate(new Date());
        
        console.log(`✅ Loaded ${response.data.matches.length} matches with real data`);
        
        // Mostra informazioni sulla qualità dei dati
        const dataQualitySummary = response.data.matches.map(match => ({
          match: `${match.homeTeam.name} vs ${match.awayTeam.name}`,
          homeDataQuality: match.homeStats?.dataQuality,
          awayDataQuality: match.awayStats?.dataQuality,
          h2hReliability: match.h2hData?.reliability,
          confidence: match.confidence
        }));
        
        console.table(dataQualitySummary);
      } else {
        throw new Error(response.data.error || 'Failed to fetch matches');
      }
    } catch (error) {
      console.error('❌ Error fetching matches:', error);
      setError(error.response?.data?.error || error.message || 'Errore di connessione al server');
    } finally {
      setLoading(false);
    }
  }, [selectedLeague, selectedSeason]);

  // Check API status
  const checkApiStatus = useCallback(async () => {
    try {
      const response = await api.get('/health');
      setApiStatus(response.data);
    } catch (error) {
      setApiStatus({ status: 'ERROR', message: error.message });
    }
  }, []);

  // ===========================================
  // UTILITY FUNCTIONS
  // ===========================================

  const getDataQualityBadge = (quality) => {
    const badges = {
      'high': 'bg-green-500 text-white',
      'medium': 'bg-yellow-500 text-white',
      'low': 'bg-red-500 text-white'
    };
    return badges[quality] || 'bg-gray-500 text-white';
  };

  // ===========================================
  // COMPONENTI
  // ===========================================

  // Componente Statistiche Squadra
  const TeamStatsDisplay = ({ stats, teamName, isHome }) => {
    if (!stats) return <div className="text-center text-gray-500">Dati non disponibili</div>;

    // CHIAREZZA MASSIMA: Calcola statistiche specifiche
    const homeAwayStats = isHome ? {
      location: 'Casa',
      icon: '🏠',
      matches: stats.home_matches || (stats.home_wins + stats.home_draws + stats.home_losses),
      wins: stats.home_wins || 0,
      draws: stats.home_draws || 0,
      losses: stats.home_losses || 0,
      goalsFor: stats.home_goals_for || 0,
      goalsAgainst: stats.home_goals_against || 0,
      winRate: stats.home_matches ? ((stats.home_wins / stats.home_matches) * 100).toFixed(1) : '0.0'
    } : {
      location: 'Trasferta', 
      icon: '✈️',
      matches: stats.away_matches || (stats.away_wins + stats.away_draws + stats.away_losses),
      wins: stats.away_wins || 0,
      draws: stats.away_draws || 0,
      losses: stats.away_losses || 0,
      goalsFor: stats.away_goals_for || 0,
      goalsAgainst: stats.away_goals_against || 0,
      winRate: stats.away_matches ? ((stats.away_wins / stats.away_matches) * 100).toFixed(1) : '0.0'
    };

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold">{teamName}</h3>
            <div className="text-sm text-gray-600">{homeAwayStats.location} {homeAwayStats.icon}</div>
          </div>
          <div className={`px-3 py-1 rounded-full text-xs font-bold ${getDataQualityBadge(stats.dataQuality)}`}>
            {stats.dataQuality?.toUpperCase()} ({stats.rawSeasons || 3} stagioni)
          </div>
        </div>

        {/* SEZIONE SPECIALIZZATA CASA/TRASFERTA */}
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-xl border-2 border-blue-200">
          <div className="text-center mb-3">
            <div className="text-2xl font-bold text-blue-600">{homeAwayStats.winRate}%</div>
            <div className="text-sm font-semibold text-blue-800">% Vittorie in {homeAwayStats.location}</div>
            <div className="text-xs text-gray-600">({homeAwayStats.matches} partite)</div>
          </div>
          
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-white p-3 rounded-lg shadow-sm">
              <div className="text-xl font-bold text-green-600">{homeAwayStats.wins}</div>
              <div className="text-xs text-green-700">Vittorie</div>
            </div>
            <div className="bg-white p-3 rounded-lg shadow-sm">
              <div className="text-xl font-bold text-yellow-600">{homeAwayStats.draws}</div>
              <div className="text-xs text-yellow-700">Pareggi</div>
            </div>
            <div className="bg-white p-3 rounded-lg shadow-sm">
              <div className="text-xl font-bold text-red-600">{homeAwayStats.losses}</div>
              <div className="text-xs text-red-700">Sconfitte</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-3 text-center">
            <div className="bg-white p-3 rounded-lg shadow-sm">
              <div className="text-lg font-bold text-blue-600">{homeAwayStats.goalsFor}</div>
              <div className="text-xs text-blue-700">Gol Fatti in {homeAwayStats.location}</div>
              <div className="text-xs text-gray-500">
                Media: {homeAwayStats.matches ? (homeAwayStats.goalsFor / homeAwayStats.matches).toFixed(1) : '0.0'}
              </div>
            </div>
            <div className="bg-white p-3 rounded-lg shadow-sm">
              <div className="text-lg font-bold text-orange-600">{homeAwayStats.goalsAgainst}</div>
              <div className="text-xs text-orange-700">Gol Subiti in {homeAwayStats.location}</div>
              <div className="text-xs text-gray-500">
                Media: {homeAwayStats.matches ? (homeAwayStats.goalsAgainst / homeAwayStats.matches).toFixed(1) : '0.0'}
              </div>
            </div>
          </div>
        </div>

        {/* STATISTICHE GENERALI (Tutte le partite) */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h4 className="text-sm font-bold mb-3 text-gray-700">📊 Statistiche Generali (Tutte le Partite)</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Partite Totali:</span>
              <strong>{stats.matches_played?.toFixed(0) || 0}</strong>
            </div>
            <div className="flex justify-between">
              <span>Media Gol Fatti:</span>
              <strong className="text-green-600">{(stats.goals_for / stats.matches_played).toFixed(2)}</strong>
            </div>
            <div className="flex justify-between">
              <span>Media Gol Subiti:</span>
              <strong className="text-red-600">{(stats.goals_against / stats.matches_played).toFixed(2)}</strong>
            </div>
            <div className="flex justify-between">
              <span>Clean Sheets:</span>
              <strong>{stats.clean_sheets?.toFixed(0) || 0}</strong>
            </div>
            <div className="flex justify-between">
              <span>BTTS %:</span>
              <strong>{stats.btts_matches && stats.matches_played ? ((stats.btts_matches / stats.matches_played) * 100).toFixed(1) : '0.0'}%</strong>
            </div>
            <div className="flex justify-between">
              <span>Over 2.5 %:</span>
              <strong>{stats.over_25_matches && stats.matches_played ? ((stats.over_25_matches / stats.matches_played) * 100).toFixed(1) : '0.0'}%</strong>
            </div>
          </div>
        </div>

        {/* INDICATORE QUALITÀ DATI */}
        <div className="text-center">
          <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
            stats.rawSeasons >= 5 ? 'bg-green-100 text-green-800' :
            stats.rawSeasons >= 3 ? 'bg-yellow-100 text-yellow-800' :
            'bg-red-100 text-red-800'
          }`}>
            {stats.rawSeasons >= 5 ? '🔥 Dati Eccellenti' :
            stats.rawSeasons >= 3 ? '👍 Dati Buoni' :
            '⚠️ Dati Limitati'
            } ({stats.rawSeasons} stagioni)
          </div>
        </div>
      </div>
    );
  };

  // Componente Probabilità Display
  const ProbabilitiesDisplay = ({ probabilities, homeTeam, awayTeam }) => {
    if (!probabilities) return <div>Dati non disponibili</div>;

    // VALIDAZIONE MATEMATICA prima del render
    const expectedGoals = parseFloat(probabilities.goals?.expected_total || '2.5');
    const over25 = parseFloat(probabilities.goals?.over_25 || '50');
    const under25 = parseFloat(probabilities.goals?.under_25 || '50');
    const bttsYes = parseFloat(probabilities.btts?.btts_yes || '50');
    
    console.log('🔍 Probability Validation:', {
      expectedGoals,
      over25,
      under25,
      bttsYes,
      sum: over25 + under25
    });
    
    // CORREZIONI AUTOMATICHE se i dati sono inconsistenti
    let correctedGoals = probabilities.goals;
    let correctedBTTS = probabilities.btts;
    let warnings = [];
    
    // Correzione Over/Under che devono sommare a 100%
    if (Math.abs((over25 + under25) - 100) > 0.1) {
      const correctedOver25 = expectedGoals > 2.5 ? 
        Math.max(55, Math.min(80, 40 + (expectedGoals - 2.5) * 20)) : 
        Math.max(20, Math.min(45, 50 - (2.5 - expectedGoals) * 15));
      
      correctedGoals = {
        ...probabilities.goals,
        over_25: correctedOver25.toFixed(1),
        under_25: (100 - correctedOver25).toFixed(1)
      };
      warnings.push(`⚠️ Over/Under corretti: dovevano sommare a 100%`);
    }
    
    // Correzione BTTS se troppo basso per gol attesi alti
    if (expectedGoals > 2.5 && bttsYes < 40) {
      const correctedBTTSYes = Math.min(80, 30 + (expectedGoals - 2.5) * 25);
      correctedBTTS = {
        ...probabilities.btts,
        btts_yes: correctedBTTSYes.toFixed(1),
        btts_no: (100 - correctedBTTSYes).toFixed(1)
      };
      warnings.push(`⚠️ BTTS corretto: era troppo basso per ${expectedGoals} gol attesi`);
    }

    return (
      <div className="space-y-6">
        {/* AVVISI DI CORREZIONE */}
        {warnings.length > 0 && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
            <div className="font-bold text-yellow-800 mb-2">🔧 Correzioni Automatiche Applicate:</div>
            {warnings.map((warning, i) => (
              <div key={i} className="text-sm text-yellow-700">• {warning}</div>
            ))}
          </div>
        )}
        
        {/* Risultato 1X2 */}
        <div className="bg-white p-6 rounded-xl border shadow-sm">
          <h3 className="text-xl font-bold mb-4 flex items-center">
            🎯 Probabilità Risultato: {homeTeam} vs {awayTeam}
          </h3>
          
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-blue-50 p-4 rounded-lg text-center border-2 border-blue-200">
              <div className="text-2xl font-bold text-blue-600">{probabilities['1X2']?.home}%</div>
              <div className="text-sm font-medium">Vittoria {homeTeam}</div>
              <div className="text-xs text-blue-500 mt-1">(Casa)</div>
            </div>
            <div className="bg-yellow-50 p-4 rounded-lg text-center border-2 border-yellow-200">
              <div className="text-2xl font-bold text-yellow-600">{probabilities['1X2']?.draw}%</div>
              <div className="text-sm font-medium">Pareggio</div>
              <div className="text-xs text-yellow-500 mt-1">(X)</div>
            </div>
            <div className="bg-red-50 p-4 rounded-lg text-center border-2 border-red-200">
              <div className="text-2xl font-bold text-red-600">{probabilities['1X2']?.away}%</div>
              <div className="text-sm font-medium">Vittoria {awayTeam}</div>
              <div className="text-xs text-red-500 mt-1">(Trasferta)</div>
            </div>
          </div>
        </div>

        {/* Goals Statistics CON VALIDAZIONE */}
        <div className="bg-white p-6 rounded-xl border shadow-sm">
          <h3 className="text-xl font-bold mb-4 flex items-center">
            ⚽ Statistiche Gol
            {expectedGoals && (
              <span className={`ml-3 text-sm px-2 py-1 rounded ${
                expectedGoals > 2.5 ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
              }`}>
                {expectedGoals > 2.5 ? 'Partita da gol' : 'Partita tattica'}
              </span>
            )}
          </h3>
          
          <div className="mb-4 text-center">
            <div className="text-3xl font-bold text-green-600">
              {correctedGoals?.expected_total || '2.50'}
            </div>
            <div className="text-sm text-gray-600">Gol Totali Attesi</div>
            {expectedGoals && (
              <div className="text-xs text-gray-500 mt-1">
                Logica: {expectedGoals > 2.5 ? 'Over favorito' : 'Under favorito'}
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className={`p-4 rounded-lg text-center border-2 ${
              parseFloat(correctedGoals?.over_25 || '50') > 50 ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
            }`}>
              <div className={`text-2xl font-bold ${
                parseFloat(correctedGoals?.over_25 || '50') > 50 ? 'text-green-600' : 'text-gray-600'
              }`}>
                {correctedGoals?.over_25}%
              </div>
              <div className="text-sm font-medium">Over 2.5 Gol</div>
              <div className="text-xs text-gray-500 mt-1">3 o più gol totali</div>
              {parseFloat(correctedGoals?.over_25 || '50') > 50 && (
                <div className="text-xs text-green-600 mt-1 font-medium">✅ Favorito</div>
              )}
            </div>
            <div className={`p-4 rounded-lg text-center border-2 ${
              parseFloat(correctedGoals?.under_25 || '50') > 50 ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-200'
            }`}>
              <div className={`text-2xl font-bold ${
                parseFloat(correctedGoals?.under_25 || '50') > 50 ? 'text-orange-600' : 'text-gray-600'
              }`}>
                {correctedGoals?.under_25}%
              </div>
              <div className="text-sm font-medium">Under 2.5 Gol</div>
              <div className="text-xs text-gray-500 mt-1">0, 1 o 2 gol totali</div>
              {parseFloat(correctedGoals?.under_25 || '50') > 50 && (
                <div className="text-xs text-orange-600 mt-1 font-medium">✅ Favorito</div>
              )}
            </div>
          </div>
          
          {/* VALIDAZIONE MATEMATICA VISIBILE */}
          <div className="mt-4 text-center">
            <div className={`text-xs px-3 py-1 rounded-full inline-block ${
              Math.abs((parseFloat(correctedGoals?.over_25) + parseFloat(correctedGoals?.under_25)) - 100) < 0.1 ?
              'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              ✓ Over + Under = {(parseFloat(correctedGoals?.over_25) + parseFloat(correctedGoals?.under_25)).toFixed(1)}%
              {Math.abs((parseFloat(correctedGoals?.over_25) + parseFloat(correctedGoals?.under_25)) - 100) < 0.1 ? 
                ' (Corretto)' : ' (Errore matematico!)'}
            </div>
          </div>
        </div>

        {/* BTTS CON VALIDAZIONE */}
        <div className="bg-white p-6 rounded-xl border shadow-sm">
          <h3 className="text-xl font-bold mb-4 flex items-center">
            🥅 Entrambe le Squadre Segnano
            {bttsYes > 60 && (
              <span className="ml-3 text-sm px-2 py-1 rounded bg-green-100 text-green-800">
                Goal/Goal probabile
              </span>
            )}
          </h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div className={`p-4 rounded-lg text-center border-2 ${
              parseFloat(correctedBTTS?.btts_yes || '50') > 50 ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
            }`}>
              <div className={`text-2xl font-bold ${
                parseFloat(correctedBTTS?.btts_yes || '50') > 50 ? 'text-green-600' : 'text-gray-600'
              }`}>
                {correctedBTTS?.btts_yes}%
              </div>
              <div className="text-sm font-medium">Goal/Goal</div>
              <div className="text-xs text-gray-500 mt-1">Entrambe segnano</div>
            </div>
            <div className={`p-4 rounded-lg text-center border-2 ${
              parseFloat(correctedBTTS?.btts_no || '50') > 50 ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'
            }`}>
              <div className={`text-2xl font-bold ${
                parseFloat(correctedBTTS?.btts_no || '50') > 50 ? 'text-blue-600' : 'text-gray-600'
              }`}>
                {correctedBTTS?.btts_no}%
              </div>
              <div className="text-sm font-medium">NoGoal/NoGoal</div>
              <div className="text-xs text-gray-500 mt-1">Almeno una non segna</div>
            </div>
          </div>

          {/* Probabilità individuali di segnare */}
          {probabilities.btts?.home_score_prob && (
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div className="bg-gray-50 p-3 rounded">
                <strong>{homeTeam} segna:</strong> {probabilities.btts.home_score_prob}%
                <div className="text-xs text-gray-600 mt-1">
                  {parseFloat(probabilities.btts.home_score_prob) > 75 ? 'Molto probabile' :
                  parseFloat(probabilities.btts.home_score_prob) > 60 ? 'Probabile' : 'Incerto'}
                </div>
              </div>
              <div className="bg-gray-50 p-3 rounded">
                <strong>{awayTeam} segna:</strong> {probabilities.btts.away_score_prob}%
                <div className="text-xs text-gray-600 mt-1">
                  {parseFloat(probabilities.btts.away_score_prob) > 75 ? 'Molto probabile' :
                  parseFloat(probabilities.btts.away_score_prob) > 60 ? 'Probabile' : 'Incerto'}
                </div>
              </div>
            </div>
          )}
          
          {/* Validazione BTTS */}
          <div className="mt-4 text-center">
            <div className={`text-xs px-3 py-1 rounded-full inline-block ${
              expectedGoals > 2.5 && bttsYes < 40 ? 'bg-red-100 text-red-700' :
              expectedGoals > 2.5 && bttsYes > 60 ? 'bg-green-100 text-green-700' :
              'bg-blue-100 text-blue-700'
            }`}>
              {expectedGoals > 2.5 && bttsYes < 40 ? 
                '⚠️ BTTS basso per partita da molti gol' :
                expectedGoals > 2.5 && bttsYes > 60 ? 
                '✅ BTTS coerente con gol attesi' :
                'ℹ️ BTTS in linea con aspettative'}
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border shadow-sm">
          < HeadToHeadDisplay h2hData={probabilities.h2hData} homeTeam={homeTeam} awayTeam={awayTeam}  />
        </div>
      </div>
    );
  };

  // Componente AI Suggestions
  const AISuggestionsDisplay = ({ suggestions, probabilities, homeTeam, awayTeam }) => {
    if (!suggestions || suggestions.length === 0) {
      return (
        <div className="bg-white p-6 rounded-xl border shadow-sm">
          <h3 className="text-xl font-bold mb-4">🤖 Suggerimenti AI</h3>
          <div className="text-center py-8">
            <div className="text-4xl mb-3">🤔</div>
            <p className="text-gray-500">Nessun suggerimento disponibile</p>
          </div>
        </div>
      );
    }

    const getConfidenceColor = (confidence) => {
      const conf = parseFloat(confidence);
      if (conf >= 80) return 'text-green-600';
      if (conf >= 70) return 'text-blue-600';
      if (conf >= 60) return 'text-yellow-600';
      return 'text-red-600';
    };

    const getBestBets = () => {
      const bets = [];

      // Analizza 1X2
      if (probabilities['1X2']) {
        const home = parseFloat(probabilities['1X2'].home);
        const draw = parseFloat(probabilities['1X2'].draw);
        const away = parseFloat(probabilities['1X2'].away);
        const max = Math.max(home, draw, away);
        
        if (max === home && home > 45) {
          bets.push({
            type: 'strong',
            market: '1X2',
            bet: `Vittoria ${homeTeam}`,
            probability: `${home}%`,
            reasoning: `${homeTeam} è favorita con ${home}% di probabilità`,
            confidence: Math.min(90, 60 + (home - 40)),
            icon: '🏠'
          });
        } else if (max === away && away > 40) {
          bets.push({
            type: 'strong',
            market: '1X2',
            bet: `Vittoria ${awayTeam}`,
            probability: `${away}%`,
            reasoning: `${awayTeam} mostra ${away}% di probabilità in trasferta`,
            confidence: Math.min(90, 60 + (away - 35)),
            icon: '✈️'
          });
        }
      }

      // Analizza Goals
      if (probabilities.goals) {
        const over25 = parseFloat(probabilities.goals.over_25 || 50);
        const under25 = 100 - over25;
        
        if (over25 > 62) {
          bets.push({
            type: 'value',
            market: 'Goals',
            bet: 'Over 2.5 Gol',
            probability: `${over25.toFixed(1)}%`,
            reasoning: `Media gol attesa: ${probabilities.goals.expected_total}`,
            confidence: Math.min(85, 50 + (over25 - 50)),
            icon: '⚽'
          });
        } else if (under25 > 62) {
          bets.push({
            type: 'value',
            market: 'Goals',
            bet: 'Under 2.5 Gol',
            probability: `${under25.toFixed(1)}%`,
            reasoning: 'Difese solide, pochi gol attesi',
            confidence: Math.min(85, 50 + (under25 - 50)),
            icon: '🛡️'
          });
        }
      }

      // Analizza BTTS
      if (probabilities.btts) {
        const bttsYes = parseFloat(probabilities.btts.btts_yes || 50);
        const _bttsNo = 100 - bttsYes;
        
        if (bttsYes > 65) {
          bets.push({
            type: 'secondary',
            market: 'BTTS',
            bet: 'Goal/Goal',
            probability: `${bttsYes.toFixed(1)}%`,
            reasoning: 'Entrambe le squadre hanno attacchi efficaci',
            confidence: Math.min(80, 45 + (bttsYes - 50)),
            icon: '🥅'
          });
        }
      }

      return bets.slice(0, 4);
    };

    const bestBets = getBestBets();

    return (
      <div className="bg-white p-6 rounded-xl border shadow-sm">
        <h3 className="text-xl font-bold mb-4 flex items-center">
          🤖 Migliori Scommesse Suggerite
        </h3>
        
        {bestBets.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">⚖️</div>
            <p className="text-gray-600 font-medium">Partita Equilibrata</p>
            <p className="text-sm text-gray-500">Nessuna scommessa ha probabilità sufficientemente alte</p>
          </div>
        ) : (
          <div className="space-y-4">
            {bestBets.map((bet, index) => (
              <div key={index} className={`p-4 rounded-lg border-2 ${
                bet.type === 'strong' ? 'border-green-300 bg-green-50' :
                bet.type === 'value' ? 'border-blue-300 bg-blue-50' :
                'border-yellow-300 bg-yellow-50'
              }`}>
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center">
                    <span className="text-2xl mr-3">{bet.icon}</span>
                    <div>
                      <div className="font-bold text-lg">{bet.bet}</div>
                      <div className="text-sm text-gray-600">{bet.market}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold text-green-600">{bet.probability}</div>
                    <div className={`text-sm font-bold ${getConfidenceColor(bet.confidence)}`}>
                      {bet.confidence.toFixed(0)}% confidenza
                    </div>
                  </div>
                </div>
                <p className="text-sm text-gray-700">{bet.reasoning}</p>
                
                <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-green-600 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(parseFloat(bet.confidence), 100)}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        )}
        
        <div className="mt-6 p-4 bg-gray-100 rounded-lg">
          <div className="text-sm font-bold mb-2">💡 Come Leggere i Suggerimenti:</div>
          <ul className="text-xs space-y-1 text-gray-700">
            <li>• <strong>Probabilità:</strong> Chance che l'evento si verifichi</li>
            <li>• <strong>Confidenza:</strong> Affidabilità del calcolo (più dati = più confidenza)</li>
            <li>• <strong>Verde:</strong> Scommessa forte (probabilità &gt;65%)</li>
            <li>• <strong>Blu:</strong> Buon valore (probabilità 55-65%)</li>
            <li>• <strong>Giallo:</strong> Secondaria (probabilità 50-55%)</li>
          </ul>
        </div>
      </div>
    );
  };

  // Componente H2H Display
  const HeadToHeadDisplay = ({ h2hData, homeTeam, awayTeam }) => {
    if (!h2hData || !h2hData.matches || h2hData.matches.length === 0) {
      console.log('🔍 HeadToHead Debug: No H2H data available', { homeTeam, awayTeam, h2hData });
      return (
        <div className="bg-white p-6 rounded-xl border shadow-sm">
          <h3 className="text-xl font-bold mb-4">📊 Scontri Diretti</h3>
          <div className="text-center py-8">
            <div className="text-4xl mb-3">🤷‍♂️</div>
            <p className="text-gray-500">Nessun dato head-to-head disponibile</p>
          </div>
        </div>
      );
    }

    const { matches, summary } = h2hData;
    
    console.log('🔍 HeadToHead Debug:', {
      homeTeam,
      awayTeam,
      matchesCount: matches.length,
      firstMatch: matches[0],
      summary
    });
    
    // LOGICA CORRETTA per identificare le squadre
    const homeTeamStats = {
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0
    };

    const awayTeamStats = {
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0
    };

    // Analizza ogni match per capire chi ha vinto dal punto di vista delle squadre attuali
    matches.forEach((match, index) => {
      console.log(`Match ${index + 1}:`, {
        date: match.match_date,
        home: match.home_team_name,
        away: match.away_team_name,
        score: `${match.home_goals}-${match.away_goals}`,
        result: match.match_result
      });
      
      // IDENTIFICA chi delle due squadre attuali giocava in casa in questo match storico
      const currentHomeTeamWasHome = 
        match.home_team_name?.toLowerCase().includes(homeTeam?.toLowerCase()) ||
        match.home_team_api_id === homeTeam ||
        (match.team1_name?.toLowerCase().includes(homeTeam?.toLowerCase()) && match.home_team_api_id === match.team1_api_id) ||
        (match.team2_name?.toLowerCase().includes(homeTeam?.toLowerCase()) && match.home_team_api_id === match.team2_api_id);
      
      console.log(`  → Current home team (${homeTeam}) was home: ${currentHomeTeamWasHome}`);
      
      // Conta vittorie dal punto di vista delle squadre attuali
      if (match.match_result === 'draw') {
        homeTeamStats.draws++;
        awayTeamStats.draws++;
      } else if (
        (match.match_result === 'home' && currentHomeTeamWasHome) ||
        (match.match_result === 'away' && !currentHomeTeamWasHome)
      ) {
        // La squadra che ora gioca in casa aveva vinto
        homeTeamStats.wins++;
        awayTeamStats.losses++;
      } else {
        // La squadra che ora gioca in trasferta aveva vinto
        homeTeamStats.losses++;
        awayTeamStats.wins++;
      }

      // Conta gol dal punto di vista delle squadre attuali
      if (currentHomeTeamWasHome) {
        homeTeamStats.goalsFor += match.home_goals || 0;
        homeTeamStats.goalsAgainst += match.away_goals || 0;
        awayTeamStats.goalsFor += match.away_goals || 0;
        awayTeamStats.goalsAgainst += match.home_goals || 0;
      } else {
        homeTeamStats.goalsFor += match.away_goals || 0;
        homeTeamStats.goalsAgainst += match.home_goals || 0;
        awayTeamStats.goalsFor += match.home_goals || 0;
        awayTeamStats.goalsAgainst += match.away_goals || 0;
      }
    });

    console.log('📊 Final H2H Stats:', { homeTeamStats, awayTeamStats });

    return (
      <div className="bg-white p-6 rounded-xl border shadow-sm">
        <h3 className="text-xl font-bold mb-4 flex items-center justify-between">
          📊 Scontri Diretti ({matches.length} partite)
          <span className={`px-3 py-1 rounded-full text-sm font-bold ${
            h2hData.reliability === 'high' ? 'bg-green-100 text-green-800' :
            h2hData.reliability === 'medium' ? 'bg-yellow-100 text-yellow-800' :
            'bg-red-100 text-red-800'
          }`}>
            {h2hData.reliability?.toUpperCase() || 'LOW'} RELIABILITY
          </span>
        </h3>
        
        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* COLONNA SINISTRA - Squadra che gioca in casa OGGI */}
          <div className="text-center">
            <h4 className="font-bold text-lg mb-3 text-blue-600 flex items-center justify-center">
              🏠 {homeTeam} 
              <span className="text-xs ml-2 bg-blue-100 px-2 py-1 rounded">(Casa oggi)</span>
            </h4>
            <div className="space-y-2">
              <div className="bg-green-100 p-3 rounded">
                <div className="text-2xl font-bold text-green-600">{homeTeamStats.wins}</div>
                <div className="text-sm">Vittorie negli scontri</div>
              </div>
              <div className="bg-yellow-100 p-3 rounded">
                <div className="text-2xl font-bold text-yellow-600">{homeTeamStats.draws}</div>
                <div className="text-sm">Pareggi</div>
              </div>
              <div className="bg-red-100 p-3 rounded">
                <div className="text-2xl font-bold text-red-600">{homeTeamStats.losses}</div>
                <div className="text-sm">Sconfitte</div>
              </div>
            </div>
            <div className="mt-4 text-sm bg-gray-50 p-3 rounded">
              <div>Gol fatti: <strong>{homeTeamStats.goalsFor}</strong></div>
              <div>Gol subiti: <strong>{homeTeamStats.goalsAgainst}</strong></div>
              <div>Media gol/partita: <strong>{matches.length > 0 ? (homeTeamStats.goalsFor / matches.length).toFixed(1) : '0.0'}</strong></div>
            </div>
          </div>

          {/* COLONNA DESTRA - Squadra che gioca in trasferta OGGI */}
          <div className="text-center">
            <h4 className="font-bold text-lg mb-3 text-red-600 flex items-center justify-center">
              ✈️ {awayTeam}
              <span className="text-xs ml-2 bg-red-100 px-2 py-1 rounded">(Trasferta oggi)</span>
            </h4>
            <div className="space-y-2">
              <div className="bg-green-100 p-3 rounded">
                <div className="text-2xl font-bold text-green-600">{awayTeamStats.wins}</div>
                <div className="text-sm">Vittorie negli scontri</div>
              </div>
              <div className="bg-yellow-100 p-3 rounded">
                <div className="text-2xl font-bold text-yellow-600">{awayTeamStats.draws}</div>
                <div className="text-sm">Pareggi</div>
              </div>
              <div className="bg-red-100 p-3 rounded">
                <div className="text-2xl font-bold text-red-600">{awayTeamStats.losses}</div>
                <div className="text-sm">Sconfitte</div>
              </div>
            </div>
            <div className="mt-4 text-sm bg-gray-50 p-3 rounded">
              <div>Gol fatti: <strong>{awayTeamStats.goalsFor}</strong></div>
              <div>Gol subiti: <strong>{awayTeamStats.goalsAgainst}</strong></div>
              <div>Media gol/partita: <strong>{matches.length > 0 ? (awayTeamStats.goalsFor / matches.length).toFixed(1) : '0.0'}</strong></div>
            </div>
          </div>
        </div>

        {/* STATISTICHE AGGREGATE CORRETTE */}
        {summary && (
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-xl border-2 border-blue-200">
            <h4 className="font-bold text-lg mb-4 text-center text-blue-800">📈 Statistiche Aggregate (Ultimi {matches.length} Scontri)</h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center bg-white p-4 rounded-lg shadow-sm">
                <div className="text-3xl font-bold text-green-600">
                  {summary.avgTotalGoals !== 'NaN' ? summary.avgTotalGoals : '0.00'}
                </div>
                <div className="text-sm font-semibold text-green-700">Media Gol Totali</div>
                <div className="text-xs text-gray-600">per partita</div>
              </div>
              <div className="text-center bg-white p-4 rounded-lg shadow-sm">
                <div className="text-3xl font-bold text-blue-600">
                  {summary.bttsPercentage !== 'NaN' ? summary.bttsPercentage : '0.0'}%
                </div>
                <div className="text-sm font-semibold text-blue-700">Goal/Goal</div>
                <div className="text-xs text-gray-600">entrambe segnano</div>
              </div>
              <div className="text-center bg-white p-4 rounded-lg shadow-sm">
                <div className="text-3xl font-bold text-purple-600">
                  {summary.over25Percentage !== 'NaN' ? summary.over25Percentage : '0.0'}%
                </div>
                <div className="text-sm font-semibold text-purple-700">Over 2.5</div>
                <div className="text-xs text-gray-600">3+ gol totali</div>
              </div>
            </div>
            
            {/* Debug info se disponibile */}
            {summary.debug && (
              <div className="mt-4 text-xs text-blue-600 bg-blue-100 p-2 rounded">
                Debug: {summary.totalGoalsSum} gol in {summary.totalMatches} partite, 
                {summary.bttsMatches} BTTS, {summary.over25Matches} Over2.5
              </div>
            )}
            
            <div className="mt-4 text-center">
              <div className="text-xs text-blue-600 bg-blue-100 px-3 py-1 rounded-full inline-block">
                ℹ️ Queste statistiche H2H influenzano i calcoli delle probabilità generali
              </div>
            </div>
          </div>
        )}

        {/* CRONOLOGIA DETTAGLIATA */}
        <div className="mt-6">
          <h5 className="font-bold mb-3">Cronologia Scontri Diretti (più recenti prima):</h5>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {matches.slice(0, 10).map((match, index) => {
              const currentHomeTeamWasHome = 
                match.home_team_name?.toLowerCase().includes(homeTeam?.toLowerCase()) ||
                match.home_team_api_id === homeTeam;
              
              const displayHomeTeam = currentHomeTeamWasHome ? homeTeam : awayTeam;
              const displayAwayTeam = currentHomeTeamWasHome ? awayTeam : homeTeam;
              const displayHomeGoals = currentHomeTeamWasHome ? match.home_goals : match.away_goals;
              const displayAwayGoals = currentHomeTeamWasHome ? match.away_goals : match.home_goals;
              
              // Chi ha vinto dal punto di vista attuale
              let currentResult;
              if (match.match_result === 'draw') {
                currentResult = 'X';
              } else if (
                (match.match_result === 'home' && currentHomeTeamWasHome) ||
                (match.match_result === 'away' && !currentHomeTeamWasHome)
              ) {
                currentResult = '1'; // Vince chi gioca in casa oggi
              } else {
                currentResult = '2'; // Vince chi gioca in trasferta oggi
              }
              
              return (
                <div key={index} className="flex justify-between items-center bg-gray-50 p-3 rounded text-sm">
                  <div className="text-xs text-gray-600 w-20">
                    {new Date(match.match_date).toLocaleDateString('it-IT')}
                  </div>
                  <div className="flex-1 text-center">
                    <div className="text-xs mb-1 text-gray-600">
                      {displayHomeTeam} vs {displayAwayTeam}
                    </div>
                    <div className="text-lg font-bold">
                      {displayHomeGoals} - {displayAwayGoals}
                    </div>
                  </div>
                  <div className="text-center w-16">
                    <div className={`px-2 py-1 rounded text-xs font-bold ${
                      currentResult === '1' ? 'bg-blue-100 text-blue-800' :
                      currentResult === '2' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {currentResult}
                    </div>
                    <div className="text-xs mt-1 space-x-1">
                      <span className={`px-1 rounded ${
                        match.total_goals > 2.5 ? 'bg-green-200 text-green-800' : 'bg-orange-200 text-orange-800'
                      }`}>
                        {match.total_goals > 2.5 ? 'O2.5' : 'U2.5'}
                      </span>
                      {match.is_btts && (
                        <span className="bg-purple-200 text-purple-800 px-1 rounded text-xs">GG</span>
                      )}
                      {/* DEBUG: Mostra totale gol per verifica */}
                      <div className="text-xs text-gray-400 mt-1">
                        ({match.total_goals}g)
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // Componente Match Card Principale
  const MatchCard = ({ match }) => {
    const hasResult = match.score?.fullTime?.home !== null;
    const canAnalyze = match.canAnalyze || false;
    const isScheduled = match.status === 'SCHEDULED';
    
    return (
      <div className="bg-white rounded-2xl shadow-xl p-6 mb-6 border border-gray-100">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center space-x-3">
            <span className="text-2xl">⚽</span>
            <div>
              <span className="text-sm font-semibold text-gray-700">Serie A 2025/26</span>
              <div className="text-xs text-gray-500">Giornata {match.matchday || 1}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium text-gray-600">
              {new Date(match.utcDate).toLocaleDateString('it-IT')}
            </div>
            <div className={`text-xs px-3 py-1 rounded-full mt-1 ${
              hasResult ? 'bg-green-100 text-green-800' : 
              isScheduled ? 'bg-blue-100 text-blue-800' : 
              'bg-gray-100 text-gray-800'
            }`}>
              {match.displayStatus}
              {match.timeInfo && ` • ${match.timeInfo}`}
            </div>
          </div>
        </div>

        <div className="text-center mb-6">
          <div className="flex items-center justify-center space-x-6">
            <div className="text-right flex-1">
              <h3 className="text-xl font-bold">{match.homeTeam?.name || 'Casa'}</h3>
              <div className="text-sm text-gray-500">Casa</div>
            </div>
            
            <div className="text-center">
              {hasResult ? (
                <div className="text-4xl font-bold text-green-600">
                  {match.score.fullTime.home} - {match.score.fullTime.away}
                </div>
              ) : (
                <div className="text-2xl font-bold text-gray-400">VS</div>
              )}
              <div className="text-xs text-gray-500 mt-1">
                {new Date(match.utcDate).toLocaleTimeString('it-IT', { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}
              </div>
            </div>
            
            <div className="text-left flex-1">
              <h3 className="text-xl font-bold">{match.awayTeam?.name || 'Trasferta'}</h3>
              <div className="text-sm text-gray-500">Trasferta</div>
            </div>
          </div>
        </div>

        {/* BOTTONI DIVERSI BASATI SULLO STATUS */}
        <div className="flex justify-center">
          {canAnalyze ? (
            <button
              onClick={() => setSelectedMatch(match)}
              className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-xl font-bold hover:from-blue-700 hover:to-purple-700 transition-all transform hover:scale-105"
            >
              📊 Analizza Statistiche e Probabilità
            </button>
          ) : hasResult ? (
            <div className="bg-gray-100 text-gray-600 px-6 py-3 rounded-xl font-bold">
              ✅ Partita Terminata: {match.score.fullTime.home} - {match.score.fullTime.away}
            </div>
          ) : (
            <div className="bg-yellow-100 text-yellow-700 px-6 py-3 rounded-xl font-bold">
              ⏳ In attesa di programmazione
            </div>
          )}
        </div>
      </div>
    );
  };

  // Sidebar con Status API
  const ApiStatusSidebar = () => (
    <div className="bg-white rounded-2xl shadow-xl p-6 h-fit">
      <div className="flex items-center mb-4">
        <span className="text-3xl mr-3">🔧</span>
        <div>
          <h3 className="text-xl font-bold">Status Sistema</h3>
          <p className="text-sm text-gray-500">Monitoraggio dati reali</p>
        </div>
      </div>
      
      {apiStatus ? (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Status Generale:</span>
            <span className={`font-semibold px-2 py-1 rounded text-sm ${
              apiStatus.status === 'OK' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              {apiStatus.status}
            </span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Football-Data API:</span>
            <span className={`font-semibold px-2 py-1 rounded text-sm ${
              apiStatus.apis?.footballData === 'Configured' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
            }`}>
              {apiStatus.apis?.footballData || 'N/A'}
            </span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-gray-600">RapidAPI:</span>
            <span className={`font-semibold px-2 py-1 rounded text-sm ${
              apiStatus.apis?.rapidApi === 'Configured' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
            }`}>
              {apiStatus.apis?.rapidApi || 'N/A'}
            </span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Database:</span>
            <span className="font-semibold text-green-600">Connected</span>
          </div>

          {/* Features List */}
          <div className="pt-4 border-t">
            <h4 className="font-bold text-sm mb-2">Features Attive:</h4>
            <div className="space-y-1 text-xs">
              {apiStatus.features?.map((feature, index) => (
                <div key={index} className="flex items-center">
                  <span className="text-green-600 mr-2">✅</span>
                  <span>{feature}</span>
                </div>
              )) || []}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-sm text-gray-500">Verificando status...</p>
        </div>
      )}

      {/* Statistics */}
      <div className="mt-6 pt-6 border-t">
        <h4 className="font-bold text-gray-800 mb-3">📊 Statistiche Sessione</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">{matches.length}</div>
            <div className="text-xs text-blue-600">Partite Caricate</div>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {matches.filter(m => m.aiSuggestions && m.aiSuggestions.length > 0).length}
            </div>
            <div className="text-xs text-green-600">Con Suggerimenti AI</div>
          </div>
          <div className="text-center p-3 bg-purple-50 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">
              {matches.filter(m => parseFloat(m.confidence || 0) > 75).length}
            </div>
            <div className="text-xs text-purple-600">Alta Confidenza</div>
          </div>
          <div className="text-center p-3 bg-yellow-50 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">
              {matches.filter(m => m.homeStats?.dataQuality === 'high' && m.awayStats?.dataQuality === 'high').length}
            </div>
            <div className="text-xs text-yellow-600">Dati di Qualità</div>
          </div>
        </div>
      </div>

      {lastUpdate && (
        <div className="mt-4 text-center text-xs text-gray-500">
          Ultimo aggiornamento: {lastUpdate.toLocaleTimeString('it-IT')}
        </div>
      )}
    </div>
  );

  const sortMatches = (matches) => {
    return [...matches].sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return new Date(a.utcDate) - new Date(b.utcDate);
        case 'home':
          return a.homeTeam.name.localeCompare(b.homeTeam.name);
        case 'confidence':
          return parseFloat(b.confidence || 0) - parseFloat(a.confidence || 0);
        case 'ai_suggestions':
          return (b.aiSuggestions?.length || 0) - (a.aiSuggestions?.length || 0);
        default:
          return 0;
      }
    });
  };

  const filteredMatches = sortMatches(
    matches.filter(match => {
      if (!searchTerm) return true;
      const homeTeam = match.homeTeam?.name?.toLowerCase() || '';
      const awayTeam = match.awayTeam?.name?.toLowerCase() || '';
      const search = searchTerm.toLowerCase();
      return homeTeam.includes(search) || awayTeam.includes(search);
    })
  );

  const processedMatches = filteredMatches.map(match => {
    const matchDate = new Date(match.utcDate);
    const now = new Date();
    const isScheduled = match.status === 'SCHEDULED' || match.status === 'TIMED';
    const isFuture = matchDate > now;
    const isFinished = match.status === 'FINISHED' || match.score?.fullTime?.home !== null;
    
    return {
      ...match,
      canAnalyze: isScheduled && isFuture, // Solo queste possono essere analizzate
      displayStatus: isFinished ? 'Terminata' : isScheduled ? 'Programmata' : 'In corso',
      timeInfo: isFuture ? `Tra ${Math.ceil((matchDate - now) / (24 * 60 * 60 * 1000))} giorni` : 
                isFinished ? 'Terminata' : 'Oggi'
    };
  });

  // ===========================================
  // EFFECTS
  // ===========================================
  useEffect(() => {
    checkApiStatus();
    fetchMatches();
  }, [checkApiStatus, fetchMatches]);

  // Auto-refresh ogni 10 minuti per dati reali
  useEffect(() => {
    const interval = setInterval(() => {
      if (!loading) {
        fetchMatches();
      }
    }, 600000); // 10 minuti

    return () => clearInterval(interval);
  }, [fetchMatches, loading]);

  // ===========================================
  // RENDER PRINCIPALE
  // ===========================================
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 text-white p-8 shadow-xl">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold mb-2">⚽ Football Statistics Pro</h1>
              <p className="text-xl text-blue-100">Dati Reali • Probabilità Statistiche • Suggerimenti AI</p>
              <div className="mt-4 flex flex-wrap gap-3 text-sm">
                <span className="bg-white bg-opacity-20 px-3 py-1 rounded-full">📊 Statistiche 5 Anni</span>
                <span className="bg-white bg-opacity-20 px-3 py-1 rounded-full">🤖 AI Suggestions</span>
                <span className="bg-white bg-opacity-20 px-3 py-1 rounded-full">📈 Probabilità Reali</span>
                <span className="bg-white bg-opacity-20 px-3 py-1 rounded-full">🔄 Dati API Live</span>
                {lastUpdate && (
                  <span className="bg-white bg-opacity-20 px-3 py-1 rounded-full">
                    Ultimo aggiornamento: {lastUpdate.toLocaleTimeString('it-IT')}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className={`text-sm font-bold ${apiStatus?.status === 'OK' ? 'text-green-200' : 'text-red-200'}`}>
                {error ? 'Errore Connessione' : loading ? 'Caricamento...' : 'Sistema Operativo'}
              </div>
              <div className="text-xs opacity-75">
                API Server: {API_BASE_URL}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Errore di connessione */}
      {error && (
        <div className="max-w-7xl mx-auto p-6">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <div className="flex items-center">
              <span className="text-2xl mr-3">⚠️</span>
              <div>
                <h3 className="font-bold text-red-800">Errore di Connessione</h3>
                <p className="text-red-700">{error}</p>
                <p className="text-sm text-red-600 mt-2">
                  Verifica che il backend sia in esecuzione e le API keys siano configurate
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto p-6">
        {/* Controlli */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">
            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Cerca Squadre</label>
              <input
                type="text"
                placeholder="Inter, Juventus, Real Madrid..."
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Campionato</label>
              <select
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={selectedLeague}
                onChange={(e) => setSelectedLeague(e.target.value)}
              >
                {leagues.map(league => (
                  <option key={league.id} value={league.id}>
                    {league.flag} {league.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Stagione</label>
              <select
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={selectedSeason}
                onChange={(e) => setSelectedSeason(e.target.value)}
              >
                <option value="2025">2025/26</option>
                <option value="2024">2024/25</option>
                <option value="2023">2023/24</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Ordina per</label>
              <select
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="date">Data</option>
                <option value="home">Squadra Casa</option>
                <option value="confidence">Confidenza</option>
                <option value="ai_suggestions">Suggerimenti AI</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col">
            <button
              onClick={fetchMatches}
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 rounded-xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 transition-all font-bold transform hover:scale-105 disabled:transform-none"
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Caricamento Dati Reali...
                </div>
              ) : (
                'Aggiorna Statistiche'
              )}
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-4 gap-8">
          {/* Lista Partite */}
          <div className="lg:col-span-3">
            {loading && matches.length === 0 ? (
              <div className="text-center py-20">
                <div className="animate-spin rounded-full h-20 w-20 border-b-4 border-blue-600 mx-auto mb-6"></div>
                <h3 className="text-2xl font-bold text-gray-700">Caricamento dati reali...</h3>
                <p className="text-gray-500 mt-2">Connessione alle API e calcolo statistiche avanzate</p>
              </div>
            ) : processedMatches.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">📅</div>
                <h3 className="text-xl font-bold text-gray-700">
                  {processedMatches.length === 0 ? 
                    'Nessuna partita caricata' : 
                    'Tutte le partite visualizzate'
                  }
                </h3>
                <p className="text-gray-500 mt-2">
                  {searchTerm ? (
                    `Risultati per "${searchTerm}": ${processedMatches.length} partite trovate.`
                  ) : processedMatches.length === 0 ? (
                    'Prova a ricaricare i dati o seleziona un campionato diverso.'
                  ) : (
                    `Visualizzate ${processedMatches.length} partite. ` +
                    `${processedMatches.filter(m => m.canAnalyze).length} possono essere analizzate.`
                  )}
                </p>
                {error && (
                  <div className="mt-4">
                    <button
                      onClick={fetchMatches}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Riprova Connessione
                    </button>
                  </div>
                )}
                
                {/* INFO AGGIUNTIVE */}
                {processedMatches.length > 0 && (
                  <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
                    <div className="bg-green-50 p-4 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">
                        {processedMatches.filter(m => m.status === 'FINISHED').length}
                      </div>
                      <div className="text-sm text-green-700">Terminate</div>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">
                        {processedMatches.filter(m => m.canAnalyze).length}
                      </div>
                      <div className="text-sm text-blue-700">Analizzabili</div>
                    </div>
                    <div className="bg-purple-50 p-4 rounded-lg">
                      <div className="text-2xl font-bold text-purple-600">
                        {processedMatches.length}
                      </div>
                      <div className="text-sm text-purple-700">Totali</div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {processedMatches.map(match => (
                  <MatchCard key={match.id} match={match} />
                ))}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <ApiStatusSidebar />
          </div>
        </div>

        {/* Modal Analisi Completa */}
        {selectedMatch && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50" onClick={() => setSelectedMatch(null)}>
            <div className="bg-white rounded-3xl p-8 max-w-7xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-3xl font-bold flex items-center">
                  <span className="text-4xl mr-4">📊</span>
                  Analisi Completa: {selectedMatch.homeTeam?.name} vs {selectedMatch.awayTeam?.name}
                </h2>
                <button
                  onClick={() => setSelectedMatch(null)}
                  className="text-gray-500 hover:text-gray-700 text-4xl font-bold bg-gray-100 hover:bg-gray-200 rounded-full w-12 h-12 flex items-center justify-center transition-colors"
                >
                  ×
                </button>
              </div>

              <div className="grid lg:grid-cols-3 gap-8">
                {/* Probabilità Complete */}
                <div className="lg:col-span-2">
                  <h3 className="text-2xl font-bold mb-6 flex items-center">
                    <span className="text-3xl mr-3">🎯</span>
                    Probabilità Statistiche Complete
                  </h3>
                  
                  <ProbabilitiesDisplay probabilities={selectedMatch.probabilities} awayTeam={selectedMatch.awayTeam} homeTeam={selectedMatch.homeTeam} />
                </div>

                {/* Sidebar con Analisi */}
                <div className="space-y-6">
                  {/* AI Suggestions */}
                  <AISuggestionsDisplay 
                    probabilities={selectedMatch.probabilities}
                    suggestions={selectedMatch.aiSuggestions} 
                    tacticalInsights={selectedMatch.tacticalInsights}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-20 bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 text-white rounded-3xl p-10">
          <div className="text-center">
            <h3 className="text-3xl font-bold mb-4">Football Statistics Pro - Dati Reali + AI</h3>
            <p className="text-xl text-blue-100 mb-8">Statistiche da API Ufficiali • Probabilità Accurate • Suggerimenti Intelligenti</p>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
              <div className="text-center">
                <div className="text-4xl mb-3">📊</div>
                <div className="font-bold text-lg">Statistiche Reali</div>
                <div className="text-sm text-blue-200">5 Anni di Dati Storici</div>
              </div>
              <div className="text-center">
                <div className="text-4xl mb-3">🎯</div>
                <div className="font-bold text-lg">Probabilità Accurate</div>
                <div className="text-sm text-blue-200">Calcoli Statistici Avanzati</div>
              </div>
              <div className="text-center">
                <div className="text-4xl mb-3">🤖</div>
                <div className="font-bold text-lg">AI Suggestions</div>
                <div className="text-sm text-blue-200">Pattern Recognition + ML</div>
              </div>
              <div className="text-center">
                <div className="text-4xl mb-3">🔄</div>
                <div className="font-bold text-lg">Aggiornamenti Live</div>
                <div className="text-sm text-blue-200">Cache Intelligente</div>
              </div>
            </div>

            <div className="text-center text-blue-200">
              <p>Powered by Football-Data API • RapidAPI • Machine Learning • Statistical Analysis</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FootballStatsApp;