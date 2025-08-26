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
  // const formatDate = (dateString) => {
  //   const date = new Date(dateString);
  //   return date.toLocaleDateString('it-IT', { 
  //     weekday: 'short', 
  //     month: 'short', 
  //     day: 'numeric',
  //     hour: '2-digit',
  //     minute: '2-digit'
  //   });
  // };

  // const getProbabilityColor = (percentage) => {
  //   const num = parseFloat(percentage);
  //   if (num > 70) return 'text-green-600 bg-green-100';
  //   if (num > 55) return 'text-blue-600 bg-blue-100';
  //   if (num > 40) return 'text-yellow-600 bg-yellow-100';
  //   return 'text-gray-600 bg-gray-100';
  // };

  const getDataQualityBadge = (quality) => {
    const badges = {
      'high': 'bg-green-500 text-white',
      'medium': 'bg-yellow-500 text-white',
      'low': 'bg-red-500 text-white'
    };
    return badges[quality] || 'bg-gray-500 text-white';
  };

  // const getConfidenceColor = (confidence) => {
  //   const num = parseFloat(confidence);
  //   if (num > 80) return 'text-green-600';
  //   if (num > 60) return 'text-blue-600';
  //   if (num > 40) return 'text-yellow-600';
  //   return 'text-red-600';
  // };

  // ===========================================
  // COMPONENTI
  // ===========================================

  // Componente Statistiche Squadra
  const TeamStatsDisplay = ({ stats, teamName, isHome }) => {
    if (!stats) return <div className="text-center text-gray-500">Dati non disponibili</div>;

    const homeAwayStats = isHome ? {
      matches: (stats.home_wins + stats.home_draws + stats.home_losses).toFixed(0),
      wins: stats.home_wins?.toFixed(0) || 0,
      draws: stats.home_draws?.toFixed(0) || 0,
      losses: stats.home_losses?.toFixed(0) || 0,
      goalsFor: stats.home_goals_for?.toFixed(1) || 0,
      goalsAgainst: stats.home_goals_against?.toFixed(1) || 0
    } : {
      matches: (stats.away_wins + stats.away_draws + stats.away_losses).toFixed(0),
      wins: stats.away_wins?.toFixed(0) || 0,
      draws: stats.away_draws?.toFixed(0) || 0,
      losses: stats.away_losses?.toFixed(0) || 0,
      goalsFor: stats.away_goals_for?.toFixed(1) || 0,
      goalsAgainst: stats.away_goals_against?.toFixed(1) || 0
    };

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">{teamName}</h3>
          <div className={`px-2 py-1 rounded-full text-xs font-bold ${getDataQualityBadge(stats.dataQuality)}`}>
            {stats.dataQuality?.toUpperCase()} DATA ({stats.rawSeasons} stagioni)
          </div>
        </div>

        {/* Statistiche Casa/Trasferta */}
        <div className="bg-gray-50 p-3 rounded-lg">
          <div className="text-sm font-semibold mb-2">
            {isHome ? '🏠 In Casa' : '✈️ In Trasferta'} ({homeAwayStats.matches} partite)
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="text-center">
              <div className="font-bold text-green-600">{homeAwayStats.wins}</div>
              <div>Vittorie</div>
            </div>
            <div className="text-center">
              <div className="font-bold text-yellow-600">{homeAwayStats.draws}</div>
              <div>Pareggi</div>
            </div>
            <div className="text-center">
              <div className="font-bold text-red-600">{homeAwayStats.losses}</div>
              <div>Sconfitte</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
            <div className="text-center">
              <div className="font-bold text-blue-600">{homeAwayStats.goalsFor}</div>
              <div>Gol Fatti</div>
            </div>
            <div className="text-center">
              <div className="font-bold text-orange-600">{homeAwayStats.goalsAgainst}</div>
              <div>Gol Subiti</div>
            </div>
          </div>
        </div>

        {/* Statistiche Generali */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Partite Giocate:</span>
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
            <strong>{((stats.btts_matches / stats.matches_played) * 100).toFixed(1)}%</strong>
          </div>
          <div className="flex justify-between">
            <span>Over 2.5 %:</span>
            <strong>{((stats.over_25_matches / stats.matches_played) * 100).toFixed(1)}%</strong>
          </div>
        </div>
      </div>
    );
  };

  // Componente Probabilità Display
  const ProbabilitiesDisplay = ({ probabilities, homeTeam, awayTeam }) => {
    if (!probabilities) return <div>Dati non disponibili</div>;

    // Correggi le percentuali per sommare a 100%
    const normalize1X2 = (probs) => {
      const home = parseFloat(probs.home);
      const draw = parseFloat(probs.draw);
      const away = parseFloat(probs.away);
      const total = home + draw + away;
      
      return {
        home: (home / total * 100).toFixed(1),
        draw: (draw / total * 100).toFixed(1),
        away: (away / total * 100).toFixed(1)
      };
    };

    const normalizeGoals = (goals) => {
      const over = parseFloat(goals.over_25 || 50);
      const under = 100 - over;
      return {
        over_25: over.toFixed(1),
        under_25: under.toFixed(1)
      };
    };

    const normalizeBTTS = (btts) => {
      const yes = parseFloat(btts.btts_yes || 50);
      const no = 100 - yes;
      return {
        btts_yes: yes.toFixed(1),
        btts_no: no.toFixed(1)
      };
    };

    const corrected1X2 = normalize1X2(probabilities['1X2'] || {});
    const correctedGoals = normalizeGoals(probabilities.goals || {});
    const correctedBTTS = normalizeBTTS(probabilities.btts || {});

    return (
      <div className="space-y-6">
        {/* Risultato 1X2 con nomi squadre chiari */}
        <div className="bg-white p-6 rounded-xl border shadow-sm">
          <h3 className="text-xl font-bold mb-4 flex items-center">
            🎯 Probabilità Risultato: {homeTeam} vs {awayTeam}
          </h3>
          
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-blue-50 p-4 rounded-lg text-center border-2 border-blue-200">
              <div className="text-2xl font-bold text-blue-600">{corrected1X2.home}%</div>
              <div className="text-sm font-medium">Vittoria {homeTeam}</div>
              <div className="text-xs text-blue-500 mt-1">(Casa)</div>
            </div>
            <div className="bg-yellow-50 p-4 rounded-lg text-center border-2 border-yellow-200">
              <div className="text-2xl font-bold text-yellow-600">{corrected1X2.draw}%</div>
              <div className="text-sm font-medium">Pareggio</div>
              <div className="text-xs text-yellow-500 mt-1">(X)</div>
            </div>
            <div className="bg-red-50 p-4 rounded-lg text-center border-2 border-red-200">
              <div className="text-2xl font-bold text-red-600">{corrected1X2.away}%</div>
              <div className="text-sm font-medium">Vittoria {awayTeam}</div>
              <div className="text-xs text-red-500 mt-1">(Trasferta)</div>
            </div>
          </div>
          
          <div className="bg-gray-100 p-2 rounded text-center">
            <span className="text-sm">Confidenza Calcolo: <strong>{probabilities['1X2']?.confidence || 70}%</strong></span>
            <div className="text-xs text-gray-600 mt-1">
              Basata su: statistiche stagionali + forma attuale + fattore campo
            </div>
          </div>
        </div>

        {/* Goals Statistics */}
        <div className="bg-white p-6 rounded-xl border shadow-sm">
          <h3 className="text-xl font-bold mb-4 flex items-center">
            ⚽ Statistiche Gol
          </h3>
          
          <div className="mb-4 text-center">
            <div className="text-3xl font-bold text-green-600">
              {probabilities.goals?.expected_total || '2.50'}
            </div>
            <div className="text-sm text-gray-600">Gol Totali Attesi</div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-green-50 p-4 rounded-lg text-center border-2 border-green-200">
              <div className="text-2xl font-bold text-green-600">{correctedGoals.over_25}%</div>
              <div className="text-sm font-medium">Over 2.5 Gol</div>
              <div className="text-xs text-green-500 mt-1">3 o più gol</div>
            </div>
            <div className="bg-orange-50 p-4 rounded-lg text-center border-2 border-orange-200">
              <div className="text-2xl font-bold text-orange-600">{correctedGoals.under_25}%</div>
              <div className="text-sm font-medium">Under 2.5 Gol</div>
              <div className="text-xs text-orange-500 mt-1">2 o meno gol</div>
            </div>
          </div>
        </div>

        {/* BTTS con nomi squadre */}
        <div className="bg-white p-6 rounded-xl border shadow-sm">
          <h3 className="text-xl font-bold mb-4 flex items-center">
            🥅 Entrambe le Squadre Segnano
          </h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-green-50 p-4 rounded-lg text-center border-2 border-green-200">
              <div className="text-2xl font-bold text-green-600">{correctedBTTS.btts_yes}%</div>
              <div className="text-sm font-medium">Goal/Goal</div>
              <div className="text-xs text-green-500 mt-1">Entrambe segnano</div>
            </div>
            <div className="bg-blue-50 p-4 rounded-lg text-center border-2 border-blue-200">
              <div className="text-2xl font-bold text-blue-600">{correctedBTTS.btts_no}%</div>
              <div className="text-sm font-medium">NoGoal/NoGoal</div>
              <div className="text-xs text-blue-500 mt-1">Almeno una non segna</div>
            </div>
          </div>

          {probabilities.btts?.home_score_prob && (
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div className="bg-gray-50 p-3 rounded">
                <strong>{homeTeam} segna:</strong> {probabilities.btts.home_score_prob}%
              </div>
              <div className="bg-gray-50 p-3 rounded">
                <strong>{awayTeam} segna:</strong> {probabilities.btts.away_score_prob}%
              </div>
            </div>
          )}
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
    
    // Calcola statistiche corrette per ogni squadra
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

    matches.forEach(match => {
      const isHomeTeamPlayingAtHome = match.home_team_name?.includes(homeTeam) || match.home_team_id === homeTeam;
      
      if (match.match_result === 'draw') {
        homeTeamStats.draws++;
        awayTeamStats.draws++;
      } else if (
        (match.match_result === 'home' && isHomeTeamPlayingAtHome) ||
        (match.match_result === 'away' && !isHomeTeamPlayingAtHome)
      ) {
        homeTeamStats.wins++;
        awayTeamStats.losses++;
      } else {
        homeTeamStats.losses++;
        awayTeamStats.wins++;
      }

      if (isHomeTeamPlayingAtHome) {
        homeTeamStats.goalsFor += match.home_goals;
        homeTeamStats.goalsAgainst += match.away_goals;
        awayTeamStats.goalsFor += match.away_goals;
        awayTeamStats.goalsAgainst += match.home_goals;
      } else {
        homeTeamStats.goalsFor += match.away_goals;
        homeTeamStats.goalsAgainst += match.home_goals;
        awayTeamStats.goalsFor += match.home_goals;
        awayTeamStats.goalsAgainst += match.away_goals;
      }
    });

    return (
      <div className="bg-white p-6 rounded-xl border shadow-sm">
        <h3 className="text-xl font-bold mb-4 flex items-center justify-between">
          📊 Scontri Diretti ({matches.length} partite)
          <span className={`px-3 py-1 rounded-full text-sm font-bold ${
            h2hData.reliability === 'high' ? 'bg-green-100 text-green-800' :
            h2hData.reliability === 'medium' ? 'bg-yellow-100 text-yellow-800' :
            'bg-red-100 text-red-800'
          }`}>
            {h2hData.reliability?.toUpperCase() || 'LOW'}
          </span>
        </h3>
        
        <div className="grid grid-cols-2 gap-6">
          {/* Statistiche Squadra Casa */}
          <div className="text-center">
            <h4 className="font-bold text-lg mb-3 text-blue-600">{homeTeam}</h4>
            <div className="space-y-2">
              <div className="bg-green-100 p-3 rounded">
                <div className="text-2xl font-bold text-green-600">{homeTeamStats.wins}</div>
                <div className="text-sm">Vittorie</div>
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
            <div className="mt-4 text-sm">
              <div>Gol fatti: <strong>{homeTeamStats.goalsFor}</strong></div>
              <div>Gol subiti: <strong>{homeTeamStats.goalsAgainst}</strong></div>
            </div>
          </div>

          {/* Statistiche Squadra Trasferta */}
          <div className="text-center">
            <h4 className="font-bold text-lg mb-3 text-red-600">{awayTeam}</h4>
            <div className="space-y-2">
              <div className="bg-green-100 p-3 rounded">
                <div className="text-2xl font-bold text-green-600">{awayTeamStats.wins}</div>
                <div className="text-sm">Vittorie</div>
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
            <div className="mt-4 text-sm">
              <div>Gol fatti: <strong>{awayTeamStats.goalsFor}</strong></div>
              <div>Gol subiti: <strong>{awayTeamStats.goalsAgainst}</strong></div>
            </div>
          </div>
        </div>

        {/* Statistiche Generali */}
        {summary && (
          <div className="mt-6 pt-6 border-t">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="text-center">
                <div className="font-bold text-lg">{summary.avgTotalGoals}</div>
                <div>Media Gol/Partita</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-lg">{summary.bttsPercentage}%</div>
                <div>BTTS</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-lg">{summary.over25Percentage}%</div>
                <div>Over 2.5</div>
              </div>
            </div>
          </div>
        )}

        {/* Ultimi risultati */}
        <div className="mt-6">
          <h5 className="font-bold mb-3">Ultimi Scontri:</h5>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {matches.slice(0, 8).map((match, index) => (
              <div key={index} className="flex justify-between items-center bg-gray-50 p-2 rounded text-sm">
                <div>{new Date(match.match_date).toLocaleDateString('it-IT')}</div>
                <div className="font-bold">
                  {match.home_goals} - {match.away_goals}
                </div>
                <div className={`px-2 py-1 rounded text-xs ${
                  match.match_result === 'home' ? 'bg-blue-100 text-blue-800' :
                  match.match_result === 'away' ? 'bg-red-100 text-red-800' :
                  'bg-yellow-100 text-yellow-800'
                }`}>
                  {match.match_result === 'draw' ? 'X' : match.match_result === 'home' ? '1' : '2'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // Componente Match Card Principale
  const MatchCard = ({ match }) => {
    const hasResult = match.score?.fullTime?.home !== null;
    
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
              match.status === 'SCHEDULED' ? 'bg-blue-100 text-blue-800' : 
              'bg-gray-100 text-gray-800'
            }`}>
              {hasResult ? 'TERMINATA' : 'PROGRAMMATA'}
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
            </div>
            
            <div className="text-left flex-1">
              <h3 className="text-xl font-bold">{match.awayTeam?.name || 'Trasferta'}</h3>
              <div className="text-sm text-gray-500">Trasferta</div>
            </div>
          </div>
        </div>

        {!hasResult && (
          <div className="flex justify-center">
            <button
              onClick={() => setSelectedMatch(match)}
              className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-xl font-bold hover:from-blue-700 hover:to-purple-700 transition-all transform hover:scale-105"
            >
              📊 Analizza Statistiche e Probabilità
            </button>
          </div>
        )}
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
            ) : filteredMatches.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">🔍</div>
                <h3 className="text-xl font-bold text-gray-700">Nessuna partita trovata</h3>
                <p className="text-gray-500 mt-2">
                  {searchTerm 
                    ? `Nessun risultato per "${searchTerm}". Prova con un altro termine.`
                    : 'Nessuna partita programmata per questo campionato e stagione.'
                  }
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
              </div>
            ) : (
              <div className="space-y-6">
                {filteredMatches.map(match => (
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
                  
                  <ProbabilitiesDisplay probabilities={selectedMatch.probabilities} />
                </div>

                {/* Sidebar con Analisi */}
                <div className="space-y-6">
                  {/* AI Suggestions */}
                  <AISuggestionsDisplay 
                    probabilities={selectedMatch.probabilities}
                    suggestions={selectedMatch.aiSuggestions} 
                    tacticalInsights={selectedMatch.tacticalInsights}
                  />
                  
                  {/* Head to Head */}
                  <div className="bg-white p-6 rounded-2xl border">
                    <HeadToHeadDisplay h2hData={selectedMatch.h2hData} />
                  </div>
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