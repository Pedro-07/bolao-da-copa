'use client';

import React, { useState, useTransition, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import FlagTeam from './FlagTeam';
import PointsBadge from './PointsBadge';
import { Match, Prediction } from '@/types';
import { savePrediction } from '@/app/actions';
import { Calendar, NotePencil, Lock, X, Spinner, Check } from '@phosphor-icons/react';
import CountdownTimer from './CountdownTimer';
import { showToast } from './Toast';
import { formatMatchDate, formatMatchTime } from '@/lib/date';

interface MatchCardProps {
  match: Match;
  prediction?: Prediction | null;
  isAuthenticated: boolean;
  matchNumber?: number;
  disablePrediction?: boolean;
}

export default function MatchCard({ match, prediction, isAuthenticated, matchNumber, disablePrediction = false }: MatchCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [homeScore, setHomeScore] = useState<string>('');
  const [awayScore, setAwayScore] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [localPrediction, setLocalPrediction] = useState<Prediction | null | undefined>(prediction);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setLocalPrediction(prediction);
  }, [prediction]);

  const matchTime = new Date(match.match_time);
  const isStarted = matchTime <= new Date();

  // Formatação de data e hora
  const dateFormatted = formatMatchDate(match.match_time);
  const timeFormatted = formatMatchTime(match.match_time);

  const hasRealResult = match.home_score !== null && match.away_score !== null;
  const hasPrediction = !!localPrediction;
  const isAConfirmar = match.home_team === 'A confirmar' || match.away_team === 'A confirmar';

  // Determinar cores, bordas e badges baseados no status da partida e palpites
  let cardBgClass = 'bg-card';
  let cardBorderClass = 'border-border-custom hover:border-secondary';
  let statusBadge = null;

  if (hasRealResult) {
    // Jogo Encerrado
    if (localPrediction) {
      if (localPrediction.points === 3) {
        cardBgClass = 'bg-green-500/5 dark:bg-green-500/5';
        cardBorderClass = 'border-green-500/30 hover:border-green-500';
      } else if (localPrediction.points === 2 || localPrediction.points === 1) {
        cardBgClass = 'bg-blue-500/5 dark:bg-blue-500/5';
        cardBorderClass = 'border-blue-500/30 hover:border-blue-500';
      } else {
        cardBgClass = 'bg-muted/30 dark:bg-muted/10';
        cardBorderClass = 'border-border-custom hover:border-secondary';
      }
    } else {
      cardBgClass = 'bg-muted/20 dark:bg-muted/5';
      cardBorderClass = 'border-border-custom/50';
    }
  } else if (isStarted) {
    // Jogo em Andamento (Ao Vivo)
    cardBgClass = 'bg-card';
    cardBorderClass = 'border-red-500/40 hover:border-red-500';
    statusBadge = (
      <span className="flex items-center gap-1.5 bg-red-500/10 text-red-500 border border-red-500/20 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider animate-pulse select-none">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        Ao vivo
      </span>
    );
  } else {
    // Jogo Futuro
    if (hasPrediction) {
      cardBorderClass = 'border-green-500/50 hover:border-green-500';
      statusBadge = (
        <span className="bg-green-500/10 text-green-500 border border-green-500/25 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider select-none">
          Palpite salvo ✓
        </span>
      );
    } else {
      cardBorderClass = 'border-amber-500/50 hover:border-amber-500';
      statusBadge = disablePrediction ? null : (
        <span className="bg-amber-500/10 text-amber-500 border border-amber-500/25 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider select-none animate-pulse">
          Palpitar
        </span>
      );
    }
  }

  const handleOpenModal = () => {
    setHomeScore(localPrediction ? String(localPrediction.home_score) : '');
    setAwayScore(localPrediction ? String(localPrediction.away_score) : '');
    setError(null);
    setIsModalOpen(true);
  };

  const handlePredictionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isStarted) {
      setError('O período de palpites para esta partida já foi encerrado.');
      return;
    }

    if (homeScore === '' || awayScore === '') {
      setError('Por favor, preencha os placares dos dois times.');
      return;
    }

    const homeVal = parseInt(homeScore, 10);
    const awayVal = parseInt(awayScore, 10);

    if (isNaN(homeVal) || isNaN(awayVal) || homeVal < 0 || awayVal < 0) {
      setError('Os placares devem ser números inteiros maiores ou iguais a zero.');
      return;
    }

    setError(null);

    startTransition(async () => {
      try {
        const result = await savePrediction(match.id, homeVal, awayVal);
        if (result.success) {
          showToast(hasPrediction ? 'Palpite atualizado!' : 'Palpite salvo com sucesso!', 'success');
          
          setLocalPrediction({
            id: '',
            match_id: match.id,
            user_id: '',
            home_score: homeVal,
            away_score: awayVal,
            points: null,
            created_at: new Date().toISOString()
          } as Prediction);

          router.refresh();
          setIsModalOpen(false);
        } else {
          setError(result.error || 'Erro ao registrar palpite.');
        }
      } catch (err: any) {
        setError(err.message || 'Erro inesperado.');
      }
    });
  };

  return (
    <div
      className={`border ${cardBorderClass} ${cardBgClass} rounded-2xl p-5 flex flex-col justify-between shadow-md hover:scale-[1.01] active:scale-[0.99] sm:hover:scale-[1.02] sm:active:scale-[1.0] transition-all duration-300 min-w-0`}
    >
      {/* Header do Card */}
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-bold mb-4 pb-3 border-b border-border-custom/50">
        <span className="bg-muted px-2.5 py-1 rounded-full text-[10px] text-slate-900 dark:text-slate-50 uppercase tracking-wider truncate max-w-[170px] sm:max-w-[200px]">
          {match.stage} {match.group_name ? `• ${match.group_name}` : ''} {matchNumber ? `• Jogo ${matchNumber}` : ''}
        </span>
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 select-none">
            <Calendar size={14} />
            {dateFormatted} às {timeFormatted}
          </span>
          {!isStarted && !hasRealResult && <CountdownTimer matchTime={match.match_time} />}
        </div>
      </div>

      {/* Grid Principal (Layout Confronto Simétrico) */}
      <div className="grid grid-cols-12 items-center gap-2 my-2 w-full min-w-0">
        {/* Time Mandante (Bandeira + Nome) */}
        <div className="col-span-5 flex justify-start min-w-0">
          <FlagTeam flag={match.home_flag} name={match.home_team} reverse={false} className="w-full justify-start" />
        </div>

        {/* Scores ou Placar Central (X) */}
        <div className="col-span-2 flex flex-col items-center justify-center shrink-0">
          {hasRealResult ? (
            <div className="flex items-center gap-1 bg-muted border border-border-custom/80 px-2 py-1 rounded-lg font-extrabold text-sm text-accent-custom select-none">
              <span>{match.home_score}</span>
              <span className="text-slate-500 dark:text-slate-400 text-xs font-bold">x</span>
              <span>{match.away_score}</span>
            </div>
          ) : (
            <span className="text-xs font-black text-slate-500 dark:text-slate-400 select-none">
              x
            </span>
          )}
        </div>

        {/* Time Visitante (Nome + Bandeira) */}
        <div className="col-span-5 flex justify-end min-w-0">
          <FlagTeam flag={match.away_flag} name={match.away_team} reverse={true} className="w-full justify-end" />
        </div>
      </div>

      {/* Rodapé: Informação de Palpite e Ações */}
      <div className="mt-5 pt-3.5 border-t border-border-custom/50 flex items-center justify-between gap-3 text-sm">
        {/* Lado Esquerdo: Palpite do Usuário */}
        <div>
          {isAConfirmar ? (
            <span className="text-xs text-slate-500 dark:text-slate-400 italic select-none">
              Confronto indefinido
            </span>
          ) : isAuthenticated ? (
            hasPrediction ? (
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Seu palpite</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-xs text-amber-500 bg-amber-500/10 px-2.5 py-0.5 rounded-lg border border-amber-500/20">
                    {localPrediction?.home_score} x {localPrediction?.away_score}
                  </span>
                  {hasRealResult && localPrediction && <PointsBadge points={localPrediction.points} />}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">Seu palpite</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-bold italic select-none">
                  Sem palpite
                </span>
              </div>
            )
          ) : (
            <span className="text-xs text-slate-500 dark:text-slate-400 italic select-none">
              Entre para palpitar
            </span>
          )}
        </div>

        {/* Lado Direito: Ações */}
        <div className="flex items-center gap-2">
          {statusBadge}
          
          {isAConfirmar ? (
            <span className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400 font-bold uppercase select-none">
              <Lock size={13} />
            </span>
          ) : disablePrediction ? (
            <span className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-500 dark:text-slate-400 font-bold uppercase select-none bg-muted/30 rounded-lg border border-border-custom/50">
              Apenas em salas
            </span>
          ) : !isStarted ? (
            isAuthenticated ? (
              <button
                onClick={handleOpenModal}
                className="min-h-[48px] px-4 bg-accent-custom hover:bg-accent-hover text-slate-950 text-xs font-bold rounded-xl shadow-md transition-all duration-200 cursor-pointer flex items-center gap-1.5"
              >
                <NotePencil size={14} />
                {hasPrediction ? 'Editar' : 'Palpitar'}
              </button>
            ) : (
              <Link
                href="/login"
                className="min-h-[48px] px-4 flex items-center justify-center bg-muted hover:bg-border-custom text-slate-900 dark:text-slate-50 text-xs font-bold rounded-xl border border-border-custom transition-colors duration-200"
              >
                Palpitar
              </Link>
            )
          ) : (
            <span className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-500 dark:text-slate-400 font-bold uppercase select-none bg-muted/50 rounded-lg border border-border-custom/50">
              <Lock size={13} />
              Fechado
            </span>
          )}
        </div>
      </div>

      {/* Modal de Palpites Inline via Portal */}
      {mounted && typeof document !== 'undefined' && isModalOpen
        ? createPortal(
            <div
              onClick={() => {
                if (!isPending) {
                  setIsModalOpen(false);
                  setError(null);
                }
              }}
              className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-4"
            >
              {/* Card do Modal */}
              <div
                onClick={(e) => e.stopPropagation()}
                className="relative w-full sm:max-w-md bg-card border border-border-custom rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl p-6 pb-safe animate-slideUp sm:animate-fadeIn"
              >
                {/* Drag Handle para Mobile */}
                <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mb-4 sm:hidden select-none" />

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => {
                    if (!isPending) {
                      setIsModalOpen(false);
                      setError(null);
                    }
                  }}
                  className="absolute top-4 right-4 w-12 h-12 flex items-center justify-center rounded-full bg-muted/50 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-50 transition-colors cursor-pointer"
                  disabled={isPending}
                >
                  <X size={18} weight="bold" />
                </button>

                <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-50 text-center mb-1">
                  {hasPrediction ? 'Editar Palpite' : 'Lançar Palpite'}
                </h3>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest text-center mb-5">
                  {match.stage} {match.group_name ? `• ${match.group_name}` : ''} {matchNumber ? `• Jogo ${matchNumber}` : ''}
                </p>

                {/* Info Partida */}
                <div className="bg-muted/40 border border-border-custom/60 rounded-2xl p-4 mb-5 flex flex-col items-center">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-3 select-none">
                    Prazo: {dateFormatted} às {timeFormatted}
                  </span>

                  <div className="grid grid-cols-12 items-center w-full gap-2 mt-1">
                    {/* Time Casa */}
                    <div className="col-span-5 flex justify-end min-w-0">
                      <FlagTeam flag={match.home_flag} name={match.home_team} reverse={true} className="w-full justify-end text-xs sm:text-sm" />
                    </div>

                    {/* Divisor vs */}
                    <div className="col-span-2 flex justify-center text-slate-500 dark:text-slate-400 font-black text-xs uppercase select-none">
                      vs
                    </div>

                    {/* Time Fora */}
                    <div className="col-span-5 flex justify-start min-w-0">
                      <FlagTeam flag={match.away_flag} name={match.away_team} reverse={false} className="w-full justify-start text-xs sm:text-sm" />
                    </div>
                  </div>
                </div>

                {/* Formulário */}
                <form onSubmit={handlePredictionSubmit} className="space-y-6">
                  <div className="flex items-center justify-center gap-6 sm:gap-8">
                    {/* Mandante Input */}
                    <div className="flex flex-col items-center gap-2 flex-1 max-w-[120px]">
                      <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 tracking-wider uppercase truncate w-full text-center">
                        {match.home_team}
                      </span>
                      <input
                        type="number"
                        min="0"
                        value={homeScore}
                        onChange={(e) => setHomeScore(e.target.value)}
                        disabled={isPending}
                        className="w-20 h-20 text-center text-4xl font-black bg-base border-2 border-border-custom focus:border-accent-custom text-slate-900 dark:text-slate-50 rounded-2xl focus:outline-none transition-colors duration-200 disabled:opacity-45 disabled:cursor-not-allowed select-all"
                        placeholder="0"
                        required
                      />
                    </div>

                    <span className="text-3xl font-black text-secondary/40 select-none">-</span>

                    {/* Visitante Input */}
                    <div className="flex flex-col items-center gap-2 flex-1 max-w-[120px]">
                      <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 tracking-wider uppercase truncate w-full text-center">
                        {match.away_team}
                      </span>
                      <input
                        type="number"
                        min="0"
                        value={awayScore}
                        onChange={(e) => setAwayScore(e.target.value)}
                        disabled={isPending}
                        className="w-20 h-20 text-center text-4xl font-black bg-base border-2 border-border-custom focus:border-accent-custom text-slate-900 dark:text-slate-50 rounded-2xl focus:outline-none transition-colors duration-200 disabled:opacity-45 disabled:cursor-not-allowed select-all"
                        placeholder="0"
                        required
                      />
                    </div>
                  </div>

                  {/* Notificações de erro */}
                  {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl p-3 text-xs font-bold text-center">
                      {error}
                    </div>
                  )}

                  {/* Botões de Ação */}
                  <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsModalOpen(false);
                        setError(null);
                      }}
                      disabled={isPending}
                      className="w-full sm:flex-1 h-12 border border-border-custom hover:bg-muted text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-50 text-xs font-bold uppercase tracking-wider rounded-xl transition-all duration-200 disabled:opacity-40 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isPending}
                      className="w-full sm:flex-1 h-12 flex items-center justify-center gap-1.5 bg-gradient-to-r from-accent-custom to-accent-hover text-slate-950 text-xs font-extrabold uppercase tracking-wider rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {isPending ? (
                        <>
                          <Spinner className="animate-spin" size={14} weight="bold" />
                          Salvando...
                        </>
                      ) : (
                        'Salvar Palpite'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
