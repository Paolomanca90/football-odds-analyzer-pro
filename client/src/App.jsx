// App.jsx - Frontend aggiornato per gestire tutte le partite della stagione
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './App.css';

// ===========================================
// CONFIGURAZIONE API BACKEND
// ===========================================
const API_BASE_URL = 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
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
  const [selectedSeason] = useState('2025');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [filterStatus, setFilterStatus] = useState('all'); // NEW: Filtro per status

  // Campionati disponibili
  const leagues = [
    { id: 'SA', name: 'Serie A', country: 'Italy' },
    { id: 'PL', name: 'Premier League', country: 'England' },
    { id: 'BL1', name: 'Bundesliga', country: 'Germany' },
    { id: 'FL1', name: 'Ligue 1', country: 'France' },
    { id: 'PD', name: 'La Liga', country: 'Spain' },
    { id: 'DED', name: 'Eredivisie', country: 'Netherlands' },
    { id: 'PPL', name: 'Primeira Liga', country: 'Portugal' },
    { id: 'CL', name: 'Champions League', country: 'Europe' }
  ];

  // ===========================================
  // API FUNCTIONS
  // ===========================================
  const fetchMatches = useCallback(async () => {
    setLoading(true);
    setError('');
    
    try {
      console.log(`🔄 Fetching matches for ${selectedLeague} season ${selectedSeason}`);
      
      const response = await api.get(`/matches/${selectedLeague}`, {
        params: { season: selectedSeason }
      });
      
      if (response.data.success) {
        setMatches(response.data.matches);
        
        console.log(`✅ Loaded ${response.data.matches.length} matches`);
        console.log(`📊 Metadata:`, response.data.metadata);
        
        // Log delle tipologie di partite
        const statusCounts = response.data.matches.reduce((acc, match) => {
          acc[match.status] = (acc[match.status] || 0) + 1;
          return acc;
        }, {});
        console.table(statusCounts);
        
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

  // ===========================================
  // UTILITY FUNCTIONS
  // ===========================================
  const getStatusBadge = (status) => {
    const badges = {
      'FINISHED': 'bg-green-500 text-white',
      'SCHEDULED': 'bg-blue-500 text-white',
      'TIMED': 'bg-blue-500 text-white',
      'IN_PLAY': 'bg-red-500 text-white',
      'PAUSED': 'bg-yellow-500 text-white',
      'POSTPONED': 'bg-orange-500 text-white',
      'CANCELLED': 'bg-gray-500 text-white'
    };
    return badges[status] || 'bg-gray-500 text-white';
  };

  // ===========================================
  // FILTRI E ORDINAMENTO
  // ===========================================
  const filterMatches = (matches) => {
    let filtered = matches;

    // Filtro per ricerca
    if (searchTerm) {
      filtered = filtered.filter(match => {
        const homeTeam = match.homeTeam?.name?.toLowerCase() || '';
        const awayTeam = match.awayTeam?.name?.toLowerCase() || '';
        const search = searchTerm.toLowerCase();
        return homeTeam.includes(search) || awayTeam.includes(search);
      });
    }

    // Filtro per status
    if (filterStatus !== 'all') {
      switch (filterStatus) {
        case 'upcoming':
          filtered = filtered.filter(match => match.status === 'SCHEDULED' || match.status === 'TIMED');
          break;
        case 'finished':
          filtered = filtered.filter(match => match.status === 'FINISHED');
          break;
        case 'analyzable':
          filtered = filtered.filter(match => match.canAnalyze);
          break;
        case 'today':
          { const today = new Date().toDateString();
          filtered = filtered.filter(match => new Date(match.utcDate).toDateString() === today);
          break; }
      }
    }

    return filtered;
  };

  const sortMatches = (matches) => {
    return [...matches].sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return new Date(a.utcDate) - new Date(b.utcDate);
        case 'date_desc':
          return new Date(b.utcDate) - new Date(a.utcDate);
        case 'home':
          return a.homeTeam.name.localeCompare(b.homeTeam.name);
        case 'status':
          return a.status.localeCompare(b.status);
        case 'confidence':
          return (parseFloat(b.confidence || 0)) - (parseFloat(a.confidence || 0));
        default:
          return 0;
      }
    });
  };

  const processedMatches = sortMatches(filterMatches(matches));

  // ===========================================
  // COMPONENTI
  // ===========================================

  // Componente Match Card Aggiornato
  const MatchCard = ({ match }) => {
    const hasResult = match.score?.fullTime?.home !== null;
    const canAnalyze = match.canAnalyze || false;
    const isFinished = match.status === 'FINISHED';
    const isScheduled = match.status === 'SCHEDULED' || match.status === 'TIMED';
    
    return (
      <div className="bg-white rounded-2xl shadow-xl p-6 mb-6 border border-gray-100">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center space-x-3">
            <span className="text-2xl">⚽</span>
            <div>
              <span className="text-sm font-semibold text-gray-700">
                {leagues.find(l => l.id === selectedLeague)?.name} {selectedSeason}/{parseInt(selectedSeason)+1}
              </span>
              <div className="text-xs text-gray-500">Giornata {match.matchday || 'N/A'}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium text-gray-600">
              {new Date(match.utcDate).toLocaleDateString('it-IT')}
            </div>
            <div className={`text-xs px-3 py-1 rounded-full mt-1 ${getStatusBadge(match.status)}`}>
              {match.displayStatus || match.status}
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

        {/* BOTTONI BASATI SULLO STATUS */}
        <div className="flex justify-center space-x-3">
          {canAnalyze ? (
            <button
              onClick={() => setSelectedMatch(match)}
              className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-xl font-bold hover:from-blue-700 hover:to-purple-700 transition-all transform hover:scale-105"
            >
              📊 Analizza Statistiche e Probabilità
            </button>
          ) : isFinished ? (
            <div className="bg-gray-100 text-gray-600 px-6 py-3 rounded-xl font-bold flex items-center space-x-2">
              <span>✅</span>
              <span>Partita Terminata: {hasResult ? `${match.score.fullTime.home} - ${match.score.fullTime.away}` : 'Risultato non disponibile'}</span>
            </div>
          ) : isScheduled ? (
            <div className="bg-blue-100 text-blue-700 px-6 py-3 rounded-xl font-bold flex items-center space-x-2">
              <span>📅</span>
              <span>Programmata per {new Date(match.utcDate).toLocaleDateString('it-IT')}</span>
            </div>
          ) : (
            <div className="bg-yellow-100 text-yellow-700 px-6 py-3 rounded-xl font-bold flex items-center space-x-2">
              <span>⏳</span>
              <span>{match.displayStatus || match.status}</span>
            </div>
          )}
          
          {/* Mostra confidence se disponibile */}
          {match.confidence && (
            <div className="bg-green-100 text-green-700 px-4 py-3 rounded-xl text-sm font-bold">
              🎯 {match.confidence}% Confidenza
            </div>
          )}
        </div>
      </div>
    );
  };

  // ===========================================
  // EFFECTS
  // ===========================================
  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  // ===========================================
  // RENDER PRINCIPALE
  // ===========================================
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 text-white p-8 shadow-xl">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">
            <h1 className="text-4xl font-bold mb-2">⚽ Football Statistics Pro</h1>
            <p className="text-xl text-blue-100">• Dati Reali • Analisi Intelligente</p>
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
        {/* Controlli Aggiornati */}
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
                    {league.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Filtro Status</label>
              <select
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="all">Tutte le Partite</option>
                <option value="upcoming">In Programma</option>
                <option value="analyzable">Analizzabili</option>
                <option value="finished">Terminate</option>
                <option value="today">Oggi</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Ordina per</label>
              <select
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="date">Data (Prima le Vecchie)</option>
                <option value="date_desc">Data (Prima le Nuove)</option>
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
                  Caricamento Stagione Completa...
                </div>
              ) : (
                'Aggiorna Dati Stagione'
              )}
            </button>

            {/* Statistiche del filtro corrente */}
            {matches.length > 0 && (
              <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
                <div className="bg-blue-50 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{processedMatches.length}</div>
                  <div className="text-xs text-blue-600">Visualizzate</div>
                </div>
                <div className="bg-green-50 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {processedMatches.filter(m => m.canAnalyze).length}
                  </div>
                  <div className="text-xs text-green-600">Analizzabili</div>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-gray-600">
                    {processedMatches.filter(m => m.status === 'FINISHED').length}
                  </div>
                  <div className="text-xs text-gray-600">Terminate</div>
                </div>
                <div className="bg-purple-50 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">
                    {processedMatches.filter(m => m.status === 'SCHEDULED' || m.status === 'TIMED').length}
                  </div>
                  <div className="text-xs text-purple-600">Programmate</div>
                </div>
                <div className="bg-orange-50 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">
                    {matches.length}
                  </div>
                  <div className="text-xs text-orange-600">Totali</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div>
          {/* Lista Partite */}
          <div>
            {loading && matches.length === 0 ? (
              <div className="text-center py-20">
                <div className="animate-spin rounded-full h-20 w-20 border-b-4 border-blue-600 mx-auto mb-6"></div>
                <h3 className="text-2xl font-bold text-gray-700">Caricamento stagione completa...</h3>
                <p className="text-gray-500 mt-2">Recuperando partite, statistiche e H2H da API multiple</p>
              </div>
            ) : processedMatches.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">📅</div>
                <h3 className="text-xl font-bold text-gray-700">
                  {matches.length === 0 ? 'Nessuna partita caricata' : 'Nessuna partita trovata'}
                </h3>
                <p className="text-gray-500 mt-2">
                  {searchTerm || filterStatus !== 'all' ? (
                    `Nessun risultato per i filtri applicati. Prova a modificare i criteri di ricerca.`
                  ) : matches.length === 0 ? (
                    'Prova a ricaricare i dati o seleziona un campionato diverso.'
                  ) : (
                    `Cambia i filtri per vedere più partite.`
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
              </div>
            ) : (
              <div className="space-y-6">
                {processedMatches.map(match => (
                  <MatchCard key={match.id} match={match} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal Analisi Completa */}
        {selectedMatch && (
          <AnalysisModal 
            match={selectedMatch} 
            onClose={() => setSelectedMatch(null)}
          />
        )}
      </div>
    </div>
  );

  // ===========================================
  // COMPONENTI SIDEBAR E MODAL
  // ===========================================

  function AnalysisModal({ match, onClose }) {
    console.log('🔍 Opening analysis modal for match:', match);

    if (!match.analysis?.probabilities) {
      return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50" onClick={onClose}>
          <div className="bg-white rounded-3xl p-8 max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
            <div className="text-center">
              <div className="text-6xl mb-4">⚠️</div>
              <h3 className="text-2xl font-bold mb-4">Analisi Non Disponibile</h3>
              <p className="text-gray-600 mb-6">
                Le probabilità non sono disponibili per questa partita. 
                Potrebbero essere partite già terminate o in corso.
              </p>
              <button
                onClick={onClose}
                className="bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 transition-colors"
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50" onClick={onClose}>
        <div className="bg-white rounded-3xl p-8 max-w-7xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-3xl font-bold flex items-center">
              <span className="text-4xl mr-4">📊</span>
              Analisi Completa: {match.homeTeam?.name} vs {match.awayTeam?.name}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-4xl bg-transparent border-0 focus:outline-none"
            >
              ×
            </button>
          </div>

          <div>
            {/* Probabilità Complete */}
            <div className="grid gap-8">
              <h3 className="text-2xl font-bold mb-6 flex items-center">
                <span className="text-3xl mr-3">🎯</span>
                Probabilità Reali da Dati Storici
              </h3>
              
              <ProbabilitiesDisplay 
                probabilities={match.analysis.probabilities}
                homeTeam={match.homeTeam?.name}
                awayTeam={match.awayTeam?.name}
              />

              {/* H2H DETTAGLIATO QUI */}
              {match.analysis.probabilities.h2hData && match.analysis.probabilities.h2hData.matches && match.analysis.probabilities.h2hData.matches.length > 0 && (
                <div className="mt-8">
                  <HeadToHeadDisplay 
                    h2hData={match.analysis.probabilities.h2hData}
                    homeTeam={match.homeTeam?.name}
                    awayTeam={match.awayTeam?.name}
                  />
                </div>
              )}

              {/* Sidebar con Info Aggiuntive */}
              <div className="mt-8">
                {/* Team Stats Summary - MIGLIORATO */}
                <div className="bg-white p-6 rounded-xl border shadow-sm">
                  <h3 className="text-xl font-bold mb-5">📈 Statistiche Squadre - Ultimi incontri:</h3>                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6"> 
                    {match.analysis.homeForm && (
                      <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                        <h4 className="font-bold text-blue-600 mb-2 flex items-center justify-between">
                          🏠 {match.homeTeam.name} (Casa)
                        </h4>
                        <div className="text-sm space-y-1">
                          <div className="flex justify-between">
                            <span>% Vittorie:</span>
                            <strong className="text-green-600">{match.analysis.homeForm.wins / match.analysis.homeForm.matches}%</strong>
                          </div>
                          <div className="flex justify-between">
                            <span>Media Gol:</span>
                            <strong className="text-blue-600">{match.analysis.homeForm.avgGoalsFor}/partita</strong>
                          </div>
                          <div className="flex justify-between">
                            <span>Risultati:</span>
                            <strong>{match.analysis.homeForm.wins}V-{match.analysis.homeForm.draws}P-{match.analysis.homeForm.losses}S</strong>
                          </div>
                        </div>
                      </div>
                    )}

                    {match.analysis.awayForm && (
                      <div className="mb-4 p-4 bg-red-50 rounded-lg">
                        <h4 className="font-bold text-red-600 mb-2 flex items-center justify-between">
                          ✈️ {match.awayTeam.name} (Trasferta)
                        </h4>
                        <div className="text-sm space-y-1">
                          <div className="flex justify-between">
                            <span>% Vittorie:</span>
                            <strong className="text-green-600">{match.analysis.awayForm.wins / match.analysis.awayForm.matches}%</strong>
                          </div>
                          <div className="flex justify-between">
                            <span>Media Gol:</span>
                            <strong className="text-blue-600">{match.analysis.awayForm.avgGoalsFor}/partita</strong>
                          </div>
                          <div className="flex justify-between">
                            <span>Risultati:</span>
                            <strong>{match.analysis.awayForm.wins}V-{match.analysis.awayForm.draws}P-{match.analysis.awayForm.losses}S</strong>
                          </div>
                        </div>
                      </div>
                    )}

                    {match.analysis.confidence && (
                      <div className="p-3 bg-green-50 rounded flex flex-col items-center justify-center">
                        <div className="text-2xl font-bold text-green-600">{match.analysis.confidence}%</div>
                        <div className="text-sm text-green-700">Precisione Analisi</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function ProbabilitiesDisplay({ probabilities, homeTeam, awayTeam }) {
    if (!probabilities) return <div>Probabilità non disponibili</div>;

    return (
      <div className="space-y-6">
        {/* Risultato 1X2 */}
        <div className="bg-white p-6 rounded-xl border shadow-sm">
          <h3 className="text-xl font-bold mb-4">🎯 Probabilità Risultato</h3>
          
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg text-center border-2 border-blue-200">
              <div className="text-2xl font-bold text-blue-600">{probabilities['1X2']?.home}%</div>
              <div className="text-sm font-medium">Vittoria {homeTeam}</div>
            </div>
            <div className="bg-yellow-50 p-4 rounded-lg text-center border-2 border-yellow-200">
              <div className="text-2xl font-bold text-yellow-600">{probabilities['1X2']?.draw}%</div>
              <div className="text-sm font-medium">Pareggio</div>
            </div>
            <div className="bg-red-50 p-4 rounded-lg text-center border-2 border-red-200">
              <div className="text-2xl font-bold text-red-600">{probabilities['1X2']?.away}%</div>
              <div className="text-sm font-medium">Vittoria {awayTeam}</div>
            </div>
          </div>
        </div>

        {/* Goals */}
        <div className="bg-white p-6 rounded-xl border shadow-sm">
          <h3 className="text-xl font-bold mb-4">⚽ Statistiche Under/Over</h3>
          
          <div className="text-center mb-4">
            <div className="text-3xl font-bold text-green-600">
              {probabilities.goals?.expectedTotal || '2.50'}
            </div>
            <div className="text-sm text-gray-600">Gol Totali Attesi</div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className={`p-4 rounded-lg text-center border-2 ${
              parseFloat(probabilities.goals?.over25 || '50') > 50 ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'
            }`}>
              <div className={`text-2xl font-bold ${
                parseFloat(probabilities.goals?.over25 || '50') > 50 ? 'text-green-600' : 'text-orange-600'
              }`}>
                {probabilities.goals?.over25}%
              </div>
              <div className="text-sm font-medium">Over 2.5 Gol</div>
            </div>
            <div className={`p-4 rounded-lg text-center border-2 ${
              parseFloat(probabilities.goals?.under25 || '50') > 50 ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'
            }`}>
              <div className={`text-2xl font-bold ${
                parseFloat(probabilities.goals?.under25 || '50') > 50 ? 'text-orange-600' : 'text-green-600'
              }`}>
                {probabilities.goals?.under25}%
              </div>
              <div className="text-sm font-medium">Under 2.5 Gol</div>
            </div>
          </div>
        </div>

        {/* BTTS */}
        <div className="bg-white p-6 rounded-xl border shadow-sm">
          <h3 className="text-xl font-bold mb-4">🥅 Statistiche Goal/NoGoal</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div className={`p-4 rounded-lg text-center border-2 ${
              parseFloat(probabilities.btts?.btts_yes || '50') > 50 ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'
            }`}>
              <div className={`text-2xl font-bold ${
                parseFloat(probabilities.btts?.btts_yes || '50') > 50 ? 'text-green-600' : 'text-blue-600'
              }`}>
                {probabilities.btts?.btts_yes}%
              </div>
              <div className="text-sm font-medium">Goal</div>
            </div>
            <div className={`p-4 rounded-lg text-center border-2 ${
              parseFloat(probabilities.btts?.btts_no || '50') > 50 ? 'bg-blue-50 border-blue-200' : 'bg-green-50 border-green-200'
            }`}>
              <div className={`text-2xl font-bold ${
                parseFloat(probabilities.btts?.btts_no || '50') > 50 ? 'text-blue-600' : 'text-green-600'
              }`}>
                {probabilities.btts?.btts_no}%
              </div>
              <div className="text-sm font-medium">NoGoal</div>
            </div>
          </div>

          {/* Probabilità individuali */}
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
  }

  // Componente Head-to-Head Dettagliato
  function HeadToHeadDisplay({ h2hData, homeTeam, awayTeam }) {
    if (!h2hData || !h2hData.matches || h2hData.matches.length === 0) {
      return (
        <div className="bg-white p-6 rounded-xl border shadow-sm text-center">
          <h3 className="text-xl font-bold mb-4">📊 Scontri Diretti</h3>
          <div className="text-center py-8">
            <div className="text-4xl mb-3">🤷‍♂️</div>
            <p className="text-gray-500">Nessun dato head-to-head disponibile</p>
          </div>
        </div>
      );
    }

    const { matches, summary } = h2hData;

    return (
      <div className="bg-white p-6 rounded-xl border shadow-sm">
        <h3 className="text-xl font-bold mb-4 text-center">
          📊 Scontri Diretti ({matches.length} partite)
        </h3>
        
        {summary && (
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-xl border-2 border-blue-200 mb-6">
            <h4 className="font-bold text-lg mb-4 text-center text-blue-800">📈 Statistiche Aggregate (Ultimi {matches.length} Scontri)</h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center bg-white p-4 rounded-lg shadow-sm">
                <div className="text-3xl font-bold text-green-600">
                  {summary.avgTotalGoals || '0.00'}
                </div>
                <div className="text-sm font-semibold text-green-700">Media Gol Totali</div>
                <div className="text-xs text-gray-600">per partita</div>
              </div>
              <div className="text-center bg-white p-4 rounded-lg shadow-sm">
                <div className="text-3xl font-bold text-blue-600">
                  {summary.bttsPercentage || '0.0'}%
                </div>
                <div className="text-sm font-semibold text-blue-700">Goal</div>
                <div className="text-xs text-gray-600">entrambe segnano</div>
              </div>
              <div className="text-center bg-white p-4 rounded-lg shadow-sm">
                <div className="text-3xl font-bold text-purple-600">
                  {summary.over25Percentage || '0.0'}%
                </div>
                <div className="text-sm font-semibold text-purple-700">Over 2.5</div>
                <div className="text-xs text-gray-600">3+ gol totali</div>
              </div>
            </div>
            
            <div className="mt-4 text-center">
              <div className="text-xs text-blue-600 bg-blue-100 px-3 py-1 rounded-full inline-block">
                ℹ️ Queste statistiche H2H influenzano i calcoli delle probabilità generali
              </div>
            </div>
          </div>
        )}

        {/* Bilancio vittorie */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center bg-blue-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">{summary?.currentHomeTeamWins || 0}</div>
            <div className="text-sm font-semibold text-blue-700">{homeTeam}</div>
            <div className="text-xs text-gray-600">vittorie storiche</div>
          </div>
          <div className="text-center bg-yellow-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">{summary?.draws || 0}</div>
            <div className="text-sm font-semibold text-yellow-700">Pareggi</div>
            <div className="text-xs text-gray-600">negli scontri</div>
          </div>
          <div className="text-center bg-red-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-red-600">{summary?.currentAwayTeamWins || 0}</div>
            <div className="text-sm font-semibold text-red-700">{awayTeam}</div>
            <div className="text-xs text-gray-600">vittorie storiche</div>
          </div>
        </div>

        {/* CRONOLOGIA DETTAGLIATA */}
        <div className="mt-6">
          <h5 className="font-bold mb-3">Cronologia Scontri Diretti (più recenti prima):</h5>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {matches.slice(0, 10).map((match, index) => (
              <div key={index} className="flex justify-between items-center bg-gray-50 p-3 rounded text-sm">
                <div className="text-xs text-gray-600 w-24">
                  {new Date(match.date).toLocaleDateString('it-IT')}
                </div>
                <div className="flex-1 text-center">
                  <div className="text-xs mb-1 text-gray-600">
                    {match.homeTeamName} vs {match.awayTeamName}
                  </div>
                  <div className="text-lg font-bold">
                    {match.homeGoals} - {match.awayGoals}
                  </div>
                </div>
                <div className="text-center w-20">
                  <div className="text-xs space-x-1">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                      match.totalGoals > 2.5 ? 'bg-green-200 text-green-800' : 'bg-orange-200 text-orange-800'
                    }`}>
                      {match.totalGoals > 2.5 ? 'O2.5' : 'U2.5'}
                    </span>
                    {match.isBTTS && (
                      <span className="bg-purple-200 text-purple-800 px-2 py-1 rounded text-xs font-bold">GG</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    ({match.totalGoals}g)
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
};

export default FootballStatsApp;