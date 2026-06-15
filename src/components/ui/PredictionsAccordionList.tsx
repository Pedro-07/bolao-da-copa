'use client';

import React, { useState, useEffect } from 'react';
import MatchCard from './MatchCard';
import { Match, Prediction } from '@/types';
import { CaretDown, CaretUp, MagnifyingGlass } from '@phosphor-icons/react';

interface PredictionsAccordionListProps {
  matches: Match[];
  predictionsMap: Map<string, Prediction>;
  isAuthenticated: boolean;
}

export default function PredictionsAccordionList({
  matches,
  predictionsMap,
  isAuthenticated
}: PredictionsAccordionListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'groups' | 'playoffs' | 'pending' | 'predicted'>('all');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Filtrar partidas
  const filteredMatches = matches.filter((match) => {
    // 1. Filtro de busca por nome de time
    const matchesSearch =
      match.home_team.toLowerCase().includes(searchTerm.toLowerCase()) ||
      match.away_team.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    // 2. Filtro de tipo de partida/palpite
    const isGroupStage = match.stage === 'Fase de Grupos';
    const userHasPredicted = predictionsMap.has(match.id);

    if (filterType === 'groups') {
      return isGroupStage;
    }
    if (filterType === 'playoffs') {
      return !isGroupStage;
    }
    if (filterType === 'pending') {
      return !userHasPredicted;
    }
    if (filterType === 'predicted') {
      return userHasPredicted;
    }
    return true;
  });

  // Agrupar partidas filtradas por Fase/Grupo
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

  // Inicializar o primeiro grupo como expandido por padrão
  useEffect(() => {
    if (groupOrder.length > 0 && Object.keys(expandedGroups).length === 0) {
      setExpandedGroups({ [groupOrder[0]]: true });
    }
  }, [groupOrder, expandedGroups]);

  const toggleExpand = (groupKey: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupKey]: !prev[groupKey]
    }));
  };

  const isSearchingOrFiltering = searchTerm !== '' || filterType !== 'all';

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
            { id: 'predicted', label: 'Palpitados' },
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
        <div className="space-y-4 animate-fadeIn">
          {groupOrder.map((groupKey) => {
            const groupMatches = groups[groupKey];
            // Se estiver buscando ou filtrando, mantemos o accordion aberto por padrão
            const isOpen = isSearchingOrFiltering ? true : !!expandedGroups[groupKey];
            
            const badgeLetter = groupKey.startsWith('Grupo ')
              ? groupKey.replace('Grupo ', '').trim().substring(0, 1)
              : '🏆';

            const predictedCount = groupMatches.filter((m) => predictionsMap.has(m.id)).length;

            return (
              <div key={groupKey} className="border border-border-custom bg-card rounded-2xl overflow-hidden transition-all duration-300 shadow-md">
                {/* Header do Grupo/Fase */}
                <div
                  onClick={() => toggleExpand(groupKey)}
                  className={`flex items-center justify-between p-4 cursor-pointer select-none bg-card hover:bg-muted/70 transition-colors ${
                    isOpen ? 'border-b border-border-custom' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 flex items-center justify-center rounded-full bg-amber-500 text-slate-950 font-black text-xs uppercase shrink-0 shadow-sm select-none">
                      {badgeLetter}
                    </span>
                    <h3 className="text-xs sm:text-sm font-black text-primary uppercase tracking-widest select-none">
                      {groupKey}
                    </h3>
                    <span className="text-[10px] bg-muted border border-border-custom/50 text-secondary px-2.5 py-0.5 rounded-full font-bold select-none whitespace-nowrap">
                      {predictedCount} de {groupMatches.length} palpitados
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-secondary">
                    {isOpen ? <CaretUp size={16} /> : <CaretDown size={16} />}
                  </div>
                </div>

                {/* Grid de Jogos (MatchCards) */}
                {isOpen && (
                  <div className="p-4 bg-muted/20 animate-fadeIn">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {groupMatches.map((match) => {
                        const matchIndex = matches.findIndex((m) => m.id === match.id);
                        const matchNumber = matchIndex !== -1 ? matchIndex + 1 : undefined;
                        return (
                          <MatchCard
                            key={match.id}
                            match={match}
                            prediction={predictionsMap.get(match.id)}
                            isAuthenticated={isAuthenticated}
                            matchNumber={matchNumber}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
