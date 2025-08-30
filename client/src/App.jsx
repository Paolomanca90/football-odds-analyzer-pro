// App.jsx - Frontend aggiornato per gestire tutte le partite della stagione
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './App.css';

// ===========================================
// CONFIGURAZIONE API BACKEND
// ===========================================
const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

const API_BASE_URL = isDevelopment 
  ? 'http://localhost:3001/api'
  : `${window.location.origin}/api`;

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
    const [activeTab, setActiveTab] = useState('fullTime');
    const [analysis, setAnalysis] = useState(null);
    const [loading, setLoading] = useState(true);
    
    console.log('🔍 Opening extended analysis modal for match:', match);

    // Carica analisi estesa
    useEffect(() => {
      const fetchExtendedAnalysis = async () => {
        try {
          setLoading(true);
          console.log('🔄 Loading extended analysis...');
          
          const response = await api.get(`/extended-analysis/${match.homeTeam.id}/${match.awayTeam.id}`, {
            params: { league: selectedLeague }
          });
          
          if (response.data.success) {
            setAnalysis(response.data.analysis);
            console.log('✅ Extended analysis loaded:', response.data.analysis);
          }
        } catch (error) {
          console.error('❌ Error loading extended analysis:', error);
          // Fallback alla vecchia analisi se l'estesa fallisce
          setAnalysis(match.analysis?.probabilities || null);
        } finally {
          setLoading(false);
        }
      };

      fetchExtendedAnalysis();
    }, [match]);

    if (loading) {
      return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-2xl w-full text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600 mx-auto mb-4"></div>
            <h3 className="text-xl font-bold mb-2">Analisi Multi-Tempo in Corso...</h3>
            <p className="text-gray-600">
              Caricamento statistiche 1° tempo, 2° tempo e finali
            </p>
          </div>
        </div>
      );
    }

    if (!analysis) {
      return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50" onClick={onClose}>
          <div className="bg-white rounded-3xl p-8 max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
            <div className="text-center">
              <div className="text-6xl mb-4">⚠️</div>
              <h3 className="text-2xl font-bold mb-4">Analisi Non Disponibile</h3>
              <p className="text-gray-600 mb-6">
                L'analisi multi-tempo non è disponibile per questa partita. 
                Potrebbero essere partite già terminate o senza dati storici sufficienti.
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

    // Controlla se abbiamo analisi estesa o standard
    const isExtendedAnalysis = analysis.fullTime || analysis.halfTime;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50" onClick={onClose}>
        <div className="bg-white rounded-3xl p-8 max-w-7xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-3xl font-bold flex items-center">
              <span className="text-4xl mr-4">📊</span>
              {isExtendedAnalysis ? 'Analisi Multi-Tempo' : 'Analisi Completa'}: {match.homeTeam?.name} vs {match.awayTeam?.name}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-4xl bg-transparent border-0 focus:outline-none"
            >
              ×
            </button>
          </div>

          <div>
            {isExtendedAnalysis ? (
              <div>
                {/* Tab per i diversi tempi */}
                <TimePeriodsTab activeTab={activeTab} setActiveTab={setActiveTab} />

                {/* Display delle probabilità per il tempo selezionato */}
                <ExtendedProbabilitiesDisplay 
                  analysis={analysis}
                  homeTeam={match.homeTeam?.name}
                  awayTeam={match.awayTeam?.name}
                  activeTab={activeTab}
                />

                {/* H2H esteso (sempre visibile) */}
                {analysis.h2hData && (
                  <div className="mt-8">
                    <ExtendedHeadToHeadDisplay 
                      h2hData={analysis.h2hData}
                      homeTeam={match.homeTeam?.name}
                      awayTeam={match.awayTeam?.name}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div>
                {/* Analisi standard (fallback per compatibilità) */}
                <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-200 mb-6">
                  <div className="flex items-center">
                    <span className="text-2xl mr-3">ℹ️</span>
                    <div>
                      <h4 className="font-bold text-yellow-800">Analisi Standard</h4>
                      <p className="text-yellow-700 text-sm">
                        Analisi basata su dati completi di fine partita. 
                        L'analisi multi-tempo sarà disponibile con più dati storici.
                      </p>
                    </div>
                  </div>
                </div>

                <ProbabilitiesDisplay 
                  probabilities={analysis}
                  homeTeam={match.homeTeam?.name}
                  awayTeam={match.awayTeam?.name}
                />

                {analysis.h2hData && (
                  <div className="mt-8">
                    <HeadToHeadDisplay 
                      h2hData={analysis.h2hData}
                      homeTeam={match.homeTeam?.name}
                      awayTeam={match.awayTeam?.name}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
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

// Componente Tab per i diversi tempi
const TimePeriodsTab = ({ activeTab, setActiveTab }) => {
  const tabs = [
      { 
          id: 'fullTime', 
          label: '90\' Finale', 
          icon: '⚽', 
          desc: 'Risultato completo'
      },
      { 
          id: 'halfTime', 
          label: '45\' Primo Tempo', 
          icon: '🕐', 
          desc: 'Solo 1° tempo'
      },
      { 
          id: 'secondHalf', 
          label: '45\' Secondo Tempo', 
          icon: '🕕', 
          desc: 'Solo 2° tempo (45-90min)'
      }
  ];

  return (
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-3 mb-8 border border-blue-200">
          {/* Header esplicativo */}
          <div className="text-center mb-4">
              <h3 className="text-xl font-bold text-blue-800">
                  📊 Analisi Multi-Periodo Completa
              </h3>
          </div>
          
          {/* Grid dei tab */}
          <div className="grid grid-cols-3 gap-2">
              {tabs.map(tab => (
                  <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex flex-col items-center justify-center space-y-2 py-4 px-4 rounded-lg font-semibold transition-all transform hover:scale-105 border-0 focus:outline-none ${
                          activeTab === tab.id
                              ? 'bg-white text-blue-600 shadow-lg scale-105'
                              : 'text-gray-600 hover:text-gray-800 hover:bg-white/50'
                      }`}
                  >
                      <span className="text-3xl">{tab.icon}</span>
                      <div className="text-center">
                          <div className="text-sm font-bold">{tab.label}</div>
                          <div className="text-xs opacity-75">{tab.desc}</div>
                      </div>
                      {activeTab === tab.id && (
                          <div className="w-full h-1 bg-blue-600 rounded-full mt-2"></div>
                      )}
                  </button>
              ))}
          </div>
      </div>
  );
};

// Componente per display probabilità estese
const ExtendedProbabilitiesDisplay = ({ analysis, homeTeam, awayTeam, activeTab }) => {
    console.log('🔍 Displaying extended probabilities for tab:', activeTab, analysis);
    if (!analysis) return <div>Analisi non disponibile</div>;

    const currentData = analysis[activeTab];
    if (!currentData) return <div>Dati non disponibili per questo periodo</div>;

    // Titoli dinamici basati sul tab
    const titles = {
        fullTime: { 
            period: 'Risultato Finale (90\')', 
            goalThreshold: 'Under/Over Totali (90 minuti)',
            description: 'Probabilità per l\'intero match'
        },
        halfTime: { 
            period: 'Primo Tempo (45\')', 
            goalThreshold: 'Under/Over Primo Tempo (45 minuti)',
            description: 'Statistiche solo per i primi 45 minuti'
        },
        secondHalf: { 
            period: 'Secondo Tempo (45\')', 
            goalThreshold: 'Under/Over Secondo Tempo (45-90 minuti)',
            description: 'Statistiche solo per i minuti 45-90'
        }
    };

    return (
        <div className="space-y-6">
            {/* RISULTATO 1X2 - SEMPRE PRESENTE */}
            <div className="bg-white p-6 rounded-xl border shadow-sm">
                <h3 className="text-xl font-bold mb-4">
                    🎯 Probabilità {titles[activeTab].period}
                </h3>
                
                <div className="grid grid-cols-3 gap-4">
                    <div className="bg-blue-50 p-4 rounded-lg text-center border-2 border-blue-200 hover:shadow-md transition-shadow">
                        <div className="text-3xl font-bold text-blue-600">{currentData['1X2']?.home || '0.0'}%</div>
                        <div className="text-sm font-medium">Vittoria {homeTeam}</div>
                        {activeTab === 'halfTime' && <div className="text-xs text-gray-500 mt-1">in vantaggio al 45'</div>}
                        {activeTab === 'secondHalf' && <div className="text-xs text-gray-500 mt-1">vince nel 2° tempo</div>}
                    </div>
                    <div className="bg-yellow-50 p-4 rounded-lg text-center border-2 border-yellow-200 hover:shadow-md transition-shadow">
                        <div className="text-3xl font-bold text-yellow-600">{currentData['1X2']?.draw || '0.0'}%</div>
                        <div className="text-sm font-medium">Pareggio</div>
                        {activeTab === 'halfTime' && <div className="text-xs text-gray-500 mt-1">pari al 45'</div>}
                        {activeTab === 'secondHalf' && <div className="text-xs text-gray-500 mt-1">pari nel 2° tempo</div>}
                    </div>
                    <div className="bg-red-50 p-4 rounded-lg text-center border-2 border-red-200 hover:shadow-md transition-shadow">
                        <div className="text-3xl font-bold text-red-600">{currentData['1X2']?.away || '0.0'}%</div>
                        <div className="text-sm font-medium">Vittoria {awayTeam}</div>
                        {activeTab === 'halfTime' && <div className="text-xs text-gray-500 mt-1">in vantaggio al 45'</div>}
                        {activeTab === 'secondHalf' && <div className="text-xs text-gray-500 mt-1">vince nel 2° tempo</div>}
                    </div>
                </div>
            </div>

            {/* Goals Over/Under - usa il componente esistente */}
            <GoalsSection currentData={currentData} activeTab={activeTab} />

            {/* BTTS - usa il componente esistente */}
            <BTTSSection currentData={currentData} activeTab={activeTab} homeTeam={homeTeam} awayTeam={awayTeam} />
        </div>
    );
};

// Componente Goals separato per gestire meglio la logica
const GoalsSection = ({ currentData, activeTab }) => {
  // Definizione di tutte le soglie
  const thresholds = [
      { key: '05', label: '0.5', description: 'Almeno 1 gol', color: 'blue' },
      { key: '15', label: '1.5', description: 'Almeno 2 gol', color: 'purple' },
      { key: '25', label: '2.5', description: 'Almeno 3 gol', color: 'green' },
      { key: '35', label: '3.5', description: 'Almeno 4 gol', color: 'red' }
  ];

  // Labels dinamici per periodo
  const periodLabels = {
      fullTime: 'nell\'intero match (90 min)',
      halfTime: 'nel primo tempo (45 min)',
      secondHalf: 'nel secondo tempo (45-90 min)'
  };

  // Titoli dinamici
  const titles = {
      fullTime: 'Under/Over Totali (90 minuti)',
      halfTime: 'Under/Over Primo Tempo (45 minuti)', 
      secondHalf: 'Under/Over Secondo Tempo (45-90 minuti)'
  };

  return (
      <div className="bg-white p-6 rounded-xl border shadow-sm">
          <h3 className="text-xl font-bold mb-4">⚽ {titles[activeTab]}</h3>
          
          {/* Gol attesi */}
          <div className="text-center mb-6">
              <div className="text-4xl font-bold text-green-600">
                  {currentData.goals?.expectedTotal || '0.00'}
              </div>
              <div className="text-sm text-gray-600">
                  Gol Attesi {periodLabels[activeTab]}
              </div>
          </div>
          
          {/* GRID COMPLETO TUTTE LE SOGLIE */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {thresholds.map(threshold => {
                  const overKey = `over${threshold.key}`;
                  const underKey = `under${threshold.key}`;
                  const overValue = parseFloat(currentData.goals?.[overKey] || '50');
                  const underValue = parseFloat(currentData.goals?.[underKey] || '50');
                  const isOverFavorite = overValue > underValue;
                  
                  return (
                      <div key={threshold.key} className="bg-gray-50 rounded-lg p-4 hover:shadow-md transition-shadow">
                          {/* Header soglia */}
                          <div className="text-center mb-3">
                              <div className="text-lg font-bold text-gray-800">
                                  Over/Under {threshold.label}
                              </div>
                              <div className="text-xs text-gray-500">{threshold.description}</div>
                          </div>
                          
                          {/* Over */}
                          <div className={`flex justify-between items-center p-3 rounded-lg mb-2 transition-all ${
                              isOverFavorite 
                                  ? `bg-${threshold.color}-100 border-l-4 border-${threshold.color}-500 shadow-sm` 
                                  : 'bg-white border border-gray-200'
                          }`}>
                              <span className="text-sm font-medium">Over {threshold.label}</span>
                              <span className={`font-bold text-lg ${
                                  isOverFavorite ? `text-${threshold.color}-700` : 'text-gray-600'
                              }`}>
                                  {overValue.toFixed(1)}%
                              </span>
                          </div>
                          
                          {/* Under */}
                          <div className={`flex justify-between items-center p-3 rounded-lg mb-3 transition-all ${
                              !isOverFavorite 
                                  ? 'bg-orange-100 border-l-4 border-orange-500 shadow-sm' 
                                  : 'bg-white border border-gray-200'
                          }`}>
                              <span className="text-sm font-medium">Under {threshold.label}</span>
                              <span className={`font-bold text-lg ${
                                  !isOverFavorite ? 'text-orange-700' : 'text-gray-600'
                              }`}>
                                  {underValue.toFixed(1)}%
                              </span>
                          </div>
                          
                          {/* Indicatore visivo */}
                          <div className="space-y-1">
                              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                  <div 
                                      className={`h-full transition-all ${
                                          isOverFavorite ? `bg-${threshold.color}-500` : 'bg-orange-500'
                                      }`}
                                      style={{ width: `${Math.max(overValue, underValue)}%` }}
                                  ></div>
                              </div>
                              <div className="text-xs text-center text-gray-500">
                                  <span className="font-semibold">
                                      {isOverFavorite ? 'Over' : 'Under'} Favorito
                                  </span>
                                  {Math.abs(overValue - underValue) > 20 && (
                                      <span className="ml-1 text-green-600">(Alta confidenza)</span>
                                  )}
                              </div>
                          </div>
                      </div>
                  );
              })}
          </div>
          
          {/* RIEPILOGO RACCOMANDAZIONI */}
          <div className="bg-blue-50 rounded-lg p-4">
              <h4 className="font-bold text-blue-800 mb-3 text-center">
                  <span className="text-lg mr-2">🎯</span>
                  Raccomandazioni {titles[activeTab]}
              </h4>
              {/* Bet sicure */}
              <div className="w-full lg:w-2/3 mx-auto">
                  <div className="font-semibold text-blue-700 mb-2">📈 Bet più Sicure (confidenza &gt;20%):</div>
                  <div className="space-y-1">
                      {thresholds.map(t => {
                          const overVal = parseFloat(currentData.goals?.[`over${t.key}`] || '50');
                          const underVal = parseFloat(currentData.goals?.[`under${t.key}`] || '50');
                          const confidence = Math.abs(overVal - underVal);
                          if (confidence > 20) {
                              return (
                                  <div key={t.key} className="flex justify-between items-center bg-white px-2 py-1 rounded">
                                      <span className="text-blue-600">
                                          {overVal > underVal ? 'Over' : 'Under'} {t.label}
                                      </span>
                                      <span className="font-bold text-green-600">
                                          {Math.max(overVal, underVal).toFixed(1)}%
                                      </span>
                                  </div>
                              );
                          }
                          return null;
                      }).filter(Boolean)}
                  </div>
              </div>
          </div>
      </div>
  );
};

// H2H esteso con tutti i tempi
const ExtendedHeadToHeadDisplay = ({ h2hData, homeTeam, awayTeam }) => {
    if (!h2hData || !h2hData.matches || h2hData.matches.length === 0) {
        return (
            <div className="bg-white p-6 rounded-xl border shadow-sm text-center">
                <h3 className="text-xl font-bold mb-4">📊 Scontri Diretti Multi-Tempo</h3>
                <div className="text-center py-8">
                    <div className="text-6xl mb-4">🤷‍♂️</div>
                    <h4 className="text-lg font-bold text-gray-700 mb-2">Nessun dato H2H disponibile</h4>
                    <p className="text-gray-500">
                        Non ci sono abbastanza scontri diretti recenti tra queste squadre.
                        <br />L'analisi si basa sulla forma recente delle squadre.
                    </p>
                </div>
            </div>
        );
    }

    const { matches, summary } = h2hData;

    // Tutte le soglie per ogni tempo
    const thresholds = [
        { key: '05', label: '0.5', color: 'blue' },
        { key: '15', label: '1.5', color: 'purple' },
        { key: '25', label: '2.5', color: 'green' },
        { key: '35', label: '3.5', color: 'red' }
    ];

    return (
        <div className="bg-white p-6 rounded-xl border shadow-sm">
            <h3 className="text-xl font-bold mb-4 text-center">
                📊 Scontri Diretti Multi-Tempo ({matches.length} partite)
            </h3>
            
            {/* STATISTICHE AGGREGATE COMPLETE */}
            {summary && (
                <div className="bg-gradient-to-r from-blue-50 via-purple-50 to-green-50 p-6 rounded-xl border-2 border-blue-200 mb-6">
                    <h4 className="font-bold text-lg mb-6 text-center text-blue-800">
                        📈 Statistiche Aggregate H2H (Tutte le Soglie)
                    </h4>
                    
                    {/* GRID PER OGNI TEMPO */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* === PRIMO TEMPO === */}
                        <div className="bg-white p-5 rounded-lg shadow-sm border-l-4 border-blue-500">
                            <h5 className="font-bold text-center text-blue-600 mb-4 flex items-center justify-center">
                                <span className="text-2xl mr-2">🕐</span>
                                Primo Tempo (45min)
                            </h5>
                            
                            {/* Media gol */}
                            <div className="text-center bg-blue-50 p-3 rounded-lg mb-4">
                                <div className="text-3xl font-bold text-blue-700">{summary.avgGoalsHT}</div>
                                <div className="text-sm text-blue-600">Media Gol Primo Tempo</div>
                            </div>
                            
                            {/* Tutte le soglie primo tempo */}
                            <div className="space-y-2 mb-4">
                                <div className="font-semibold text-blue-700 text-sm text-center mb-2">Soglie Over (1T):</div>
                                {thresholds.map(t => {
                                    const pct = summary[`over${t.key}HT_pct`];
                                    if (pct && parseFloat(pct) > 0) {
                                        return (
                                            <div key={t.key} className="flex justify-between items-center p-2 bg-gray-50 rounded text-sm">
                                                <span className="font-medium">Over {t.label}:</span>
                                                <span className={`font-bold px-2 py-1 rounded text-${t.color}-700 bg-${t.color}-100`}>
                                                    {pct}%
                                                </span>
                                            </div>
                                        );
                                    }
                                    return null;
                                })}
                            </div>
                            
                            {/* BTTS primo tempo */}
                            <div className="border-t pt-3 mb-3">
                                <div className="flex justify-between items-center p-2 bg-orange-50 rounded">
                                    <span className="font-medium text-sm">Goal 1T:</span>
                                    <strong className="text-orange-700">{summary.bttsHT_pct}%</strong>
                                </div>
                            </div>
                            
                            {/* Risultati primo tempo */}
                            <div className="bg-gray-50 p-3 rounded text-xs">
                                <div className="font-semibold text-blue-700 text-center mb-2">Risultati Primo Tempo</div>
                                <div className="grid grid-cols-3 gap-1 text-center">
                                    <div><strong>{homeTeam.substring(0,8)}:</strong><br/>{summary.homeWinsHT}W</div>
                                    <div><strong>Pareggi:</strong><br/>{summary.drawsHT}X</div>
                                    <div><strong>{awayTeam.substring(0,8)}:</strong><br/>{summary.awayWinsHT}W</div>
                                </div>
                            </div>
                        </div>

                        {/* === SECONDO TEMPO === */}
                        <div className="bg-white p-5 rounded-lg shadow-sm border-l-4 border-green-500">
                            <h5 className="font-bold text-center text-green-600 mb-4 flex items-center justify-center">
                                <span className="text-2xl mr-2">🕕</span>
                                Secondo Tempo (45-90min)
                            </h5>
                            
                            {/* Media gol secondo tempo */}
                            <div className="text-center bg-green-50 p-3 rounded-lg mb-4">
                                <div className="text-3xl font-bold text-green-700">{summary.avgGoals2H}</div>
                                <div className="text-sm text-green-600">Media Gol Secondo Tempo</div>
                            </div>
                            
                            {/* Tutte le soglie secondo tempo */}
                            <div className="space-y-2 mb-4">
                                <div className="font-semibold text-green-700 text-sm text-center mb-2">Soglie Over (2T):</div>
                                {thresholds.map(t => {
                                    const pct = summary[`over${t.key}2H_pct`];
                                    if (pct && parseFloat(pct) > 0) {
                                        return (
                                            <div key={t.key} className="flex justify-between items-center p-2 bg-gray-50 rounded text-sm">
                                                <span className="font-medium">Over {t.label}:</span>
                                                <span className={`font-bold px-2 py-1 rounded text-${t.color}-700 bg-${t.color}-100`}>
                                                    {pct}%
                                                </span>
                                            </div>
                                        );
                                    }
                                    return null;
                                })}
                            </div>
                            
                            {/* BTTS secondo tempo */}
                            <div className="border-t pt-3 mb-3">
                                <div className="flex justify-between items-center p-2 bg-orange-50 rounded">
                                    <span className="font-medium text-sm">Goal 2T:</span>
                                    <strong className="text-orange-700">{summary.btts2H_pct}%</strong>
                                </div>
                            </div>
                            
                            <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                                <strong>Nota:</strong> Gol segnati dal 45° al 90° minuto
                            </div>
                        </div>

                        {/* === FINALE === */}
                        <div className="bg-white p-5 rounded-lg shadow-sm border-l-4 border-red-500">
                            <h5 className="font-bold text-center text-red-600 mb-4 flex items-center justify-center">
                                <span className="text-2xl mr-2">⚽</span>
                                Finale (90min)
                            </h5>
                            
                            {/* Media gol totale */}
                            <div className="text-center bg-red-50 p-3 rounded-lg mb-4">
                                <div className="text-3xl font-bold text-red-700">{summary.avgGoalsFT}</div>
                                <div className="text-sm text-red-600">Media Gol Totali</div>
                            </div>
                            
                            {/* Tutte le soglie finale */}
                            <div className="space-y-2 mb-4">
                                <div className="font-semibold text-red-700 text-sm text-center mb-2">Soglie Over (FT):</div>
                                {thresholds.map(t => {
                                    const pct = summary[`over${t.key}FT_pct`];
                                    if (pct && parseFloat(pct) > 0) {
                                        return (
                                            <div key={t.key} className="flex justify-between items-center p-2 bg-gray-50 rounded text-sm">
                                                <span className="font-medium">Over {t.label}:</span>
                                                <span className={`font-bold px-2 py-1 rounded text-${t.color}-700 bg-${t.color}-100`}>
                                                    {pct}%
                                                </span>
                                            </div>
                                        );
                                    }
                                    return null;
                                })}
                            </div>
                            
                            {/* BTTS finale */}
                            <div className="border-t pt-3 mb-3">
                                <div className="flex justify-between items-center p-2 bg-orange-50 rounded">
                                    <span className="font-medium text-sm">Goal FT:</span>
                                    <strong className="text-orange-700">{summary.bttsFT_pct}%</strong>
                                </div>
                            </div>
                            
                            {/* Risultati finali */}
                            <div className="bg-gray-50 p-3 rounded text-xs">
                                <div className="font-semibold text-red-700 text-center mb-2">Risultati Finali</div>
                                <div className="grid grid-cols-3 gap-1 text-center">
                                    <div><strong>{homeTeam.substring(0,8)}:</strong><br/>{summary.homeWinsFT}W</div>
                                    <div><strong>Pareggi:</strong><br/>{summary.drawsFT}X</div>
                                    <div><strong>{awayTeam.substring(0,8)}:</strong><br/>{summary.awayWinsFT}W</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    {/* RIEPILOGO RACCOMANDAZIONI H2H */}
                    <div className="bg-white rounded-lg p-5 border-2 border-gray-200 mt-6">
                        <h4 className="font-bold text-gray-800 mb-4 text-center flex items-center justify-center">
                            <span className="text-xl mr-2">🎯</span>
                            Raccomandazioni Basate su Scontri Diretti
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
                            {/* Raccomandazioni Primo Tempo */}
                            <div className="space-y-2">
                                <div className="font-semibold text-blue-700 text-center mb-3 pb-2 border-b border-blue-200">
                                    🕐 Primo Tempo
                                </div>
                                {thresholds.map(t => {
                                    const pct = parseFloat(summary[`over${t.key}HT_pct`] || '0');
                                    if (pct > 70) {
                                        return (
                                            <div key={t.key} className="flex justify-between items-center bg-blue-50 px-3 py-2 rounded">
                                                <span className="text-blue-700 font-medium">Over {t.label}</span>
                                                <span className="font-bold text-blue-800">{pct}%</span>
                                            </div>
                                        );
                                    } else if (pct < 30) {
                                        return (
                                            <div key={t.key} className="flex justify-between items-center bg-orange-50 px-3 py-2 rounded">
                                                <span className="text-orange-700 font-medium">Under {t.label}</span>
                                                <span className="font-bold text-orange-800">{(100-pct).toFixed(1)}%</span>
                                            </div>
                                        );
                                    }
                                    return null;
                                }).filter(Boolean)}
                                {parseFloat(summary.bttsHT_pct) > 60 && (
                                    <div className="flex justify-between items-center bg-green-50 px-3 py-2 rounded">
                                        <span className="text-green-700 font-medium">Goal 1T</span>
                                        <span className="font-bold text-green-800">{summary.bttsHT_pct}%</span>
                                    </div>
                                )}
                                {parseFloat(summary.bttsHT_pct) < 40 && (
                                    <div className="flex justify-between items-center bg-gray-50 px-3 py-2 rounded">
                                        <span className="text-gray-700 font-medium">NoGoal 1T</span>
                                        <span className="font-bold text-gray-800">{(100-parseFloat(summary.bttsHT_pct)).toFixed(1)}%</span>
                                    </div>
                                )}
                            </div>
                            
                            {/* Raccomandazioni Secondo Tempo */}
                            <div className="space-y-2">
                                <div className="font-semibold text-green-700 text-center mb-3 pb-2 border-b border-green-200">
                                    🕕 Secondo Tempo
                                </div>
                                {thresholds.map(t => {
                                    const pct = parseFloat(summary[`over${t.key}2H_pct`] || '0');
                                    if (pct > 70) {
                                        return (
                                            <div key={t.key} className="flex justify-between items-center bg-green-50 px-3 py-2 rounded">
                                                <span className="text-green-700 font-medium">Over {t.label}</span>
                                                <span className="font-bold text-green-800">{pct}%</span>
                                            </div>
                                        );
                                    } else if (pct < 30) {
                                        return (
                                            <div key={t.key} className="flex justify-between items-center bg-orange-50 px-3 py-2 rounded">
                                                <span className="text-orange-700 font-medium">Under {t.label}</span>
                                                <span className="font-bold text-orange-800">{(100-pct).toFixed(1)}%</span>
                                            </div>
                                        );
                                    }
                                    return null;
                                }).filter(Boolean)}
                                {parseFloat(summary.btts2H_pct) > 60 && (
                                    <div className="flex justify-between items-center bg-green-50 px-3 py-2 rounded">
                                        <span className="text-green-700 font-medium">Goal 2T</span>
                                        <span className="font-bold text-green-800">{summary.btts2H_pct}%</span>
                                    </div>
                                )}
                            </div>
                            
                            {/* Raccomandazioni Finale */}
                            <div className="space-y-2">
                                <div className="font-semibold text-red-700 text-center mb-3 pb-2 border-b border-red-200">
                                    ⚽ Finale
                                </div>
                                {thresholds.map(t => {
                                    const pct = parseFloat(summary[`over${t.key}FT_pct`] || '0');
                                    if (pct > 70) {
                                        return (
                                            <div key={t.key} className="flex justify-between items-center bg-red-50 px-3 py-2 rounded">
                                                <span className="text-red-700 font-medium">Over {t.label}</span>
                                                <span className="font-bold text-red-800">{pct}%</span>
                                            </div>
                                        );
                                    } else if (pct < 30) {
                                        return (
                                            <div key={t.key} className="flex justify-between items-center bg-orange-50 px-3 py-2 rounded">
                                                <span className="text-orange-700 font-medium">Under {t.label}</span>
                                                <span className="font-bold text-orange-800">{(100-pct).toFixed(1)}%</span>
                                            </div>
                                        );
                                    }
                                    return null;
                                }).filter(Boolean)}
                                {parseFloat(summary.bttsFT_pct) > 60 && (
                                    <div className="flex justify-between items-center bg-green-50 px-3 py-2 rounded">
                                        <span className="text-green-700 font-medium">Goal FT</span>
                                        <span className="font-bold text-green-800">{summary.bttsFT_pct}%</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* CRONOLOGIA PARTITE CON ANALISI COMPLETA */}
            <div className="mt-8">
                <h5 className="font-bold mb-4 text-center">
                    <span className="text-lg mr-2">📋</span>
                    Cronologia Partite con Analisi Multi-Soglia
                </h5>
                <div className="text-sm text-gray-600 mb-4 text-center">
                    Ogni partita mostra i risultati per tutti i tempi e tutte le soglie Over/Under
                </div>
                
                <div className="space-y-4 max-h-96 overflow-y-auto">
                    {matches.slice(0, 8).map((match, index) => (
                      <div key={index} className="bg-gradient-to-r from-gray-50 to-blue-50 p-5 rounded-lg border hover:shadow-md transition-shadow">
                          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                              {/* DATA E SQUADRE (invariato) */}
                              <div className="lg:w-32 flex-shrink-0">
                                  <div className="text-sm font-bold text-gray-700">
                                      {new Date(match.date).toLocaleDateString('it-IT', { 
                                          day: '2-digit', 
                                          month: '2-digit', 
                                          year: '2-digit' 
                                      })}
                                  </div>
                                  <div className="text-xs text-gray-500 mt-1">
                                      {match.homeTeamName.split(' ').slice(0,2).join(' ')} 
                                      <br />vs<br />
                                      {match.awayTeamName.split(' ').slice(0,2).join(' ')}
                                  </div>
                              </div>
                              
                              {/* RISULTATI (invariato) */}
                              <div className="flex-1">
                                  <div className="flex justify-center items-center gap-6 mb-3">
                                      {/* Primo tempo */}
                                      <div className="text-center">
                                          <div className={`text-lg font-bold px-3 py-2 rounded-lg ${
                                              match.totalGoalsHT > 2.5 ? 'bg-green-200 text-green-800' :
                                              match.totalGoalsHT > 1.5 ? 'bg-blue-200 text-blue-800' :
                                              match.totalGoalsHT > 0.5 ? 'bg-purple-100 text-purple-700' :
                                              'bg-gray-100 text-gray-600'
                                          }`}>
                                              {match.scoreHT}
                                          </div>
                                          <div className="text-xs text-blue-500 mt-1 font-medium">1° Tempo</div>
                                      </div>
                                      
                                      <div className="text-2xl font-bold text-gray-400">→</div>
                                      
                                      {/* Finale */}
                                      <div className="text-center">
                                          <div className={`text-xl font-bold px-4 py-2 rounded-lg border-2 ${
                                              match.totalGoalsFT > 3.5 ? 'bg-red-100 border-red-300 text-red-800' :
                                              match.totalGoalsFT > 2.5 ? 'bg-green-100 border-green-300 text-green-800' :
                                              match.totalGoalsFT > 1.5 ? 'bg-yellow-100 border-yellow-300 text-yellow-800' :
                                              'bg-gray-100 border-gray-300 text-gray-700'
                                          }`}>
                                              {match.scoreFT}
                                          </div>
                                          <div className="text-xs text-gray-600 mt-1 font-medium">Finale</div>
                                      </div>
                                      
                                      <div className="text-2xl font-bold text-gray-400">→</div>
                                      
                                      {/* Secondo tempo */}
                                      <div className="text-center">
                                          <div className={`text-lg font-bold px-3 py-2 rounded-lg ${
                                              match.totalGoals2H > 2.5 ? 'bg-red-200 text-red-800' :
                                              match.totalGoals2H > 1.5 ? 'bg-green-200 text-green-800' :
                                              match.totalGoals2H > 0.5 ? 'bg-yellow-100 text-yellow-700' :
                                              'bg-gray-100 text-gray-600'
                                          }`}>
                                              {match.totalGoals2H}g
                                          </div>
                                          <div className="text-xs text-green-500 mt-1 font-medium">2° Tempo</div>
                                      </div>
                                  </div>
                              </div>
                              
                              {/* BADGE OTTIMIZZATI - SOLO SOGLIA PIÙ ALTA + GG/NG */}
                              <div className="lg:w-48 flex-shrink-0">
                                  {/* Primo Tempo - Solo soglia più alta + GG */}
                                  <div className="mb-3">
                                      <div className="text-xs font-semibold text-blue-600 mb-2">1° Tempo:</div>
                                      <div className="flex flex-wrap gap-2 justify-center">
                                          {(() => {
                                              const htThreshold = getHighestThreshold(match.totalGoalsHT);
                                              return (
                                                  <span className={`px-3 py-1 rounded-lg text-sm font-bold ${htThreshold.color}`}>
                                                      {htThreshold.threshold}
                                                  </span>
                                              );
                                          })()}
                                          {match.isBTTS_HT ? (
                                              <span className="bg-indigo-200 text-indigo-800 px-3 py-1 rounded-lg text-sm font-bold">
                                                  GG
                                              </span>
                                          ) : (
                                              <span className="bg-gray-200 text-gray-700 px-3 py-1 rounded-lg text-sm font-bold">
                                                  NG
                                              </span>
                                          )}
                                      </div>
                                  </div>
                                  
                                  {/* Finale - Solo soglia più alta + GG */}
                                  <div className="mb-3">
                                      <div className="text-xs font-semibold text-red-600 mb-2">Finale:</div>
                                      <div className="flex flex-wrap gap-2 justify-center">
                                          {(() => {
                                              const ftThreshold = getHighestThreshold(match.totalGoalsFT);
                                              return (
                                                  <span className={`px-3 py-1 rounded-lg text-sm font-bold ${ftThreshold.color}`}>
                                                      {ftThreshold.threshold}
                                                  </span>
                                              );
                                          })()}
                                          {match.isBTTS_FT ? (
                                              <span className="bg-orange-200 text-orange-800 px-3 py-1 rounded-lg text-sm font-bold">
                                                  GG
                                              </span>
                                          ) : (
                                              <span className="bg-gray-200 text-gray-700 px-3 py-1 rounded-lg text-sm font-bold">
                                                  NG
                                              </span>
                                          )}
                                      </div>
                                  </div>
                                  
                                  {/* Secondo Tempo - Solo soglia più alta + GG */}
                                  <div className="mb-3">
                                      <div className="text-xs font-semibold text-green-600 mb-2">2° Tempo:</div>
                                      <div className="flex flex-wrap gap-2 justify-center">
                                          {(() => {
                                              const shThreshold = getHighestThreshold(match.totalGoals2H);
                                              return (
                                                  <span className={`px-3 py-1 rounded-lg text-sm font-bold ${shThreshold.color}`}>
                                                      {shThreshold.threshold}
                                                  </span>
                                              );
                                          })()}
                                          {match.isBTTS_2H ? (
                                              <span className="bg-pink-200 text-pink-800 px-3 py-1 rounded-lg text-sm font-bold">
                                                  GG
                                              </span>
                                          ) : (
                                              <span className="bg-gray-200 text-gray-700 px-3 py-1 rounded-lg text-sm font-bold">
                                                  NG
                                              </span>
                                          )}
                                      </div>
                                  </div>
                                  
                                  {/* Riepilogo compatto come nel tuo esempio */}
                                  <div className="text-xs text-gray-500 bg-white px-3 py-2 rounded border mt-2">
                                      <strong>Gol:</strong> 1T({match.totalGoalsHT}) + 2T({match.totalGoals2H}) = Tot({match.totalGoalsFT})
                                  </div>
                              </div>
                          </div>
                      </div>
                    ))}
                </div>
                
                {matches.length > 8 && (
                    <div className="text-center mt-4">
                        <div className="text-sm text-gray-500 bg-gray-100 px-4 py-2 rounded-lg inline-block">
                            📊 Mostrate le ultime 8 partite su {matches.length} scontri diretti totali
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// Componente BTTS corretto - da inserire nel tuo App.jsx
const BTTSSection = ({ currentData, activeTab, homeTeam, awayTeam }) => {
  // Labels dinamici per periodo
  const labels = {
      fullTime: { 
          period: 'nell\'intero match', 
          yes: 'Goal (90 min)', 
          no: 'NoGoal (90 min)',
          description: 'Entrambe le squadre segnano nei 90 minuti'
      },
      halfTime: { 
          period: 'nel primo tempo', 
          yes: 'Goal 1T', 
          no: 'NoGoal 1T',
          description: 'Entrambe le squadre segnano nei primi 45 minuti'
      },
      secondHalf: { 
          period: 'nel secondo tempo', 
          yes: 'Goal 2T', 
          no: 'NoGoal 2T',
          description: 'Entrambe le squadre segnano nel secondo tempo'
      }
  };

  const bttsData = currentData?.btts || { btts_yes: '50', btts_no: '50' };
  const yesValue = parseFloat(bttsData.btts_yes || '50');
  const noValue = parseFloat(bttsData.btts_no || '50');
  const isGoalFavorite = yesValue > noValue;

  return (
      <div className="bg-white p-6 rounded-xl border shadow-sm">
          <h3 className="text-xl font-bold mb-4">
              🥅 Goal/NoGoal {labels[activeTab].period}
          </h3>
          
          <p className="text-sm text-gray-600 mb-4 text-center">
              {labels[activeTab].description}
          </p>
          
          {/* GRID PRINCIPALE GOAL/NOGOAL */}
          <div className="grid grid-cols-2 gap-4 mb-6">
              {/* GOAL */}
              <div className={`p-6 rounded-lg text-center border-2 hover:shadow-lg transition-all ${
                  isGoalFavorite 
                      ? 'bg-green-50 border-green-200 transform scale-105 shadow-lg' 
                      : 'bg-blue-50 border-blue-200'
              }`}>
                  <div className={`text-4xl font-bold mb-2 ${
                      isGoalFavorite ? 'text-green-600' : 'text-blue-600'
                  }`}>
                      {yesValue.toFixed(1)}%
                  </div>
                  <div className="text-lg font-medium mb-2">
                      {labels[activeTab].yes}
                  </div>
                  <div className="text-xs text-gray-500 mb-3">
                      Entrambe segnano {labels[activeTab].period}
                  </div>
                  {isGoalFavorite && (
                      <div className="inline-block">
                          <span className="bg-green-200 text-green-800 px-3 py-1 rounded-full text-xs font-bold">
                              🎯 FAVORITO
                          </span>
                      </div>
                  )}
              </div>
              
              {/* NOGOAL */}
              <div className={`p-6 rounded-lg text-center border-2 hover:shadow-lg transition-all ${
                  !isGoalFavorite 
                      ? 'bg-orange-50 border-orange-200 transform scale-105 shadow-lg' 
                      : 'bg-gray-50 border-gray-200'
              }`}>
                  <div className={`text-4xl font-bold mb-2 ${
                      !isGoalFavorite ? 'text-orange-600' : 'text-gray-600'
                  }`}>
                      {noValue.toFixed(1)}%
                  </div>
                  <div className="text-lg font-medium mb-2">
                      {labels[activeTab].no}
                  </div>
                  <div className="text-xs text-gray-500 mb-3">
                      Almeno una non segna {labels[activeTab].period}
                  </div>
                  {!isGoalFavorite && (
                      <div className="inline-block">
                          <span className="bg-orange-200 text-orange-800 px-3 py-1 rounded-full text-xs font-bold">
                              🎯 FAVORITO
                          </span>
                      </div>
                  )}
              </div>
          </div>

          {/* PROBABILITÀ INDIVIDUALI (se disponibili) */}
          {(currentData?.btts?.home_score_prob || currentData?.btts?.away_score_prob) && (
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <h4 className="font-bold text-gray-700 mb-3 text-center">
                      📊 Probabilità Individuali {labels[activeTab].period}
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white p-4 rounded-lg text-center border">
                          <div className="text-2xl font-bold text-blue-600 mb-2">
                              {currentData.btts.home_score_prob || 'N/A'}%
                          </div>
                          <div className="text-sm text-blue-700 font-medium">{homeTeam}</div>
                          <div className="text-xs text-gray-500">segna {labels[activeTab].period}</div>
                      </div>
                      <div className="bg-white p-4 rounded-lg text-center border">
                          <div className="text-2xl font-bold text-red-600 mb-2">
                              {currentData.btts.away_score_prob || 'N/A'}%
                          </div>
                          <div className="text-sm text-red-700 font-medium">{awayTeam}</div>
                          <div className="text-xs text-gray-500">segna {labels[activeTab].period}</div>
                      </div>
                  </div>
              </div>
          )}

          {/* INDICATORE CONFIDENZA */}
          <div className="text-center">
              <div className={`inline-block px-4 py-2 rounded-full text-sm font-bold ${
                  Math.abs(yesValue - noValue) > 20 ? 'bg-green-100 text-green-800' :
                  Math.abs(yesValue - noValue) > 10 ? 'bg-yellow-100 text-yellow-800' :
                  'bg-gray-100 text-gray-700'
              }`}>
                  {Math.abs(yesValue - noValue) > 20 ? '🎯 Alta Confidenza' :
                    Math.abs(yesValue - noValue) > 10 ? '⚖️ Media Confidenza' :
                    '🤷 Mercato Equilibrato'}
                  {' '}(differenza: {Math.abs(yesValue - noValue).toFixed(1)}%)
              </div>
          </div>
      </div>
  );
};

const getHighestThreshold = (goals) => {
    if (goals > 3.5) return { threshold: 'OV 3.5', color: 'bg-red-200 text-red-800' };
    if (goals > 2.5) return { threshold: 'OV 2.5', color: 'bg-green-200 text-green-800' };
    if (goals > 1.5) return { threshold: 'OV 1.5', color: 'bg-purple-200 text-purple-800' };
    if (goals > 0.5) return { threshold: 'OV 0.5', color: 'bg-blue-200 text-blue-800' };
    return { threshold: 'UN 0.5', color: 'bg-gray-200 text-gray-600' };
};