import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './App.css';

// ===========================================
// CONFIGURAZIONE API BACKEND
// ===========================================
const API_BASE_URL = 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// ===========================================
// COMPONENTE PRINCIPALE
// ===========================================
const FootballOddsApp = () => {
  // Stati principali
  const [matches, setMatches] = useState([]);
  const [selectedLeague, setSelectedLeague] = useState('SA');
  const [selectedSeason, setSelectedSeason] = useState('2025');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [valueBets, setValueBets] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState('date');

  // Campionati disponibili
  const leagues = [
    { id: 'SA', name: 'Serie A', country: 'Italy', flag: '🇮🇹' },
    { id: 'PL', name: 'Premier League', country: 'England', flag: '🏴󠁧󠁢󠁥󠁮' },
    { id: 'BL1', name: 'Bundesliga', country: 'Germany', flag: '🇩🇪' },
    { id: 'FL1', name: 'Ligue 1', country: 'France', flag: '🇫🇷' },
    { id: 'PD', name: 'La Liga', country: 'Spain', flag: '🇪🇸' },
    { id: 'DED', name: 'Eredivisie', country: 'Netherlands', flag: '🇳🇱' },
    { id: 'PPL', name: 'Primeira Liga', country: 'Portugal', flag: '🇵🇹' },
    { id: 'CL', name: 'Champions League', country: 'Europe', flag: '🌍' }
  ];

  // Stagioni disponibili
  const seasons = [
    { id: '2025', name: '2025/26', current: true },
    { id: '2024', name: '2024/25' },
    { id: '2023', name: '2023/24' },
    { id: '2022', name: '2022/23' },
    { id: '2021', name: '2021/22' }
  ];

  // ===========================================
  // API FUNCTIONS
  // ===========================================
  const fetchMatches = useCallback(async () => {
    setLoading(true);
    setError('');
    
    try {
      const response = await api.get(`/matches/${selectedLeague}`, {
        params: { season: selectedSeason }
      });
      
      if (response.data.success) {
        setMatches(response.data.matches);
        
        // Estrai i value bets
        const allValueBets = response.data.matches.flatMap(match => 
          (match.valueBets || []).map(bet => ({
            ...bet,
            matchId: match.id,
            homeTeam: match.homeTeam.name,
            awayTeam: match.awayTeam.name
          }))
        );
        
        setValueBets(allValueBets);
        setLastUpdate(new Date());
      } else {
        throw new Error(response.data.error || 'Failed to fetch matches');
      }
    } catch (error) {
      console.error('Error fetching matches:', error);
      setError(error.response?.data?.error || error.message || 'Errore di connessione al server');
    } finally {
      setLoading(false);
    }
  }, [selectedLeague, selectedSeason]);

  // ===========================================
  // UTILITY FUNCTIONS
  // ===========================================
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('it-IT', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getFormColor = (result) => {
    switch(result) {
      case 'W': return 'bg-green-500 text-white';
      case 'D': return 'bg-yellow-500 text-white';
      case 'L': return 'bg-red-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const getValueBetColor = (value) => {
    const numValue = parseFloat(value);
    if (numValue > 15) return 'border-green-500 bg-green-50';
    if (numValue > 10) return 'border-yellow-500 bg-yellow-50';
    if (numValue > 5) return 'border-blue-500 bg-blue-50';
    return 'border-gray-300 bg-gray-50';
  };

  const sortMatches = (matches) => {
    return [...matches].sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return new Date(a.utcDate) - new Date(b.utcDate);
        case 'home':
          return a.homeTeam.name.localeCompare(b.homeTeam.name);
        case 'value':
          { const aValueBets = a.valueBets?.length || 0;
          const bValueBets = b.valueBets?.length || 0;
          return bValueBets - aValueBets; }
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
  // COMPONENTI
  // ===========================================

  // Componente Match Card
  const MatchCard = ({ match }) => {
    const [showAdvanced, setShowAdvanced] = useState(false);

    return (
      <div className="bg-white rounded-2xl shadow-xl p-6 mb-6 border border-gray-100 hover:shadow-2xl transition-all duration-300">
        {/* Header partita */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center space-x-3">
            <span className="text-2xl">🏆</span>
            <div>
              <span className="text-sm font-semibold text-gray-700">
                {match.competition?.name || leagues.find(l => l.id === selectedLeague)?.name}
              </span>
              <div className="text-xs text-gray-500">Giornata {match.matchday || 'TBD'}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium text-gray-600">{formatDate(match.utcDate)}</div>
            <div className={`text-xs px-3 py-1 rounded-full mt-1 ${
              match.status === 'SCHEDULED' ? 'bg-blue-100 text-blue-800' : 
              match.status === 'LIVE' ? 'bg-red-100 text-red-800' : 
              'bg-gray-100 text-gray-800'
            }`}>
              {match.status === 'SCHEDULED' ? 'PROGRAMMATA' : match.status}
            </div>
          </div>
        </div>

        {/* Squadre */}
        <div className="grid grid-cols-3 gap-6 mb-6">
          {/* Casa */}
          <div className="text-center">
            <h3 className="text-xl font-bold text-gray-800 mb-2">{match.homeTeam?.name}</h3>
            {match.homeStats && (
              <div className="space-y-2 text-sm">
                <div className="flex justify-center items-center space-x-1">
                  <span className="text-gray-600">Forza:</span>
                  <div className="w-16 bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-500 h-2 rounded-full" 
                      style={{width: `${match.homeStats.strength || 50}%`}}
                    ></div>
                  </div>
                  <span className="font-bold text-blue-600">{match.homeStats.strength || 50}</span>
                </div>
                <div className="text-xs text-gray-500">
                  📊 {match.homeStats.avgGoalsFor} gol/p | 🛡️ {match.homeStats.cleanSheetPercentage || 0}% clean sheets
                </div>
              </div>
            )}
            {/* Forma squadra */}
            <div className="flex justify-center mt-3 space-x-1">
              {(match.homeStats?.form || ['W','D','L','W','W']).slice(0,5).map((result, idx) => (
                <span key={idx} className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${getFormColor(result)}`}>
                  {result}
                </span>
              ))}
            </div>
          </div>

          {/* VS */}
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-400 mb-4">VS</div>
            
            {/* Statistiche H2H */}
            {match.h2hData && (
              <div className="bg-gray-50 rounded-lg p-3 text-xs">
                <div className="font-semibold mb-2">Ultimi scontri</div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-blue-600">
                    <div className="font-bold">{match.h2hData.summary?.homeWins || 0}</div>
                    <div>Casa</div>
                  </div>
                  <div className="text-yellow-600">
                    <div className="font-bold">{match.h2hData.summary?.draws || 0}</div>
                    <div>Pari</div>
                  </div>
                  <div className="text-red-600">
                    <div className="font-bold">{match.h2hData.summary?.awayWins || 0}</div>
                    <div>Trasf.</div>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t">
                  <div>📈 Media gol: {match.h2hData.summary?.avgTotalGoals || '2.1'}</div>
                  <div>⚽ BTTS: {match.h2hData.summary?.bttsPercentage || '65'}%</div>
                </div>
              </div>
            )}

            {/* Predizioni AI */}
            {match.predictiveMetrics && (
              <div className="mt-3 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-3">
                <div className="text-xs font-semibold text-purple-800 mb-2">🤖 Predizione AI</div>
                <div className="text-xs space-y-1">
                  <div>xG Casa: <span className="font-bold text-purple-600">{match.predictiveMetrics.expectedGoalsHome?.toFixed(1) || '1.2'}</span></div>
                  <div>xG Trasferta: <span className="font-bold text-purple-600">{match.predictiveMetrics.expectedGoalsAway?.toFixed(1) || '0.9'}</span></div>
                  <div>Confidenza: <span className="font-bold text-purple-600">{match.confidence || '78'}%</span></div>
                </div>
              </div>
            )}
          </div>

          {/* Trasferta */}
          <div className="text-center">
            <h3 className="text-xl font-bold text-gray-800 mb-2">{match.awayTeam?.name}</h3>
            {match.awayStats && (
              <div className="space-y-2 text-sm">
                <div className="flex justify-center items-center space-x-1">
                  <span className="text-gray-600">Forza:</span>
                  <div className="w-16 bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-red-500 h-2 rounded-full" 
                      style={{width: `${match.awayStats.strength || 50}%`}}
                    ></div>
                  </div>
                  <span className="font-bold text-red-600">{match.awayStats.strength || 50}</span>
                </div>
                <div className="text-xs text-gray-500">
                  📊 {match.awayStats.avgGoalsFor} gol/p | 🛡️ {match.awayStats.cleanSheetPercentage || 0}% clean sheets
                </div>
              </div>
            )}
            {/* Forma squadra */}
            <div className="flex justify-center mt-3 space-x-1">
              {(match.awayStats?.form || ['L','W','D','W','L']).slice(0,5).map((result, idx) => (
                <span key={idx} className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${getFormColor(result)}`}>
                  {result}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Quote principali */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-xl text-center border hover:shadow-lg transition-all cursor-pointer group">
            <div className="text-sm text-gray-600 mb-1">Vittoria Casa</div>
            <div className="text-2xl font-bold text-blue-600 group-hover:scale-110 transition-transform">
              {match.odds?.['1X2']?.home || '2.10'}
            </div>
            <div className="text-xs text-blue-500 mt-1">
              {match.odds?.['1X2']?.metadata?.homeProbability || '45'}% prob.
            </div>
          </div>
          <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 p-4 rounded-xl text-center border hover:shadow-lg transition-all cursor-pointer group">
            <div className="text-sm text-gray-600 mb-1">Pareggio</div>
            <div className="text-2xl font-bold text-yellow-600 group-hover:scale-110 transition-transform">
              {match.odds?.['1X2']?.draw || '3.20'}
            </div>
            <div className="text-xs text-yellow-500 mt-1">
              {match.odds?.['1X2']?.metadata?.drawProbability || '28'}% prob.
            </div>
          </div>
          <div className="bg-gradient-to-br from-red-50 to-red-100 p-4 rounded-xl text-center border hover:shadow-lg transition-all cursor-pointer group">
            <div className="text-sm text-gray-600 mb-1">Vittoria Trasferta</div>
            <div className="text-2xl font-bold text-red-600 group-hover:scale-110 transition-transform">
              {match.odds?.['1X2']?.away || '3.40'}
            </div>
            <div className="text-xs text-red-500 mt-1">
              {match.odds?.['1X2']?.metadata?.awayProbability || '27'}% prob.
            </div>
          </div>
        </div>

        {/* Mercati aggiuntivi */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {/* Over/Under */}
          <div className="bg-gray-50 p-3 rounded-lg">
            <div className="text-xs font-semibold text-gray-700 mb-2">Over/Under 2.5</div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span>Over:</span>
                <strong className="text-green-600">{match.odds?.OVER_UNDER_25?.over || '1.75'}</strong>
              </div>
              <div className="flex justify-between">
                <span>Under:</span>
                <strong className="text-orange-600">{match.odds?.OVER_UNDER_25?.under || '2.05'}</strong>
              </div>
            </div>
          </div>

          {/* BTTS */}
          <div className="bg-gray-50 p-3 rounded-lg">
            <div className="text-xs font-semibold text-gray-700 mb-2">Goal</div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span>GG:</span>
                <strong className="text-green-600">{match.odds?.BTTS?.yes || '1.85'}</strong>
              </div>
              <div className="flex justify-between">
                <span>NG:</span>
                <strong className="text-red-600">{match.odds?.BTTS?.no || '1.95'}</strong>
              </div>
            </div>
          </div>

          {/* Double Chance */}
          <div className="bg-gray-50 p-3 rounded-lg">
            <div className="text-xs font-semibold text-gray-700 mb-2">Double Chance</div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span>1X:</span>
                <strong className="text-blue-600">{match.odds?.DOUBLE_CHANCE?.['1X'] || '1.44'}</strong>
              </div>
              <div className="flex justify-between">
                <span>X2:</span>
                <strong className="text-red-600">{match.odds?.DOUBLE_CHANCE?.X2 || '1.73'}</strong>
              </div>
            </div>
          </div>

          {/* Handicap */}
          <div className="bg-gray-50 p-3 rounded-lg">
            <div className="text-xs font-semibold text-gray-700 mb-2">Handicap -1/+1</div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span>Casa -1:</span>
                <strong className="text-blue-600">{match.odds?.ASIAN_HANDICAP_1?.home || '2.80'}</strong>
              </div>
              <div className="flex justify-between">
                <span>Trasf +1:</span>
                <strong className="text-red-600">{match.odds?.ASIAN_HANDICAP_1?.away || '1.95'}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Value Bets per questa partita */}
        {match.valueBets && match.valueBets.length > 0 && (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4 mb-4">
            <div className="flex items-center mb-3">
              <span className="text-2xl mr-2">💎</span>
              <h4 className="font-bold text-green-800">Value Bets Identificati</h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {match.valueBets.slice(0, 4).map((bet, idx) => (
                <div key={idx} className={`p-3 rounded-lg border-2 ${getValueBetColor(bet.value)}`}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-sm">{bet.market}</span>
                    <span className="bg-green-600 text-white px-2 py-1 rounded-full text-xs font-bold">
                      +{bet.value}%
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 space-y-1">
                    <div>Quota: <strong className="text-lg text-green-600">{bet.odds}</strong></div>
                    <div>Confidenza: <strong>{bet.confidence}%</strong></div>
                  </div>
                  <div className="mt-2 w-full bg-gray-200 rounded-full h-1">
                    <div 
                      className="bg-green-600 h-1 rounded-full" 
                      style={{width: `${Math.min(parseFloat(bet.confidence), 100)}%`}}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Azioni */}
        <div className="flex justify-between items-center">
          <button 
            onClick={() => setSelectedMatch(match)}
            className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-xl font-bold hover:from-blue-700 hover:to-purple-700 transition-all transform hover:scale-105 shadow-lg"
          >
            📊 Analisi Completa ({Object.keys(match.allMarkets || {}).length} mercati)
          </button>
          
          <div className="flex items-center space-x-3">
            {match.valueBets && match.valueBets.length > 0 && (
              <div className="flex items-center bg-green-100 text-green-800 px-3 py-1 rounded-full">
                <span className="text-lg mr-1">⚡</span>
                <span className="font-semibold">{match.valueBets.length} Value Bets</span>
              </div>
            )}
            
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                showAdvanced 
                  ? 'bg-purple-600 text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {showAdvanced ? '📈 Nascondi Statistiche' : '📊 Mostra Statistiche'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Componente Sidebar Value Bets
  const ValueBetsSidebar = () => (
    <div className="bg-white rounded-2xl shadow-xl p-6 h-fit">
      <div className="flex items-center mb-4">
        <span className="text-3xl mr-3">💎</span>
        <div>
          <h3 className="text-xl font-bold">Value Bets</h3>
          <p className="text-sm text-gray-500">Opportunità identificate dall'AI</p>
        </div>
      </div>
      
      {valueBets.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-4xl mb-3">🔍</div>
          <p className="text-gray-500 font-medium">Nessun value bet al momento</p>
          <p className="text-xs text-gray-400 mt-2">L'algoritmo continua il monitoraggio</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {valueBets.slice(0, 12).map((bet, idx) => (
            <div key={idx} className={`p-4 rounded-xl border-2 ${getValueBetColor(bet.value)} hover:shadow-lg transition-all`}>
              <div className="flex justify-between items-start mb-2">
                <div className="text-sm font-bold text-gray-800">
                  {bet.homeTeam} vs {bet.awayTeam}
                </div>
                <div className="bg-green-600 text-white px-3 py-1 rounded-full text-xs font-bold">
                  +{bet.value}%
                </div>
              </div>
              <div className="text-sm text-gray-600 mb-2">
                <strong>{bet.market}</strong> @ <span className="text-green-600 font-bold text-lg">{bet.odds}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500 mb-2">
                <span>Prob. Reale: <strong>{(parseFloat(bet.realProbability || 0.5) * 100).toFixed(1)}%</strong></span>
                <span>Confidenza: <strong>{bet.confidence}%</strong></span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-green-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(parseFloat(bet.confidence || 50), 100)}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Statistiche Value Betting */}
      <div className="mt-6 pt-6 border-t">
        <h4 className="font-bold text-gray-800 mb-3">📊 Statistiche AI</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">{valueBets.length}</div>
            <div className="text-xs text-green-600">Value Bets</div>
          </div>
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">
              {valueBets.length > 0 ? (valueBets.reduce((sum, bet) => sum + parseFloat(bet.value || 0), 0) / valueBets.length).toFixed(1) : 0}%
            </div>
            <div className="text-xs text-blue-600">Valore Medio</div>
          </div>
          <div className="text-center p-3 bg-purple-50 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">
              {valueBets.filter(bet => parseFloat(bet.confidence || 0) > 70).length}
            </div>
            <div className="text-xs text-purple-600">Alta Confidenza</div>
          </div>
          <div className="text-center p-3 bg-yellow-50 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">{matches.length}</div>
            <div className="text-xs text-yellow-600">Partite Analizzate</div>
          </div>
        </div>
      </div>
    </div>
  );

  // ===========================================
  // EFFECTS
  // ===========================================
  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  // Auto-refresh ogni 5 minuti
  useEffect(() => {
    const interval = setInterval(() => {
      if (!loading) {
        fetchMatches();
      }
    }, 300000);

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
              <h1 className="text-4xl font-bold mb-2">⚽ Odds Analyzer Pro</h1>
              <p className="text-xl text-blue-100">Backend API + Frontend React • Quote Stabili • Analisi AI Avanzata</p>
              <div className="mt-4 flex flex-wrap gap-3 text-sm">
                <span className="bg-white bg-opacity-20 px-3 py-1 rounded-full">🎯 85+ Mercati</span>
                <span className="bg-white bg-opacity-20 px-3 py-1 rounded-full">📊 Statistiche 5 anni</span>
                <span className="bg-white bg-opacity-20 px-3 py-1 rounded-full">🤖 Value Betting AI</span>
                <span className="bg-white bg-opacity-20 px-3 py-1 rounded-full">🔄 Quote Stabili</span>
                {lastUpdate && (
                  <span className="bg-white bg-opacity-20 px-3 py-1 rounded-full">
                    Ultimo aggiornamento: {lastUpdate.toLocaleTimeString('it-IT')}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm opacity-90">
                {error ? 'Errore Connessione' : loading ? 'Caricamento...' : 'Backend Connesso'}
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
                  Assicurati che il backend sia in esecuzione su {API_BASE_URL}
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
                {seasons.map(season => (
                  <option key={season.id} value={season.id}>
                    {season.current ? 'CORRENTE: ' : 'STORICO: '}{season.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Ordina</label>
              <select
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="date">Data</option>
                <option value="home">Squadra Casa</option>
                <option value="value">Value Bets</option>
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
                  Caricamento...
                </div>
              ) : (
                'Aggiorna Dati'
              )}
            </button>
          </div>

          {/* Statistiche rapide */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-6 border-t">
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{filteredMatches.length}</div>
              <div className="text-xs text-blue-600">Partite</div>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{valueBets.length}</div>
              <div className="text-xs text-green-600">Value Bets</div>
            </div>
            <div className="text-center p-3 bg-purple-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">
                {matches.filter(m => m.confidence && parseFloat(m.confidence) > 75).length}
              </div>
              <div className="text-xs text-purple-600">Alta Confidenza</div>
            </div>
            <div className="text-center p-3 bg-yellow-50 rounded-lg">
              <div className="text-2xl font-bold text-yellow-600">
                {leagues.find(l => l.id === selectedLeague)?.name.split(' ')[0] || 'N/A'}
              </div>
              <div className="text-xs text-yellow-600">Campionato</div>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{selectedSeason}/26</div>
              <div className="text-xs text-red-600">Stagione</div>
            </div>
          </div>
        </div>

        {/* Value Bets Alert */}
        {valueBets.length > 0 && (
          <div className="bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 text-white p-6 rounded-2xl mb-8 shadow-2xl">
            <div className="flex items-center">
              <span className="text-4xl mr-4">💎</span>
              <div>
                <h3 className="text-2xl font-bold">{valueBets.length} Value Bets Identificati!</h3>
                <p className="text-green-100 text-lg">
                  Valore medio: <strong>+{(valueBets.reduce((sum, bet) => sum + parseFloat(bet.value || 0), 0) / valueBets.length).toFixed(1)}%</strong> | 
                  Alta confidenza: <strong>{valueBets.filter(bet => parseFloat(bet.confidence || 0) > 70).length}</strong>
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-4 gap-8">
          {/* Lista Partite */}
          <div className="lg:col-span-3">
            {loading && matches.length === 0 ? (
              <div className="text-center py-20">
                <div className="animate-spin rounded-full h-20 w-20 border-b-4 border-blue-600 mx-auto mb-6"></div>
                <h3 className="text-2xl font-bold text-gray-700">Caricamento partite...</h3>
                <p className="text-gray-500 mt-2">Connessione al backend e calcolo statistiche avanzate</p>
              </div>
            ) : filteredMatches.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">🔍</div>
                <h3 className="text-xl font-bold text-gray-700">Nessuna partita trovata</h3>
                <p className="text-gray-500 mt-2">
                  {searchTerm 
                    ? `Nessun risultato per "${searchTerm}". Prova con un altro termine.`
                    : 'Nessuna partita programmata per questo campionato.'
                  }
                </p>
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
            <ValueBetsSidebar />

            {/* Informazioni Sistema */}
            <div className="bg-white rounded-2xl shadow-xl p-6">
              <h3 className="text-xl font-bold mb-4 flex items-center">
                <span className="text-3xl mr-3">🔧</span>
                Sistema
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Backend API:</span>
                  <span className={`font-semibold ${error ? 'text-red-600' : 'text-green-600'}`}>
                    {error ? 'Offline' : 'Online'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Database:</span>
                  <span className="font-semibold text-blue-600">SQLite</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Quote Stabili:</span>
                  <span className="font-semibold text-purple-600">Algoritmo</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Mercati:</span>
                  <span className="font-semibold text-yellow-600">85+ Tipi</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Storico:</span>
                  <span className="font-semibold text-indigo-600">5 Stagioni</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Value Betting:</span>
                  <span className="font-semibold text-green-600">AI Avanzata</span>
                </div>
              </div>
            </div>
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
                {/* Tutti i Mercati */}
                <div className="lg:col-span-2">
                  <h3 className="text-2xl font-bold mb-6 flex items-center">
                    <span className="text-3xl mr-3">🎯</span>
                    Tutti i Mercati Disponibili
                  </h3>
                  
                  <div className="grid gap-6">
                    {Object.entries(selectedMatch.allMarkets || {}).map(([marketKey, marketData]) => (
                      <div key={marketKey} className="bg-gray-50 p-6 rounded-2xl">
                        <h4 className="font-bold text-lg text-gray-800 mb-4">{marketKey.replace(/_/g, ' ')}</h4>
                        
                        {typeof marketData === 'object' && marketData !== null && (
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {Object.entries(marketData)
                              .filter(([key]) => key !== 'metadata')
                              .map(([outcome, odds]) => (
                                <div key={outcome} className="bg-white p-3 rounded-lg border hover:border-blue-300 cursor-pointer transition-colors">
                                  <div className="text-sm text-gray-600 capitalize">{outcome.replace(/_/g, ' ')}</div>
                                  <div className="text-lg font-bold text-blue-600">{odds}</div>
                                  {marketData.metadata && marketData.metadata[`${outcome}Probability`] && (
                                    <div className="text-xs text-gray-500">
                                      {marketData.metadata[`${outcome}Probability`]}% prob.
                                    </div>
                                  )}
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Sidebar con Analisi */}
                <div>
                  <h3 className="text-2xl font-bold mb-6 flex items-center">
                    <span className="text-3xl mr-3">🔬</span>
                    Analisi AI
                  </h3>

                  <div className="space-y-6">
                    {/* Predizioni AI */}
                    {selectedMatch.predictiveMetrics && (
                      <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-6 rounded-2xl">
                        <h4 className="font-bold text-purple-800 mb-4 text-lg">Predizioni IA</h4>
                        <div className="space-y-3">
                          <div className="flex justify-between">
                            <span className="text-sm">Expected Goals Casa:</span>
                            <strong className="text-purple-600">
                              {selectedMatch.predictiveMetrics.expectedGoalsHome?.toFixed(2) || '1.45'}
                            </strong>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm">Expected Goals Trasferta:</span>
                            <strong className="text-purple-600">
                              {selectedMatch.predictiveMetrics.expectedGoalsAway?.toFixed(2) || '1.18'}
                            </strong>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm">Confidenza Modello:</span>
                            <strong className="text-purple-600">{selectedMatch.confidence || '82'}%</strong>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm">BTTS Probabilità:</span>
                            <strong className="text-purple-600">
                              {selectedMatch.predictiveMetrics.bttsPrediction || '68'}%
                            </strong>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Value Bets per questa partita */}
                    <div className="bg-green-50 p-6 rounded-2xl">
                      <h4 className="font-bold text-green-800 mb-4 text-lg">Value Bets</h4>
                      {selectedMatch.valueBets && selectedMatch.valueBets.length > 0 ? (
                        <div className="space-y-3">
                          {selectedMatch.valueBets.map((bet, idx) => (
                            <div key={idx} className="bg-white p-4 rounded-xl border-2 border-green-300">
                              <div className="flex justify-between items-center mb-2">
                                <span className="font-bold text-green-800">{bet.market}</span>
                                <span className="bg-green-600 text-white px-3 py-1 rounded-full text-sm font-bold">
                                  +{bet.value}%
                                </span>
                              </div>
                              <div className="grid grid-cols-3 gap-2 text-sm">
                                <div>
                                  <div className="text-gray-600">Quota</div>
                                  <div className="font-bold text-lg">{bet.odds}</div>
                                </div>
                                <div>
                                  <div className="text-gray-600">Valore</div>
                                  <div className="font-bold text-lg text-green-600">+{bet.value}%</div>
                                </div>
                                <div>
                                  <div className="text-gray-600">Confidenza</div>
                                  <div className="font-bold text-lg">{bet.confidence}%</div>
                                </div>
                              </div>
                              <div className="mt-3 w-full bg-gray-200 rounded-full h-2">
                                <div 
                                  className="bg-green-600 h-2 rounded-full"
                                  style={{width: `${Math.min(parseFloat(bet.confidence || 0), 100)}%`}}
                                ></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-4">
                          <div className="text-2xl mb-2">🔍</div>
                          <p className="text-gray-600">Nessun value bet per questa partita</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-20 bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 text-white rounded-3xl p-10">
          <div className="text-center">
            <h3 className="text-3xl font-bold mb-4">Odds Analyzer Pro - Architettura Completa</h3>
            <p className="text-xl text-blue-100 mb-8">Backend Node.js + Frontend React • Quote Stabili • AI Avanzata</p>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
              <div className="text-center">
                <div className="text-4xl mb-3">🔧</div>
                <div className="font-bold text-lg">Backend API</div>
                <div className="text-sm text-blue-200">Node.js + SQLite + Express</div>
              </div>
              <div className="text-center">
                <div className="text-4xl mb-3">⚛️</div>
                <div className="font-bold text-lg">Frontend React</div>
                <div className="text-sm text-blue-200">Componenti Avanzati + Hooks</div>
              </div>
              <div className="text-center">
                <div className="text-4xl mb-3">📊</div>
                <div className="font-bold text-lg">Quote Stabili</div>
                <div className="text-sm text-blue-200">Algoritmi Statistici</div>
              </div>
              <div className="text-center">
                <div className="text-4xl mb-3">🤖</div>
                <div className="font-bold text-lg">AI Value Betting</div>
                <div className="text-sm text-blue-200">Machine Learning</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FootballOddsApp;