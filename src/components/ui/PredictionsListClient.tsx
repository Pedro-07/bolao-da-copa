'use client';

import { useState } from 'react';
import FlagTeam from './FlagTeam';
import { Match } from '@/types';
import { CaretDown, CaretUp, MagnifyingGlass, Trophy } from '@phosphor-icons/react';
import { formatMatchDate, formatMatchTime } from '@/lib/date';

interface PredictionItem {
  id: string;
  match_id: string;
  user_id: string;
  home_score: number;
  away_score: number;
  points: number | null;
  user_name: string;
}

interface PredictionsListClientProps {
  matches: Match[];
  predictions: PredictionItem[];
  predictionsCount: Record<string, number>;
  currentUserId: string | null;
  allProfiles: { id: string; name: string; avatar_url?: string | null }[];
}

const colors = [
  'bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400',
  'bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400',
  'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400',
  'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400',
  'bg-purple-500/10 text-purple-600 border-purple-500/20 dark:text-purple-400',
  'bg-pink-500/10 text-pink-600 border-pink-500/20 dark:text-pink-400',
  'bg-indigo-500/10 text-indigo-600 border-indigo-500/20 dark:text-indigo-400',
  'bg-cyan-500/10 text-cyan-600 border-cyan-500/20 dark:text-cyan-400',
];

const getAvatarStyle = (name: string) => {
  const code = name.charCodeAt(0) || 0;
  return colors[code % colors.length];
};

