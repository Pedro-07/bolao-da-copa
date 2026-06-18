import React from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getUserRooms, getRoomRanking } from '@/app/actions';
import FlagTeam from '@/components/ui/FlagTeam';
import PointsBadge from '@/components/ui/PointsBadge';
import { Match, Prediction } from '@/types';
import { Calendar, Hourglass, CheckCircle, Flame, Trophy, Coins, SoccerBall, UsersThree } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { formatMatchDateTime } from '@/lib/date';
import EditNicknameForm from '@/components/ui/EditNicknameForm';
import ShareButton from '@/components/ui/ShareButton';
import AvatarUpload from '@/components/ui/AvatarUpload';
import FinancialProfileClient from '@/components/ui/FinancialProfileClient';

export const dynamic = 'force-dynamic';

export default async function PerfilPage() {
  const supabase = await createClient();

  // 1. Verificar usuário
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  // 2. Buscar perfil correspondente para pegar o nome, avatar e saldo
  const { data: profile } = await supabase
    .from('profiles')
    .select('name, avatar_url, balance, is_financial_registered, full_name, cpf_cnpj, birth_date, phone, pix_key_type, pix_key')
    .eq('id', user.id)
    .single();

  // 3. Buscar salas do usuário e calcular ranking em cada sala
  const roomsResult = await getUserRooms();
  const userRooms = (roomsResult.success && roomsResult.rooms) ? roomsResult.rooms : [];

  // Calcular posição do usuário em cada sala
  const roomRankings: { roomName: string; position: number; totalPoints: number }[] = [];
  for (const room of userRooms) {
    const rankResult = await getRoomRanking(room.id);
    if (rankResult.success && rankResult.ranking) {
      const pos = rankResult.ranking.findIndex((r: any) => r.user_id === user.id) + 1;
      const entry = rankResult.ranking.find((r: any) => r.user_id === user.id);
      if (pos > 0) {
        roomRankings.push({ roomName: room.name, position: pos, totalPoints: entry?.total_points ?? 0 });
      }
    }
  }

  // Buscar match_ids das salas do usuário para filtrar estatísticas
  let roomMatchIds: string[] = [];
  if (userRooms.length > 0) {
    const roomIds = userRooms.map((r: any) => r.id);
    const { data: rmData } = await supabase
      .from('room_matches')
      .select('match_id')
      .in('room_id', roomIds);
    roomMatchIds = Array.from(new Set((rmData || []).map((rm: any) => rm.match_id)));
  }

  // 4. Buscar palpites do usuário junto com os dados dos jogos
  const { data: predictionsData } = await supabase
    .from('predictions')
    .select(`
      id,
      home_score,
      away_score,
      points,
      created_at,
      match:matches (
        id,
        home_team,
        away_team,
        home_flag,
        away_flag,
        match_time,
        home_score,
        away_score,
        stage,
        group_name
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  // Filtrar palpites apenas para jogos que pertencem às salas do usuário
  const allPredictions: any[] = predictionsData || [];
  const predictionsList = roomMatchIds.length > 0
    ? allPredictions.filter((p: any) => roomMatchIds.includes(p.match?.id))
    : allPredictions;

  // Calcular estatísticas locais
  const totalPoints = predictionsList.reduce((acc, curr) => acc + (curr.points || 0), 0);
  const totalPredictions = predictionsList.length;

  const exactHits = predictionsList.filter((p) => p.points === 3).length;
  const goalDiffHits = predictionsList.filter((p) => p.points === 2).length;
  const simpleOutcomeHits = predictionsList.filter((p) => p.points === 1).length;
  const totalAcertos = exactHits + goalDiffHits + simpleOutcomeHits;

  // Calcular streak: sequência consecutiva de acertos (ordenada por match_time)
  const scoredByTime = [...predictionsList]
    .filter((p) => p.match.home_score !== null)
    .sort((a, b) => new Date(a.match.match_time).getTime() - new Date(b.match.match_time).getTime());

  let maxStreak = 0;
  let currentStreak = 0;
  let tempStreak = 0;

  for (const p of scoredByTime) {
    if ((p.points ?? 0) > 0) { tempStreak++; maxStreak = Math.max(maxStreak, tempStreak); }
    else tempStreak = 0;
  }
  for (let i = scoredByTime.length - 1; i >= 0; i--) {
    if ((scoredByTime[i].points ?? 0) > 0) currentStreak++;
    else break;
  }

  const aproveitamento = totalPredictions > 0
    ? Math.round((exactHits / totalPredictions) * 100)
    : 0;

  // Dividir em palpites futuros (Aguardando) e passados (Finalizados/Pontuados)
  const awaitingResults = predictionsList.filter(
    (p) => p.match.home_score === null || p.match.away_score === null
  );
  
  const scoredPredictions = predictionsList.filter(
    (p) => p.match.home_score !== null && p.match.away_score !== null
  );

  // 5. Buscar dados financeiros
  const { data: transactionsData } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const { data: withdrawalsData } = await supabase
    .from('withdrawals')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const transactions = (transactionsData || []).map((t: any) => ({
    id: t.id,
    amount: Number(t.amount),
    type: t.type as any,
    description: t.description,
    created_at: t.created_at
  }));

  const withdrawals = (withdrawalsData || []).map((w: any) => ({
    id: w.id,
    amount: Number(w.amount),
    pix_key_type: w.pix_key_type,
    pix_key: w.pix_key,
    status: w.status as any,
    created_at: w.created_at
  }));

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 md:py-16 bg-base text-primary min-h-[calc(100vh-4rem)] transition-colors duration-300">
      {/* Resumo do Usuário */}
      <div className="bg-card border border-border-custom rounded-2xl p-6 sm:p-8 shadow-xl mb-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-accent-custom/5 rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <AvatarUpload
              userId={user.id}
              currentAvatarUrl={profile?.avatar_url ?? null}
              name={profile?.name || user.email?.split('@')[0] || '?'}
              size={80}
            />
            <div className="space-y-1.5">
              <h1 className="text-2xl sm:text-3xl font-black text-primary uppercase tracking-wider">
                {profile?.name || user.email?.split('@')[0]}
              </h1>
              {user.email && !user.email.endsWith('@bolao.interno') && (
                <p className="text-xs text-secondary font-bold">{user.email}</p>
              )}
              <EditNicknameForm currentName={profile?.name || user.email?.split('@')[0] || ''} />
              <div className="flex items-center gap-2 flex-wrap pt-1">
                {roomRankings.length > 0 && roomRankings.map((rr, idx) => (
                  <span key={idx} className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-500 border border-amber-500/20 text-xs font-black uppercase tracking-wider rounded-xl select-none" title={rr.roomName}>
                    <Trophy size={14} weight="fill" className="text-amber-500 shrink-0" />
                    <span>{rr.position}º em {rr.roomName.length > 15 ? rr.roomName.slice(0, 15) + '…' : rr.roomName}</span>
                  </span>
                ))}
                {currentStreak >= 2 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-orange-500/10 text-orange-500 border border-orange-500/20 text-xs font-black uppercase tracking-wider rounded-xl select-none">
                    <Flame size={14} weight="fill" className="text-orange-500 shrink-0" />
                    <span>{currentStreak} em sequência</span>
                  </span>
                )}
                <ShareButton
                position={roomRankings.length > 0 ? roomRankings[0].position : 99}
                totalPoints={totalPoints}
                acertos={totalAcertos}
                aproveitamento={aproveitamento}
                streak={currentStreak}
                name={profile?.name || user.email?.split('@')[0] || '?'}
                avatarUrl={profile?.avatar_url ?? null}
              />
              </div>
            </div>
          </div>

          <div className="flex gap-4 sm:gap-6 border-t sm:border-t-0 sm:border-l border-border-custom pt-4 sm:pt-0 sm:pl-6">
            <div className="text-center">
              <span className="text-secondary text-[10px] font-extrabold uppercase tracking-wider block">Pontos</span>
              <span className="text-3xl font-black text-accent-custom tracking-wider mt-1 block">{totalPoints}</span>
            </div>
            <div className="text-center">
              <span className="text-secondary text-[10px] font-extrabold uppercase tracking-wider block">Acertos</span>
              <span className="text-3xl font-black text-green-500 tracking-wider mt-1 block">{totalAcertos}</span>
            </div>
            <div className="text-center">
              <span className="text-secondary text-[10px] font-extrabold uppercase tracking-wider block">Palpites</span>
              <span className="text-3xl font-black text-primary tracking-wider mt-1 block">{totalPredictions}</span>
            </div>
          </div>
        </div>
        
        {/* Sub-estatísticas */}
        <div className="grid grid-cols-4 gap-2 mt-6 pt-5 border-t border-border-custom text-center select-none">
          <div className="bg-muted/40 border border-border-custom/50 rounded-xl py-2 px-1">
            <span className="text-[9px] font-bold text-accent-custom block uppercase tracking-wider">Exato</span>
            <span className="text-base sm:text-lg font-black text-primary mt-0.5 block">{exactHits}</span>
            <span className="text-[9px] text-secondary font-bold">3 pts</span>
          </div>
          <div className="bg-muted/40 border border-border-custom/50 rounded-xl py-2 px-1">
            <span className="text-[9px] font-bold text-amber-500 block uppercase tracking-wider">Saldo</span>
            <span className="text-base sm:text-lg font-black text-primary mt-0.5 block">{goalDiffHits}</span>
            <span className="text-[9px] text-secondary font-bold">2 pts</span>
          </div>
          <div className="bg-muted/40 border border-border-custom/50 rounded-xl py-2 px-1">
            <span className="text-[9px] font-bold text-sky-500 block uppercase tracking-wider">Vencedor</span>
            <span className="text-base sm:text-lg font-black text-primary mt-0.5 block">{simpleOutcomeHits}</span>
            <span className="text-[9px] text-secondary font-bold">1 pt</span>
          </div>
          <div className="bg-muted/40 border border-orange-500/20 rounded-xl py-2 px-1">
            <span className="text-[9px] font-bold text-orange-500 block uppercase tracking-wider">Sequência</span>
            <span className="text-base sm:text-lg font-black text-primary mt-0.5 block">{maxStreak}</span>
            <span className="text-[9px] text-secondary font-bold">máx</span>
          </div>
        </div>
      </div>

      {/* Seção Financeira */}
      <div className="mb-10">
        <h2 className="text-base font-extrabold text-primary mb-5 flex items-center gap-2 uppercase tracking-wider pb-2 border-b border-b-border-custom">
          <Coins size={18} weight="bold" className="text-accent-custom" />
          Carteira e Saques
        </h2>
        <FinancialProfileClient
          initialBalance={Number(profile?.balance || 0)}
          transactions={transactions}
          withdrawals={withdrawals}
          isFinancialRegistered={!!profile?.is_financial_registered}
          fullName={profile?.full_name ?? ''}
          cpfCnpj={profile?.cpf_cnpj ?? ''}
          birthDate={profile?.birth_date ?? ''}
          phone={profile?.phone ?? ''}
          pixKeyType={(profile?.pix_key_type as any) ?? 'CPF'}
          pixKey={profile?.pix_key ?? ''}
        />
      </div>

      {predictionsList.length === 0 ? (
        /* Empty State Customizado */
        <div className="text-center py-12 px-6 bg-card border border-border-custom rounded-2xl max-w-md mx-auto shadow-lg space-y-4 animate-fadeIn">
          <div className="w-16 h-16 bg-accent-custom/10 text-accent-custom border border-accent-custom/20 rounded-full flex items-center justify-center text-2xl mx-auto">
            <SoccerBall size={32} weight="fill" className="text-accent-custom" />
          </div>
          <h3 className="text-lg font-extrabold text-primary uppercase tracking-wider">
            Você ainda não fez nenhum palpite.
          </h3>
          <p className="text-sm text-secondary">
            Vai ficar de fora da disputa com seus amigos?
          </p>
          <div className="pt-2 flex justify-center">
            <Link
              href="/palpites"
              className="inline-flex items-center justify-center min-h-[48px] px-6 bg-accent-custom hover:bg-accent-hover text-slate-950 font-bold rounded-xl shadow-md transition-all uppercase tracking-wider text-xs focus:outline-none"
            >
              Começar a Palpitar
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-10">
          {/* Seção 1: Aguardando Resultado */}
          {awaitingResults.length > 0 && (
            <div>
              <h2 className="text-base font-extrabold text-primary mb-5 flex items-center gap-2 uppercase tracking-wider pb-2 border-b border-border-custom">
                <Hourglass size={18} className="text-amber-500" />
                Aguardando Resultados ({awaitingResults.length})
              </h2>

              <div className="space-y-4">
                {awaitingResults.map((pred) => {
                  const match: Match = pred.match;
                  const matchTime = new Date(match.match_time);
                  return (
                    <div
                      key={pred.id}
                      className="bg-card border border-border-custom hover:border-secondary rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 transition-all duration-200"
                    >
                      {/* Metadados do Jogo */}
                      <div className="text-xs text-secondary font-semibold space-y-1 w-full sm:w-auto text-center sm:text-left">
                        <div className="bg-muted px-2 py-0.5 rounded-full text-[9px] text-primary uppercase font-extrabold inline-block">
                          {match.stage}
                        </div>
                        <div className="flex items-center justify-center sm:justify-start gap-1 text-secondary mt-1 font-bold">
                          <Calendar size={12} />
                          {formatMatchDateTime(match.match_time)}
                        </div>
                      </div>

                      {/* Confronto Simétrico com Palpites */}
                      <div className="flex flex-1 items-center justify-center gap-3 w-full max-w-md my-1.5 sm:my-0">
                        <div className="flex-1 flex justify-end">
                          <FlagTeam flag={match.home_flag} name={match.home_team} reverse={false} className="text-sm justify-end w-full" />
                        </div>
                        
                        <div className="flex flex-col items-center justify-center px-3 py-1 bg-base border border-border-custom rounded-xl shrink-0">
                          <span className="text-[9px] text-secondary font-bold uppercase tracking-wider mb-0.5">Seu Palpite</span>
                          <span className="text-sm font-black text-amber-500">{pred.home_score} x {pred.away_score}</span>
                        </div>

                        <div className="flex-1 flex justify-start">
                          <FlagTeam flag={match.away_flag} name={match.away_team} reverse={true} className="text-sm justify-start w-full" />
                        </div>
                      </div>

                      {/* Ações */}
                      <div className="flex items-center gap-3.5 w-full sm:w-auto justify-center sm:justify-end border-t sm:border-t-0 border-border-custom/40 pt-3.5 sm:pt-0 shrink-0">
                        <Link
                          href={`/palpites?match=${match.id}`}
                          className="min-h-[48px] px-4 flex items-center justify-center bg-muted hover:bg-border-custom text-primary text-xs font-bold rounded-xl border border-border-custom transition-all"
                        >
                          Editar Palpite
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Seção 2: Finalizados & Pontuados */}
          {scoredPredictions.length > 0 && (
            <div>
              <h2 className="text-base font-extrabold text-primary mb-5 flex items-center gap-2 uppercase tracking-wider pb-2 border-b border-border-custom">
                <CheckCircle size={18} className="text-accent-custom" />
                Pontuados e Finalizados ({scoredPredictions.length})
              </h2>

              <div className="space-y-4">
                {scoredPredictions.map((pred) => {
                  const match: Match = pred.match;
                  const matchTime = new Date(match.match_time);
                  
                  // Fundo de destaque baseado na pontuação
                  let pointsBg = 'bg-card';
                  if (pred.points === 3) pointsBg = 'bg-green-500/5 dark:bg-green-500/5 border-green-500/20';
                  else if (pred.points === 2 || pred.points === 1) pointsBg = 'bg-blue-500/5 dark:bg-blue-500/5 border-blue-500/20';

                  return (
                    <div
                      key={pred.id}
                      className={`border border-border-custom rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 transition-all duration-200 ${pointsBg}`}
                    >
                      {/* Metadados do Jogo */}
                      <div className="text-xs text-secondary font-semibold space-y-1 w-full sm:w-auto text-center sm:text-left">
                        <div className="bg-muted px-2 py-0.5 rounded-full text-[9px] text-primary uppercase font-extrabold inline-block">
                          {match.stage}
                        </div>
                        <div className="flex items-center justify-center sm:justify-start gap-1 text-secondary mt-1 font-bold">
                          <Calendar size={12} />
                          {formatMatchDateTime(match.match_time)}
                        </div>
                      </div>

                      {/* Confronto Simétrico com Palpites */}
                      <div className="flex flex-1 items-center justify-center gap-3 w-full max-w-md my-1.5 sm:my-0">
                        <div className="flex-1 flex justify-end">
                          <FlagTeam flag={match.home_flag} name={match.home_team} reverse={false} className="text-sm justify-end w-full" />
                        </div>
                        
                        <div className="flex flex-col items-center justify-center px-3 py-1 bg-base border border-border-custom rounded-xl shrink-0">
                          <span className="text-[9px] text-secondary font-bold uppercase tracking-wider mb-0.5">Seu Palpite</span>
                          <span className="text-sm font-black text-amber-500">{pred.home_score} x {pred.away_score}</span>
                        </div>

                        <div className="flex-1 flex justify-start">
                          <FlagTeam flag={match.away_flag} name={match.away_team} reverse={true} className="text-sm justify-start w-full" />
                        </div>
                      </div>

                      {/* Resultado Real e Pontos */}
                      <div className="flex items-center gap-3.5 w-full sm:w-auto justify-center sm:justify-end border-t sm:border-t-0 border-border-custom/40 pt-3.5 sm:pt-0">
                        <div className="text-center sm:text-right">
                          <span className="text-[9px] text-secondary font-bold uppercase tracking-wider block">Resultado Real</span>
                          <span className="text-sm font-black text-primary">{match.home_score} x {match.away_score}</span>
                        </div>
                        <PointsBadge points={pred.points} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
