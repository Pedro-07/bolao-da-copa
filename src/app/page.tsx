import React from 'react';
import { createClient } from '@/lib/supabase/server';
import { getRanking, getUserRooms } from '@/app/actions';
import MatchCard from '@/components/ui/MatchCard';
import RankingTabsClient from '@/components/ui/RankingTabsClient';
import { Match, Prediction } from '@/types';
import Link from 'next/link';
import { isSameDayInSaoPaulo } from '@/lib/date';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const supabase = await createClient();
  const ranking = await getRanking();

  // 1. Obter usuário logado
  const { data: { user } } = await supabase.auth.getUser();

  // Buscar status de cadastro financeiro
  let isFinancialRegistered = false;
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_financial_registered')
      .eq('id', user.id)
      .single();
    isFinancialRegistered = !!profile?.is_financial_registered;
  }

  // Fetch rooms for user
  let userRooms: any[] = [];
  if (user) {
    const roomsResult = await getUserRooms();
    if (roomsResult.success && roomsResult.rooms) {
      userRooms = roomsResult.rooms;
    }
  }

  // 2. Buscar todas as partidas
  const { data: matchesData } = await supabase
    .from('matches')
    .select('*')
    .order('match_time', { ascending: true });

  const matches: Match[] = matchesData || [];

  // 3. Buscar palpites do usuário logado
  let userPredictions: Prediction[] = [];
  if (user) {
    const { data: predictionsData } = await supabase
      .from('predictions')
      .select('*')
      .eq('user_id', user.id);
    userPredictions = predictionsData || [];
  }

  const predictionsMap = new Map<string, Prediction>();
  userPredictions.forEach((p) => {
    predictionsMap.set(p.match_id, p);
  });

  // Snapshot do Top 3 para o Hero
  const topThree = ranking.slice(0, 3);

  // 4. Filtrar apenas as partidas do dia atual no fuso de Brasília que ainda não começaram
  const nowInSaoPaulo = new Date();
  const todaysMatches = matches.filter(match => {
    return isSameDayInSaoPaulo(match.match_time, nowInSaoPaulo) && new Date(match.match_time) > nowInSaoPaulo;
  });

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16 bg-base text-primary min-h-[calc(100vh-4rem)] transition-colors duration-300">
      {/* Hero Assimétrico */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center mb-16 md:mb-24">
        {/* Lado Esquerdo: Título e CTA */}
        <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-accent-custom/10 text-accent-custom rounded-full text-xs font-bold border border-accent-custom/20 select-none">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor" className="animate-spin-slow">
              <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a87.69,87.69,0,0,1-36.21-7.8l17.4-30.14a16,16,0,0,0-2.8-19.16L81.1,133.61a15.89,15.89,0,0,0-11-.47L37,144.5A88,88,0,0,1,128,40a87.63,87.63,0,0,1,64.21,27.8l-30.14,17.4a16,16,0,0,0-6.84,18.15l15,46.12a15.93,15.93,0,0,0,14.65,11.23h34.62A88.16,88.16,0,0,1,128,216Z"></path>
            </svg>
            Bolão Oficial Copa 2026
          </div>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-tight bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Bolão Copa 2026
          </h1>
          <p className="text-base sm:text-lg text-secondary font-medium leading-relaxed max-w-xl mx-auto lg:mx-0">
            Dê seus palpites, acumule pontos e vença a disputa contra seus amigos na maior competição de futebol do planeta!
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
            {user ? (
              <Link
                href="/palpites"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-6 py-3 bg-accent-custom hover:bg-accent-hover text-slate-950 font-bold rounded-2xl shadow-lg shadow-green-500/10 hover:shadow-green-500/20 active:scale-[0.98] transition-all duration-200 min-h-[48px]"
              >
                Dar Meus Palpites
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
                  <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"></path>
                </svg>
              </Link>
            ) : (
              <Link
                href="/login"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-6 py-3 bg-accent-custom hover:bg-accent-hover text-slate-950 font-bold rounded-2xl shadow-lg shadow-green-500/10 hover:shadow-green-500/20 active:scale-[0.98] transition-all duration-200 min-h-[48px]"
              >
                Fazer Meus Palpites
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
                  <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"></path>
                </svg>
              </Link>
            )}
            
            <Link
              href="#ranking"
              className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 bg-muted hover:bg-border-custom/50 text-primary font-bold rounded-2xl border border-border-custom transition-all duration-200 min-h-[48px]"
            >
              Ver Classificação
            </Link>
          </div>
        </div>

        {/* Lado Direito: Snapshot do Ranking */}
        <div className="lg:col-span-5 bg-card border border-border-custom rounded-2xl p-6 shadow-xl w-full">
          <h3 className="text-sm font-bold text-secondary uppercase tracking-wider mb-4 flex items-center gap-1.5 select-none">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256" fill="currentColor" className="text-yellow-500">
              <path d="M200,40H176a8,8,0,0,0,0,16h24v48c0,28.89-21.73,53.2-51.27,57.38A80.24,80.24,0,0,1,136,175.79V200h16a8,8,0,0,1,0,16H136v16h24a8,8,0,0,1,0,16H96a8,8,0,0,1,0-16h24V216H104a8,8,0,0,1,0-16h16V175.79A80.24,80.24,0,0,1,107.27,161.4C77.73,157.2,56,132.89,56,104V56H80a8,8,0,0,0,0-16H56A16,16,0,0,0,40,56v48c0,35.91,26.47,66.19,62,71.39V200h-8a8,8,0,0,0,0,16h8v16h-8a8,8,0,0,0,0,16h40a8,8,0,0,0,0-16h-8V216h8a8,8,0,0,0,0-16h-8V175.39c35.53-5.2,62-35.48,62-71.39V56A16,16,0,0,0,200,40ZM72,56H88V80H72ZM184,80H168V56H184Z"></path>
            </svg>
            Líderes do Bolão
          </h3>

          {topThree.length === 0 ? (
            <div className="text-xs text-secondary py-4 italic">
              Nenhuma pontuação registrada ainda. Seja o primeiro a palpitar!
            </div>
          ) : (
            <div className="space-y-3">
              {topThree.map((player, idx) => {
                const colors = [
                  'border-yellow-500/20 bg-yellow-500/5 text-yellow-600 dark:text-yellow-400',
                  'border-slate-400/20 bg-slate-400/5 text-slate-600 dark:text-slate-300',
                  'border-amber-600/20 bg-amber-600/5 text-amber-700 dark:text-amber-500'
                ];
                return (
                  <div
                    key={player.user_id}
                    className={`flex items-center justify-between p-3.5 border rounded-xl ${colors[idx] || 'border-border-custom bg-muted/30 text-secondary'}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-black tracking-wider uppercase opacity-85">
                        {idx + 1}º
                      </span>
                      <span className="font-bold text-sm truncate max-w-[140px] sm:max-w-xs">
                        {player.name}
                      </span>
                    </div>
                    <span className="font-extrabold text-base tracking-wider">
                      {player.total_points} pts
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Grid Principal: Jogos de Hoje e Classificação */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 items-start">
        
        {/* Jogos de Hoje e Regras (2 colunas) */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Seção Jogos de Hoje */}
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-border-custom pb-3">
              <h2 className="text-lg font-black text-primary uppercase tracking-wider select-none">
                Jogos de Hoje ⚽
              </h2>
              <Link
                href="/palpites"
                className="text-xs font-bold text-accent-custom hover:text-accent-hover transition-colors"
              >
                Todos os jogos &rarr;
              </Link>
            </div>

            {todaysMatches.length === 0 ? (
              <div className="bg-card border border-border-custom rounded-2xl p-10 text-center text-secondary space-y-3 shadow-sm">
                <p className="font-extrabold text-sm uppercase tracking-wider">Nenhum jogo agendado para hoje.</p>
                <p className="text-xs">Mas você pode palpitar nos próximos jogos do campeonato!</p>
                <div className="pt-2 flex justify-center">
                  <Link
                    href="/palpites"
                    className="inline-flex items-center justify-center min-h-[48px] px-5 bg-accent-custom hover:bg-accent-hover text-slate-950 font-bold rounded-xl text-xs uppercase tracking-wider shadow"
                  >
                    Ver Jogos e Palpitar
                  </Link>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {todaysMatches.map((match) => {
                  const matchIndex = matches.findIndex((m) => m.id === match.id);
                  const matchNumber = matchIndex !== -1 ? matchIndex + 1 : undefined;
                  return (
                    <MatchCard
                      key={match.id}
                      match={match}
                      prediction={predictionsMap.get(match.id)}
                      isAuthenticated={!!user}
                      matchNumber={matchNumber}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Regras de Pontuação */}
          <div className="bg-card border border-border-custom rounded-2xl p-6 shadow-xl space-y-4">
            <h3 className="text-sm font-extrabold text-primary uppercase tracking-wider select-none flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 256 256" fill="currentColor" className="text-accent-custom">
                <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm40-88a8,8,0,0,1-8,8H128a8,8,0,0,1-8-8V88a8,8,0,0,1,16,0v24h24A8,8,0,0,1,168,128Zm-40,40a12,12,0,1,1,12-12A12,12,0,0,1,128,168Z"></path>
              </svg>
              Regras de Pontuação
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-start gap-3 p-3 bg-muted/20 rounded-xl border border-border-custom/40">
                <span className="shrink-0 bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider">
                  3 pts
                </span>
                <div className="text-xs space-y-0.5">
                  <p className="font-extrabold text-primary">Placar Exato</p>
                  <p className="text-secondary text-[11px] leading-relaxed">Você acertou o placar exato do jogo. Ex: palpite 2x1 e final 2x1.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-muted/20 rounded-xl border border-border-custom/40">
                <span className="shrink-0 bg-amber-500/10 text-amber-600 dark:text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider">
                  2 pts
                </span>
                <div className="text-xs space-y-0.5">
                  <p className="font-extrabold text-primary">Vencedor + Diferença</p>
                  <p className="text-secondary text-[11px] leading-relaxed">Acertou vencedor e saldo de gols (exeto empate). Ex: palpite 3x1 e final 2x0.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-muted/20 rounded-xl border border-border-custom/40">
                <span className="shrink-0 bg-sky-500/10 text-sky-600 dark:text-sky-450 border border-sky-500/20 px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider">
                  1 pt
                </span>
                <div className="text-xs space-y-0.5">
                  <p className="font-extrabold text-primary">Apenas o Vencedor / Empate</p>
                  <p className="text-secondary text-[11px] leading-relaxed">Acertou apenas quem ganhou ou que deu empate. Ex: palpite 2x1 e final 1x0.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-muted/20 rounded-xl border border-border-custom/40">
                <span className="shrink-0 bg-muted border border-border-custom/80 px-2 py-0.5 rounded-full text-[10px] font-black text-secondary tracking-wider">
                  0 pts
                </span>
                <div className="text-xs space-y-0.5">
                  <p className="font-extrabold text-primary">Errou</p>
                  <p className="text-secondary text-[11px] leading-relaxed">Errou completamente o resultado da partida.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabela de Classificação Completa (1 coluna) */}
        <div id="ranking" className="lg:col-span-1 lg:sticky lg:top-24">
          <RankingTabsClient
            globalRanking={ranking}
            currentUserId={user?.id}
            totalMatches={matches.length}
            initialRooms={userRooms}
            isFinancialRegistered={isFinancialRegistered}
          />
        </div>
      </div>
    </div>
  );
}