function MatchAccordionContent({
  match,
  matchPredictions,
  allProfiles,
  currentUserId,
}: {
  match: Match;
  matchPredictions: PredictionItem[];
  allProfiles: { id: string; name: string; avatar_url?: string | null }[];
  currentUserId: string | null;
}) {
  const profileMap = new Map(allProfiles.map((p) => [p.id, p]));
  const matchStarted = new Date(match.match_time) <= new Date();
  const predictedUserIds = new Set(matchPredictions.map((p) => p.user_id));
  const missingProfiles = matchStarted ? [] : allProfiles.filter((p) => !predictedUserIds.has(p.id));

  return (
    <div className="mt-2 bg-muted/20 border border-border-custom rounded-2xl overflow-hidden divide-y divide-border-custom/50 animate-fadeIn">
      {matchPredictions.length === 0 && missingProfiles.length === 0 && (
        <div className="p-4 text-center text-xs text-secondary italic select-none">
          Nenhum palpite registrado para esse jogo.
        </div>
      )}
      {matchPredictions.map((pred) => {
        const isSelf = pred.user_id === currentUserId;
        const profile = profileMap.get(pred.user_id);
        const avatarUrl = profile?.avatar_url ?? null;
        const avatarStyle = getAvatarStyle(pred.user_name);
        const hasPoints = pred.points !== null;
        const pointsColor =
          pred.points === 3 ? 'text-green-500 bg-green-500/10 border-green-500/30' :
          pred.points === 2 ? 'text-amber-500 bg-amber-500/10 border-amber-500/30' :
          pred.points === 1 ? 'text-sky-400 bg-sky-500/10 border-sky-500/30' :
          'text-secondary bg-muted border-border-custom/50';
        return (
          <div
            key={pred.id}
            className={`flex items-center justify-between px-4 py-3.5 text-xs sm:text-sm ${
              isSelf ? 'bg-accent-custom/5 font-semibold' : ''
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt={pred.user_name} className="w-7 h-7 rounded-full object-cover shrink-0 border border-border-custom" />
              ) : (
                <span className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-black shrink-0 border select-none ${avatarStyle}`}>
                  {pred.user_name.substring(0, 1)}
                </span>
              )}
              <span
                style={{ color: isSelf ? undefined : 'var(--text-primary)' }}
                className={`truncate font-bold ${isSelf ? 'text-accent-custom' : ''}`}
              >
                {pred.user_name}
                {isSelf && (
                  <span className="text-[9px] font-black text-accent-custom uppercase tracking-widest ml-1.5 bg-accent-custom/10 px-1.5 py-0.5 rounded-md border border-accent-custom/20 inline-block">
                    Você
                  </span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                style={{ color: isSelf ? undefined : 'var(--text-primary)' }}
                className={`font-extrabold text-sm tracking-wider select-none ${isSelf ? 'text-accent-custom' : ''}`}
              >
                {!matchStarted && !isSelf ? '🔒' : `${pred.home_score} x ${pred.away_score}`}
              </span>
              {hasPoints && (
                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-lg border shrink-0 ${pointsColor}`}>
                  {pred.points}pts
                </span>
              )}
            </div>
          </div>
        );
      })}
      {missingProfiles.length > 0 && (
        <div className="px-4 py-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-black text-secondary uppercase tracking-wider shrink-0">Sem palpite:</span>
          {missingProfiles.map((p) => (
            <span key={p.id} className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-red-500/10 text-red-500 border border-red-500/20">
              {p.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PredictionsListClient({
  matches,
  predictions,
  predictionsCount,
  currentUserId,
  allProfiles,
}: PredictionsListClientProps) {
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'groups' | 'playoffs' | 'mine' | 'pending'>('all');

  const toggleExpand = (matchId: string) => {
    setExpandedMatchId(expandedMatchId === matchId ? null : matchId);
  };

  // Filtrar partidas
  const filteredMatches = matches.filter((match) => {
    // 1. Filtro de busca por nome de time
    const matchesSearch =
      match.home_team.toLowerCase().includes(searchTerm.toLowerCase()) ||
      match.away_team.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    // 2. Filtro de tipo de partida/palpite
    const isGroupStage = match.stage === 'Fase de Grupos';
    const userHasPredicted = predictions.some(p => p.match_id === match.id && p.user_id === currentUserId);

    if (filterType === 'groups') {
      return isGroupStage;
    }
    if (filterType === 'playoffs') {
      return !isGroupStage;
    }
    if (filterType === 'mine') {
      return userHasPredicted;
    }
    if (filterType === 'pending') {
      return !userHasPredicted;
    }
    return true;
  });

  // Agrupar partidas por Fase/Grupo
  const groups: Record<string, Match[]> = {};
  const groupOrder: string[] = [];

  filteredMatches.forEach((match) => {
    const key = match.group_name || match.stage;
    if (!groups[key]) {
      groups[key] = [];
      groupOrder.push(key);
    }
    groups[key].push(match);
  });

  // Ordenar grupos alfabética e cronologicamente
  groupOrder.sort((a, b) => {
    const cleanA = a.trim();
    const cleanB = b.trim();
    const isGroupA = cleanA.toLowerCase().startsWith('grupo ');
    const isGroupB = cleanB.toLowerCase().startsWith('grupo ');
    if (isGroupA && isGroupB) {
      return cleanA.localeCompare(cleanB, undefined, { numeric: true, sensitivity: 'base' });
    }
    if (isGroupA) return -1;
    if (isGroupB) return 1;

    const stageOrder = [
      'fase de grupos',
      'fase de 32',
      'oitavas de final',
      'quartas de final',
      'semifinal',
      'decisão do 3º lugar',
      'final'
    ];
    const indexA = stageOrder.indexOf(cleanA.toLowerCase());
    const indexB = stageOrder.indexOf(cleanB.toLowerCase());
    if (indexA !== -1 && indexB !== -1) {
      return indexA - indexB;
    }
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    return cleanA.localeCompare(cleanB, undefined, { numeric: true, sensitivity: 'base' });
  });

  return (
    <div className="space-y-6">
      {/* Barra de Filtros e Busca */}
      <div className="bg-card border border-border-custom rounded-2xl p-4 shadow-md space-y-4">
        {/* Campo de Busca */}
        <div className="relative">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-secondary">
            <MagnifyingGlass size={18} />
          </span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar time (ex: Brasil, Argentina...)"
            className="w-full h-11 pl-10 pr-4 bg-base border border-border-custom focus:border-accent-custom text-primary text-sm rounded-xl focus:outline-none transition-colors"
          />
        </div>

        {/* Botões de Filtro */}
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'all', label: 'Todos' },
            { id: 'groups', label: 'Fase de Grupos' },
            { id: 'playoffs', label: 'Mata-Mata' },
            { id: 'mine', label: 'Meus Palpites' },
            { id: 'pending', label: 'Pendentes' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                filterType === tab.id
                  ? 'bg-accent-custom text-slate-950 shadow-sm font-black'
                  : 'bg-muted hover:bg-border-custom text-secondary hover:text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {filteredMatches.length === 0 ? (
        <div className="text-center py-12 px-6 bg-card border border-border-custom rounded-2xl text-secondary font-bold">
          Nenhum jogo encontrado para os critérios selecionados.
        </div>
      ) : (
        <div className="space-y-8 animate-fadeIn">
          {groupOrder.map((groupKey) => {
            const groupMatches = groups[groupKey];
            const badgeLetter = groupKey.startsWith('Grupo ')
              ? groupKey.replace('Grupo ', '').trim().substring(0, 1)
              : '🏆';

            return (
              <div key={groupKey} className="space-y-3">
                {/* Header do Grupo */}
                <div className="flex items-center gap-2.5 pt-2">
                  <span className="w-6 h-6 flex items-center justify-center rounded-full bg-amber-500 text-slate-950 font-black text-xs uppercase shrink-0 select-none shadow-sm">
                    {groupKey.startsWith('Grupo ') ? (
                      groupKey.replace('Grupo ', '').trim().substring(0, 1)
                    ) : (
                      <Trophy size={12} weight="bold" />
                    )}
                  </span>
                  <h3 className="text-xs sm:text-sm font-black text-amber-600 dark:text-amber-500 uppercase tracking-widest select-none">
                    {groupKey}
                  </h3>
                </div>

                {/* Lista de Partidas do Grupo */}
                <div className="space-y-2.5">
                  {groupMatches.map((match) => {
                    const isOpen = expandedMatchId === match.id;
                    const matchPredictions = predictions.filter((p) => p.match_id === match.id);
                    const count = predictionsCount[match.id] || 0;

                    return (
                      <div key={match.id} className="group">
                        {/* Linha do Confronto (Accordion Header) */}
                        <div
                          onClick={() => toggleExpand(match.id)}
                          className={`flex items-center justify-between p-3.5 min-h-[48px] bg-card border ${
                            isOpen ? 'border-accent-custom' : 'border-border-custom hover:border-secondary'
                          } rounded-2xl cursor-pointer select-none transition-all duration-200 shadow-md`}
                        >
                          {/* Mandante x Visitante */}
                          <div className="flex items-center justify-between flex-grow min-w-0 mr-4">
                            {/* Mandante */}
                            <div className="flex-1 flex justify-end truncate min-w-0 pr-1">
                              <FlagTeam flag={match.home_flag} name={match.home_team} reverse={true} className="text-xs sm:text-sm" />
                            </div>

                            {/* Data/Hora ou Placar Final */}
                            {match.home_score !== null && match.away_score !== null ? (
                              <div className="mx-2 px-2.5 py-1 bg-accent-custom/10 border border-accent-custom/30 rounded-xl text-[11px] font-black whitespace-nowrap shrink-0 select-none flex flex-col items-center justify-center leading-normal text-accent-custom">
                                <span className="text-[8px] uppercase tracking-wider font-bold opacity-70">Resultado</span>
                                <span>{match.home_score} x {match.away_score}</span>
                              </div>
                            ) : (
                              <div className="mx-2 px-1.5 py-1 bg-muted border border-border-custom/80 rounded-xl text-[9px] sm:text-[10px] text-secondary font-extrabold whitespace-nowrap shrink-0 select-none flex flex-col items-center justify-center leading-normal">
                                <span>{formatMatchDate(match.match_time)}</span>
                                <span style={{ color: 'var(--text-primary)' }} className="font-black">{formatMatchTime(match.match_time)}</span>
                              </div>
                            )}

                            {/* Visitante */}
                            <div className="flex-1 flex justify-start truncate min-w-0 pl-1">
                              <FlagTeam flag={match.away_flag} name={match.away_team} reverse={false} className="text-xs sm:text-sm" />
                            </div>
                          </div>

                          {/* Contagem de Palpites & Seta */}
                          <div className="flex items-center gap-1.5 shrink-0 text-secondary">
                            <span className="text-[11px] font-bold whitespace-nowrap">
                              {count} {count === 1 ? 'palpite' : 'palpites'}
                            </span>
                            {isOpen ? (
                              <CaretUp size={14} />
                            ) : (
                              <CaretDown size={14} />
                            )}
                          </div>
                        </div>

                        {/* Detalhes dos Palpites (Accordion Content) */}
                        {isOpen && MatchAccordionContent({
                          match,
                          matchPredictions,
                          allProfiles,
                          currentUserId,
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
