'use client';

import React, { useState } from 'react';
import { RankingEntry } from '@/types';
import { Medal, Trophy, MagnifyingGlass } from '@phosphor-icons/react';

interface RankingTableProps {
  ranking: RankingEntry[];
  currentUserId?: string | null;
  totalMatches?: number;
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

export default function RankingTable({ ranking, currentUserId, totalMatches }: RankingTableProps) {
  const [searchTerm, setSearchTerm] = useState('');

  if (ranking.length === 0) {
    return (
      <div className="w-full bg-card border border-border-custom rounded-2xl p-8 text-center text-secondary">
        Ninguém palpitou ainda. Seja o primeiro!
      </div>
    );
  }

  const filteredRanking = ranking.filter((entry) =>
    entry.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="w-full bg-card border border-border-custom rounded-2xl overflow-hidden shadow-2xl transition-all duration-300">
      {/* Header do Ranking com Busca */}
      <div className="px-5 py-4 border-b border-border-custom/60 bg-muted/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h3 className="text-xs sm:text-sm font-extrabold text-primary flex items-center gap-2 uppercase tracking-wider select-none">
          <Trophy size={18} className="text-accent-custom shrink-0" />
          Classificação Geral
        </h3>
        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-48 md:w-64">
            <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-secondary">
              <MagnifyingGlass size={14} />
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar participante..."
              className="w-full h-8 pl-8 pr-3 bg-base border border-border-custom focus:border-accent-custom text-primary text-xs rounded-lg focus:outline-none transition-colors"
            />
          </div>
          {totalMatches !== undefined && (
            <span className="text-[9px] text-secondary font-black uppercase tracking-wider select-none shrink-0">
              {totalMatches} Jogos
            </span>
          )}
        </div>
      </div>
      
      <div className="overflow-x-hidden">
        <table className="w-full text-left border-collapse table-fixed">
          <thead>
            <tr className="border-b border-border-custom/60 text-[9px] font-black text-secondary bg-muted/20 uppercase tracking-widest select-none">
              <th className="py-3.5 px-3 text-center w-[48px] sm:w-[64px]">Pos</th>
              <th className="py-3.5 px-2 text-left">Participante</th>
              <th className="py-3.5 px-2 text-center w-[64px] hidden sm:table-cell">Aprv.</th>
              <th className="py-3.5 px-4 text-right w-[64px] sm:w-[94px]">
                <span className="hidden sm:inline">Pontos</span>
                <span className="sm:hidden">Pts</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-custom/30">
            {filteredRanking.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-xs text-secondary font-bold">
                  Nenhum participante encontrado.
                </td>
              </tr>
            ) : (
              filteredRanking.map((entry) => {
                // Procuramos o índice correto no ranking original para manter a posição correta
                const originalIndex = ranking.findIndex((item) => item.user_id === entry.user_id);
                const pos = originalIndex !== -1 ? originalIndex + 1 : 0;
                const isCurrentUser = currentUserId === entry.user_id;
                const avatarStyle = getAvatarStyle(entry.name);

                // Top 3 premium badges
                let rankBadge = (
                  <span className="w-7 h-7 flex items-center justify-center rounded-lg bg-muted text-secondary font-extrabold text-xs border border-border-custom/50">
                    {pos}
                  </span>
                );

                if (pos === 1) {
                  rankBadge = (
                    <div className="relative w-8 h-8 flex items-center justify-center bg-gradient-to-br from-yellow-300 to-yellow-600 rounded-full shadow-md shadow-yellow-500/15 text-slate-950 font-black text-xs border border-yellow-400 select-none animate-pulse shrink-0">
                      <Medal size={13} weight="fill" className="absolute -top-1 -right-1 text-yellow-100" />
                      1
                    </div>
                  );
                } else if (pos === 2) {
                  rankBadge = (
                    <div className="relative w-8 h-8 flex items-center justify-center bg-gradient-to-br from-slate-200 to-slate-400 rounded-full shadow-md shadow-slate-300/15 text-slate-950 font-black text-xs border border-slate-300 select-none shrink-0">
                      <Medal size={13} weight="fill" className="absolute -top-1 -right-1 text-slate-100" />
                      2
                    </div>
                  );
                } else if (pos === 3) {
                  rankBadge = (
                    <div className="relative w-8 h-8 flex items-center justify-center bg-gradient-to-br from-amber-500 to-amber-700 rounded-full shadow-md shadow-amber-600/15 text-white font-black text-xs border border-amber-400 select-none shrink-0">
                      <Medal size={13} weight="fill" className="absolute -top-1 -right-1 text-amber-100" />
                      3
                    </div>
                  );
                }

                return (
                  <tr
                    key={entry.user_id}
                    className={`transition-all duration-200 ${
                      isCurrentUser
                        ? 'bg-accent-custom/5 dark:bg-accent-custom/5 border-l-4 border-l-accent-custom'
                        : 'hover:bg-muted/30'
                    }`}
                  >
                    {/* Posição */}
                    <td className="py-3 px-1 text-center">
                      <div className="flex justify-center">
                        {rankBadge}
                      </div>
                    </td>

                    {/* Participante (Avatar + Nome + Palpites no Mobile) */}
                    <td className="py-3 px-2 font-bold text-sm min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        {entry.avatar_url ? (
                          <img
                            src={entry.avatar_url}
                            alt={entry.name}
                            className="w-7 h-7 rounded-full object-cover shrink-0 border border-border-custom"
                          />
                        ) : (
                          <span className={`w-7 h-7 flex items-center justify-center rounded-full text-[10px] font-black shrink-0 border select-none ${avatarStyle}`}>
                            {entry.name.substring(0, 1).toUpperCase()}
                          </span>
                        )}
                        <div className="flex flex-col min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              style={{ color: isCurrentUser ? undefined : 'var(--text-primary)' }}
                              className={`truncate ${isCurrentUser ? 'text-accent-custom font-extrabold' : ''}`}
                            >
                              {entry.name}
                            </span>
                            {isCurrentUser && (
                              <span className="text-[8px] bg-accent-custom/15 text-accent-custom px-1.5 py-0.5 rounded-full font-black uppercase tracking-wider border border-accent-custom/20 select-none shrink-0">
                                Você
                              </span>
                            )}
                          </div>
                          <span className={`text-[9px] font-bold sm:hidden mt-0.5 select-none shrink-0 ${
                            entry.aproveitamento >= 70 ? 'text-green-500' :
                            entry.aproveitamento >= 40 ? 'text-amber-500' :
                            entry.predictions_count === 0 ? 'text-secondary' : 'text-red-400'
                          }`}>
                            {entry.predictions_count === 0 ? 'sem palpites' : `${entry.aproveitamento}% de aproveitamento`}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Aproveitamento (desktop only) */}
                    <td className="py-3 px-2 text-center select-none hidden sm:table-cell">
                      <span className={`text-xs font-black ${
                        entry.aproveitamento >= 70 ? 'text-green-500' :
                        entry.aproveitamento >= 40 ? 'text-amber-500' :
                        entry.predictions_count === 0 ? 'text-secondary' : 'text-red-400'
                      }`}>
                        {entry.predictions_count === 0 ? '—' : `${entry.aproveitamento}%`}
                      </span>
                    </td>

                    {/* Pontos */}
                    <td className="py-3 px-4 text-right">
                      <span
                        style={{ color: isCurrentUser ? undefined : 'var(--text-primary)' }}
                        className={`text-base font-black tracking-wider ${
                          isCurrentUser ? 'text-accent-custom' : ''
                        }`}
                      >
                        {entry.total_points}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
