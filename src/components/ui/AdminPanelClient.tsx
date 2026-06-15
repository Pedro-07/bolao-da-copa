'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import FlagTeam from './FlagTeam';
import { Match } from '@/types';
import { saveMatchResult, shiftAllMatchTimes } from '@/app/actions';
import { Plus, Check, Spinner, Trash, Calendar, Clock, Users, Coins, Crown, X } from '@phosphor-icons/react';
import { createClient } from '@/lib/supabase/client';
import { showToast } from './Toast';
import { formatMatchDateTime, parseLocalDateToUTC } from '@/lib/date';
import { deleteUser } from '@/app/actions';

interface AdminUser {
  id: string;
  name: string;
  predictionCount: number;
}

interface AdminWithdrawal {
  id: string;
  user_id: string;
  user_name: string;
  amount: number;
  pix_key_type: 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP';
  pix_key: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

interface AdminRoom {
  id: string;
  name: string;
  entry_fee: number;
  created_by: string;
  creator_name: string;
  finalized: boolean;
  finalized_at: string | null;
  matches_count: number;
  participants_paid_count: number;
  is_ready_to_finalize: boolean;
  creator_commission_percent?: number;
  platform_fee_percent?: number;
}

interface AdminPanelClientProps {
  matches: Match[];
  users: AdminUser[];
  adminUserId: string;
  withdrawals: AdminWithdrawal[];
  rooms: AdminRoom[];
}

export default function AdminPanelClient({
  matches,
  users,
  adminUserId,
  withdrawals = [],
  rooms = [],
}: AdminPanelClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const supabase = createClient();

  // Abas administrativas: 'matches' | 'withdrawals' | 'rooms'
  const [adminTab, setAdminTab] = useState<'matches' | 'withdrawals' | 'rooms'>('matches');

  // Estados do Formulário de Cadastro de Partida
  const [homeTeam, setHomeTeam] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [homeFlag, setHomeFlag] = useState('');
  const [awayFlag, setAwayFlag] = useState('');
  const [matchTime, setMatchTime] = useState('');
  const [stage, setStage] = useState('Fase de Grupos');
  const [groupName, setGroupName] = useState('');

  // Estados locais para edição dos placares das partidas
  const [editedScores, setEditedScores] = useState<Record<string, { home: string; away: string }>>({});
  const [savingMatchId, setSavingMatchId] = useState<string | null>(null);

  // Estados de feedback do formulário
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<boolean>(false);

  // Estados de fuso horário
  const [isShifting, setIsShifting] = useState(false);

  // Estado de deleção de usuário
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  // Estados de processamento financeiro
  const [processingWithdrawalId, setProcessingWithdrawalId] = useState<string | null>(null);
  const [finalizingRoomId, setFinalizingRoomId] = useState<string | null>(null);

  const handleDeleteUser = async (user: AdminUser) => {
    if (
      !confirm(
        `Excluir "${user.name}"? Isso apagará também todos os ${user.predictionCount} palpites dele. Esta ação não pode ser desfeita.`
      )
    )
      return;
    setDeletingUserId(user.id);
    try {
      const res = await deleteUser(user.id);
      if (res.success) {
        showToast(`Usuário "${user.name}" excluído com sucesso.`, 'success');
        router.refresh();
      } else {
        showToast(res.error || 'Erro ao excluir usuário.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Erro inesperado.', 'error');
    } finally {
      setDeletingUserId(null);
    }
  };

  const handleShiftTimes = async () => {
    if (
      !confirm(
        'Deseja realmente sincronizar o fuso horário de TODOS os jogos para o horário oficial de Brasília/Fortaleza (UTC-3)?'
      )
    ) {
      return;
    }

    setIsShifting(true);
    try {
      const res = await shiftAllMatchTimes();
      if (res.success) {
        showToast('Horários sincronizados com Brasília (UTC-3) com sucesso!', 'success');
        router.refresh();
      } else {
        showToast(res.error || 'Erro ao sincronizar horários.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Erro inesperado.', 'error');
    } finally {
      setIsShifting(false);
    }
  };

  const handleScoreChange = (matchId: string, side: 'home' | 'away', val: string) => {
    const current = editedScores[matchId] || { home: '', away: '' };
    setEditedScores({
      ...editedScores,
      [matchId]: {
        ...current,
        [side]: val,
      },
    });
  };

  // Salvar resultado real de uma partida
  const handleSaveResult = async (matchId: string) => {
    const scores = editedScores[matchId];
    if (!scores || scores.home === '' || scores.away === '') {
      showToast('Preencha os dois placares antes de salvar!', 'error');
      return;
    }

    const homeVal = parseInt(scores.home, 10);
    const awayVal = parseInt(scores.away, 10);

    if (isNaN(homeVal) || isNaN(awayVal) || homeVal < 0 || awayVal < 0) {
      showToast('Insira placares válidos maiores ou iguais a zero!', 'error');
      return;
    }

    setSavingMatchId(matchId);

    try {
      const result = await saveMatchResult(matchId, homeVal, awayVal);
      if (result.success) {
        showToast('Placar da partida salvo com sucesso!', 'success');
        const updatedScores = { ...editedScores };
        delete updatedScores[matchId];
        setEditedScores(updatedScores);
        router.refresh();
      } else {
        showToast(result.error || 'Erro ao salvar o resultado.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Erro inesperado.', 'error');
    } finally {
      setSavingMatchId(null);
    }
  };

  // Cadastrar nova partida
  const handleCreateMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(false);

    if (!homeTeam || !awayTeam || !homeFlag || !awayFlag || !matchTime) {
      setFormError('Preencha todos os campos obrigatórios.');
      return;
    }

    startTransition(async () => {
      try {
        const { createMatch } = await import('@/app/actions');

        const res = await createMatch({
          home_team: homeTeam.trim(),
          away_team: awayTeam.trim(),
          home_flag: homeFlag.trim(),
          away_flag: awayFlag.trim(),
          match_time: parseLocalDateToUTC(matchTime),
          stage,
          group_name: groupName.trim() || null,
        });

        if (res.success) {
          showToast('Partida cadastrada com sucesso!', 'success');
          setFormSuccess(true);
          setHomeTeam('');
          setAwayTeam('');
          setHomeFlag('');
          setAwayFlag('');
          setMatchTime('');
          setGroupName('');
          router.refresh();
          setTimeout(() => setFormSuccess(false), 2000);
        } else {
          setFormError(res.error || 'Erro ao cadastrar partida.');
        }
      } catch (err: any) {
        setFormError(err.message || 'Erro inesperado.');
      }
    });
  };

  const handleDeleteMatch = async (matchId: string) => {
    if (
      !confirm('Deseja realmente remover esta partida? Isso apagará também todos os palpites.')
    ) {
      return;
    }

    try {
      const { error } = await supabase.from('matches').delete().eq('id', matchId);
      if (error) {
        showToast(error.message, 'error');
      } else {
        showToast('Partida excluída com sucesso!', 'success');
        router.refresh();
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Funções de Saque
  const handleApproveWithdrawal = async (id: string) => {
    if (
      !confirm(
        'Confirmar aprovação deste saque? Certifique-se de que já realizou o PIX manualmente para o usuário.'
      )
    )
      return;
    setProcessingWithdrawalId(id);
    try {
      const { approveWithdrawal } = await import('@/app/actions');
      const res = await approveWithdrawal(id);
      if (res.success) {
        showToast('Saque aprovado com sucesso!', 'success');
        router.refresh();
      } else {
        showToast(res.error || 'Erro ao aprovar saque.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Erro inesperado.', 'error');
    } finally {
      setProcessingWithdrawalId(null);
    }
  };

  const handleRejectWithdrawal = async (id: string) => {
    if (
      !confirm(
        'Confirmar rejeição deste saque? O valor correspondente será devolvido ao saldo do usuário.'
      )
    )
      return;
    setProcessingWithdrawalId(id);
    try {
      const { rejectWithdrawal } = await import('@/app/actions');
      const res = await rejectWithdrawal(id);
      if (res.success) {
        showToast('Saque rejeitado e valor devolvido!', 'success');
        router.refresh();
      } else {
        showToast(res.error || 'Erro ao rejeitar saque.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Erro inesperado.', 'error');
    } finally {
      setProcessingWithdrawalId(null);
    }
  };

  // Funções de Sala
  const handleFinalizeRoom = async (roomId: string, name: string) => {
    if (
      !confirm(
        `Confirmar encerramento do Bolão "${name}"? Isso irá calcular as pontuações da sala, identificar os vencedores de 1º lugar e distribuir as respectivas fatias de prêmio diretamente no saldo deles. Esta ação é irreversível!`
      )
    )
      return;
    setFinalizingRoomId(roomId);
    try {
      const { finalizeRoom } = await import('@/app/actions');
      const res = await finalizeRoom(roomId);
      if (res.success) {
        showToast(`Bolão "${name}" encerrado e prêmios distribuídos com sucesso!`, 'success');
        router.refresh();
      } else {
        showToast(res.error || 'Erro ao encerrar bolão.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Erro inesperado.', 'error');
    } finally {
      setFinalizingRoomId(null);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val);
  };

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Filtra as partidas pendentes de resultado
  const pendingMatches = matches.filter((m) => m.home_score === null || m.away_score === null);

  const avatarColors = [
    'bg-red-500/10 text-red-500 border-red-500/20',
    'bg-blue-500/10 text-blue-500 border-blue-500/20',
    'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    'bg-amber-500/10 text-amber-500 border-amber-500/20',
    'bg-purple-500/10 text-purple-500 border-purple-500/20',
    'bg-pink-500/10 text-pink-500 border-pink-500/20',
    'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
    'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
  ];

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Abas Administrativas */}
      <div className="flex border-b border-border-custom/60 pb-3 gap-6 select-none overflow-x-auto shrink-0">
        <button
          onClick={() => setAdminTab('matches')}
          className={`pb-1 text-xs font-black uppercase tracking-wider border-b-2 transition-all whitespace-nowrap cursor-pointer ${
            adminTab === 'matches'
              ? 'border-accent-custom text-primary'
              : 'border-transparent text-secondary hover:text-primary'
          }`}
        >
          Partidas e Usuários
        </button>
        <button
          onClick={() => setAdminTab('withdrawals')}
          className={`pb-1 text-xs font-black uppercase tracking-wider border-b-2 transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
            adminTab === 'withdrawals'
              ? 'border-accent-custom text-primary'
              : 'border-transparent text-secondary hover:text-primary'
          }`}
        >
          Solicitações de Saque
          {withdrawals.filter((w) => w.status === 'pending').length > 0 && (
            <span className="bg-amber-500 text-slate-950 font-black text-[9px] px-1.5 py-0.5 rounded-full shrink-0">
              {withdrawals.filter((w) => w.status === 'pending').length}
            </span>
          )}
        </button>
        <button
          onClick={() => setAdminTab('rooms')}
          className={`pb-1 text-xs font-black uppercase tracking-wider border-b-2 transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
            adminTab === 'rooms'
              ? 'border-accent-custom text-primary'
              : 'border-transparent text-secondary hover:text-primary'
          }`}
        >
          Finalizar Salas
          {rooms.filter((r) => r.is_ready_to_finalize).length > 0 && (
            <span className="bg-green-500 text-slate-950 font-black text-[9px] px-1.5 py-0.5 rounded-full shrink-0 animate-pulse">
              {rooms.filter((r) => r.is_ready_to_finalize).length}
            </span>
          )}
        </button>
      </div>

      {/* Conteúdo Aba 1: Partidas e Usuários */}
      {adminTab === 'matches' && (
        <div className="space-y-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Coluna Esquerda (Formulário + Fuso Horário) */}
            <div className="lg:col-span-4 space-y-6">
              {/* Formulário de Cadastro */}
              <div className="bg-card border border-border-custom rounded-2xl p-6 shadow-xl transition-all duration-300">
                <h2 className="text-base font-extrabold text-primary mb-5 uppercase tracking-wider flex items-center gap-2 select-none">
                  <Plus size={16} weight="bold" className="text-accent-custom" />
                  Nova Partida
                </h2>

                <form onSubmit={handleCreateMatch} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-secondary uppercase tracking-wider block">
                        Mandante
                      </label>
                      <input
                        type="text"
                        value={homeTeam}
                        onChange={(e) => setHomeTeam(e.target.value)}
                        className="w-full h-12 px-3 bg-base border border-border-custom focus:border-accent-custom text-primary text-sm rounded-xl focus:outline-none font-medium transition-colors"
                        placeholder="Brasil"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-secondary uppercase tracking-wider block">
                        Bandeira (Emoji)
                      </label>
                      <input
                        type="text"
                        value={homeFlag}
                        onChange={(e) => setHomeFlag(e.target.value)}
                        maxLength={4}
                        className="w-full h-12 px-3 bg-base border border-border-custom focus:border-accent-custom text-primary text-sm rounded-xl focus:outline-none text-center font-medium transition-colors"
                        placeholder="🇧🇷"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-secondary uppercase tracking-wider block">
                        Visitante
                      </label>
                      <input
                        type="text"
                        value={awayTeam}
                        onChange={(e) => setAwayTeam(e.target.value)}
                        className="w-full h-12 px-3 bg-base border border-border-custom focus:border-accent-custom text-primary text-sm rounded-xl focus:outline-none font-medium transition-colors"
                        placeholder="Argentina"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-secondary uppercase tracking-wider block">
                        Bandeira (Emoji)
                      </label>
                      <input
                        type="text"
                        value={awayFlag}
                        onChange={(e) => setAwayFlag(e.target.value)}
                        maxLength={4}
                        className="w-full h-12 px-3 bg-base border border-border-custom focus:border-accent-custom text-primary text-sm rounded-xl focus:outline-none text-center font-medium transition-colors"
                        placeholder="🇦🇷"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-secondary uppercase tracking-wider block">
                      Data & Horário
                    </label>
                    <input
                      type="datetime-local"
                      value={matchTime}
                      onChange={(e) => setMatchTime(e.target.value)}
                      className="w-full h-12 px-3 bg-base border border-border-custom focus:border-accent-custom text-primary text-sm rounded-xl focus:outline-none font-medium transition-colors"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-secondary uppercase tracking-wider block">
                        Etapa
                      </label>
                      <select
                        value={stage}
                        onChange={(e) => setStage(e.target.value)}
                        className="w-full h-12 px-2 bg-base border border-border-custom focus:border-accent-custom text-primary text-xs font-bold rounded-xl focus:outline-none transition-colors"
                      >
                        <option value="Fase de Grupos">Fase de Grupos</option>
                        <option value="Oitavas de Final">Oitavas</option>
                        <option value="Quartas de Final">Quartas</option>
                        <option value="Semifinal">Semifinal</option>
                        <option value="Final">Final</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-secondary uppercase tracking-wider block">
                        Grupo
                      </label>
                      <input
                        type="text"
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        className="w-full h-12 px-3 bg-base border border-border-custom focus:border-accent-custom text-primary text-sm rounded-xl focus:outline-none font-medium transition-colors"
                        placeholder="Grupo A"
                      />
                    </div>
                  </div>

                  {formError && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold rounded-xl p-3 text-center">
                      {formError}
                    </div>
                  )}

                  {formSuccess && (
                    <div className="bg-green-500/10 border border-green-500/20 text-accent-custom text-xs font-bold rounded-xl p-3 text-center">
                      Jogo cadastrado com sucesso!
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isPending}
                    className="w-full h-12 flex items-center justify-center gap-1.5 bg-gradient-to-r from-accent-custom to-accent-hover text-slate-950 text-xs font-extrabold uppercase tracking-wider rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isPending ? (
                      <Spinner size={15} className="animate-spin" />
                    ) : (
                      'Cadastrar Jogo'
                    )}
                  </button>
                </form>
              </div>

              {/* Card de Configurações de Fuso Horário */}
              <div className="bg-card border border-border-custom rounded-2xl p-6 shadow-xl transition-all duration-300">
                <h2 className="text-sm font-extrabold text-primary mb-3 uppercase tracking-wider flex items-center gap-2 select-none">
                  <Clock size={16} className="text-amber-500" />
                  Fuso Horário (Fortaleza/BRT)
                </h2>
                <p className="text-xs text-secondary mb-4 leading-relaxed font-medium">
                  Caso os horários dos jogos estejam incorretos ou as partidas estejam sendo
                  encerradas antes do horário oficial de Brasília, clique no botão abaixo para
                  alinhar todos os jogos aos horários corretos de transmissão no Brasil.
                </p>
                <button
                  onClick={handleShiftTimes}
                  disabled={isShifting}
                  className="w-full h-11 flex items-center justify-center gap-1.5 bg-muted hover:bg-amber-500/10 text-amber-500 hover:text-amber-600 border border-border-custom hover:border-amber-500/20 text-xs font-extrabold uppercase tracking-wider rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isShifting ? (
                    <Spinner size={14} className="animate-spin" />
                  ) : (
                    'Sincronizar com Brasília (UTC-3)'
                  )}
                </button>
              </div>
            </div>

            {/* Lista de Partidas sem Resultado */}
            <div className="lg:col-span-8 space-y-5">
              <h2 className="text-base font-extrabold text-primary uppercase tracking-wider flex items-center gap-2 pb-2.5 border-b border-border-custom">
                <Calendar size={18} className="text-accent-custom" />
                Lançar Resultados
              </h2>

              {pendingMatches.length === 0 ? (
                <div className="bg-card border border-border-custom rounded-2xl p-10 text-center text-secondary text-sm font-bold shadow-md">
                  ⚽ Todas as partidas cadastradas possuem resultados finais!
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingMatches.map((match) => {
                    const currentScore = editedScores[match.id] || {
                      home: '',
                      away: '',
                    };

                    const isSaving = savingMatchId === match.id;

                    return (
                      <div
                        key={match.id}
                        className="bg-card border border-border-custom hover:border-secondary rounded-2xl p-5 shadow-md transition-all duration-200"
                      >
                        <div className="grid grid-cols-12 items-center gap-4 w-full text-sm">
                          <div className="col-span-12 md:col-span-3 text-center md:text-left space-y-1">
                            <span className="bg-muted border border-border-custom/50 px-2.5 py-0.5 rounded-full text-[9px] text-primary uppercase font-bold inline-block select-none">
                              {match.stage}{' '}
                              {match.group_name ? `• ${match.group_name}` : ''}
                            </span>
                            <div className="text-[11px] text-secondary font-extrabold block">
                              {formatMatchDateTime(match.match_time)}
                            </div>
                          </div>

                          <div className="col-span-12 md:col-span-6 flex items-center justify-between gap-3">
                            <div className="flex-1 flex justify-end truncate">
                              <FlagTeam
                                flag={match.home_flag}
                                name={match.home_team}
                                reverse={false}
                                className="text-xs sm:text-sm justify-end w-full"
                              />
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0 mx-1">
                              <input
                                type="number"
                                min="0"
                                value={currentScore.home}
                                onChange={(e) =>
                                  handleScoreChange(match.id, 'home', e.target.value)
                                }
                                className="w-12 h-12 text-center font-black bg-base border border-border-custom focus:border-accent-custom rounded-xl text-primary text-base focus:outline-none transition-colors select-all"
                                placeholder="-"
                                required
                              />
                              <span className="text-secondary/40 font-black text-xs select-none">
                                x
                              </span>
                              <input
                                type="number"
                                min="0"
                                value={currentScore.away}
                                onChange={(e) =>
                                  handleScoreChange(match.id, 'away', e.target.value)
                                }
                                className="w-12 h-12 text-center font-black bg-base border border-border-custom focus:border-accent-custom rounded-xl text-primary text-base focus:outline-none transition-colors select-all"
                                placeholder="-"
                                required
                              />
                            </div>

                            <div className="flex-1 flex justify-start truncate">
                              <FlagTeam
                                flag={match.away_flag}
                                name={match.away_team}
                                reverse={true}
                                className="text-xs sm:text-sm justify-start w-full"
                              />
                            </div>
                          </div>

                          <div className="col-span-12 md:col-span-3 flex items-center justify-center md:justify-end gap-2 border-t md:border-t-0 border-border-custom/40 pt-3.5 md:pt-0">
                            <button
                              onClick={() => handleSaveResult(match.id)}
                              disabled={isSaving}
                              className="h-12 px-4 bg-muted hover:bg-accent-custom hover:text-slate-950 text-accent-custom text-xs font-extrabold uppercase tracking-wider rounded-xl border border-border-custom hover:border-transparent transition-all flex items-center gap-1.5 shadow-md flex-grow md:flex-grow-0 justify-center cursor-pointer"
                            >
                              {isSaving ? (
                                <Spinner className="animate-spin" size={14} />
                              ) : (
                                <Check size={14} weight="bold" />
                              )}
                              Salvar
                            </button>
                            <button
                              onClick={() => handleDeleteMatch(match.id)}
                              className="w-12 h-12 flex items-center justify-center bg-muted hover:bg-rose-500/10 text-secondary hover:text-rose-500 rounded-xl border border-border-custom/80 hover:border-rose-500/20 transition-all shrink-0 cursor-pointer"
                              title="Excluir Partida"
                            >
                              <Trash size={15} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Usuários Cadastrados */}
          <div className="bg-card border border-border-custom rounded-2xl p-6 shadow-xl">
            <h2 className="text-base font-extrabold text-primary mb-1 uppercase tracking-wider flex items-center gap-2 select-none">
              <Users size={18} className="text-accent-custom" />
              Usuários Cadastrados
              <span className="text-xs font-bold text-secondary normal-case tracking-normal ml-1">
                ({users.length})
              </span>
            </h2>
            <p className="text-xs text-secondary mb-5 font-medium">
              Exclua participantes indesejados. A exclusão remove o usuário e todos os palpites
              dele permanentemente.
            </p>

            {users.length === 0 ? (
              <div className="text-center py-8 text-secondary text-sm font-bold">
                Nenhum participante cadastrado ainda.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {users.map((u) => {
                  const isAdmin = u.id === adminUserId;
                  const colorIdx = u.name.charCodeAt(0) % avatarColors.length;
                  const avatarClass = avatarColors[colorIdx];
                  const isDeleting = deletingUserId === u.id;

                  return (
                    <div
                      key={u.id}
                      className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border transition-all ${
                        isAdmin
                          ? 'border-accent-custom/30 bg-accent-custom/5'
                          : 'border-border-custom bg-muted/20 hover:border-secondary'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`w-9 h-9 flex items-center justify-center rounded-full text-sm font-black shrink-0 border select-none ${avatarClass}`}
                        >
                          {u.name.substring(0, 1).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-bold text-primary truncate">
                              {u.name}
                            </span>
                            {isAdmin && (
                              <span className="text-[9px] font-black text-accent-custom uppercase tracking-widest bg-accent-custom/10 px-1.5 py-0.5 rounded-md border border-accent-custom/20 shrink-0">
                                Admin
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-secondary font-bold block">
                            {u.predictionCount}{' '}
                            {u.predictionCount === 1 ? 'palpite' : 'palpites'}
                          </span>
                        </div>
                      </div>

                      {!isAdmin && (
                        <button
                          onClick={() => handleDeleteUser(u)}
                          disabled={isDeleting}
                          className="w-9 h-9 flex items-center justify-center bg-muted hover:bg-rose-500/10 text-secondary hover:text-rose-500 rounded-xl border border-border-custom/80 hover:border-rose-500/20 transition-all shrink-0 cursor-pointer disabled:opacity-40"
                          title={`Excluir ${u.name}`}
                        >
                          {isDeleting ? (
                            <Spinner size={13} className="animate-spin" />
                          ) : (
                            <Trash size={14} />
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Conteúdo Aba 2: Solicitações de Saque */}
      {adminTab === 'withdrawals' && (
        <div className="space-y-6">
          <div className="bg-card border border-border-custom rounded-2xl p-6 shadow-xl">
            <h2 className="text-base font-extrabold text-primary mb-1 uppercase tracking-wider flex items-center gap-2">
              <Coins size={20} className="text-amber-500" />
              Saques Pendentes
              <span className="text-xs font-bold text-secondary normal-case tracking-normal ml-1">
                ({withdrawals.filter((w) => w.status === 'pending').length})
              </span>
            </h2>
            <p className="text-xs text-secondary mb-5 font-medium">
              Efetue a transferência Pix no Asaas ou banco e depois clique em aprovar para
              finalizar a transação no sistema.
            </p>

            {withdrawals.filter((w) => w.status === 'pending').length === 0 ? (
              <div className="text-center py-12 text-secondary text-xs font-semibold">
                Nenhum saque Pix pendente de aprovação.
              </div>
            ) : (
              <div className="space-y-4">
                {withdrawals
                  .filter((w) => w.status === 'pending')
                  .map((w) => {
                    const isProcessing = processingWithdrawalId === w.id;
                    return (
                      <div
                        key={w.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-muted/40 border border-border-custom/60 gap-4 text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-primary text-sm">
                              {formatCurrency(w.amount)}
                            </span>
                            <span className="text-[10px] text-slate-950 font-black bg-amber-500 px-1.5 py-0.5 rounded uppercase select-none">
                              Pendente
                            </span>
                            <span className="text-[10px] text-secondary font-black bg-muted px-1.5 py-0.5 rounded border border-border-custom/50 uppercase select-none">
                              {w.pix_key_type}
                            </span>
                          </div>
                          <div className="font-bold text-primary">
                            Usuário: <span className="text-secondary">{w.user_name}</span>
                          </div>
                          <div className="font-bold text-primary">
                            Chave Pix: <span className="text-secondary select-all">{w.pix_key}</span>
                          </div>
                          <div className="text-[10px] text-secondary font-semibold">
                            Solicitado em {formatDate(w.created_at)}
                          </div>
                        </div>

                        <div className="flex gap-2 sm:self-center shrink-0">
                          <button
                            onClick={() => handleRejectWithdrawal(w.id)}
                            disabled={isProcessing}
                            className="h-10 px-3 bg-muted hover:bg-rose-500/10 text-rose-500 hover:text-rose-600 border border-border-custom hover:border-rose-500/20 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center gap-1 disabled:opacity-40"
                          >
                            <X size={12} weight="bold" />
                            Rejeitar
                          </button>
                          <button
                            onClick={() => handleApproveWithdrawal(w.id)}
                            disabled={isProcessing}
                            className="h-10 px-3.5 bg-green-500 hover:bg-green-600 text-slate-950 text-[10px] font-bold uppercase tracking-wider rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1 disabled:opacity-40"
                          >
                            <Check size={12} weight="bold" />
                            Aprovar Pago
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          <div className="bg-card border border-border-custom rounded-2xl p-6 shadow-xl">
            <h2 className="text-sm font-extrabold text-primary mb-3 uppercase tracking-wider">
              Histórico Geral de Saques
            </h2>
            {withdrawals.filter((w) => w.status !== 'pending').length === 0 ? (
              <div className="text-center py-8 text-secondary text-xs font-semibold">
                Nenhum saque processado anteriormente.
              </div>
            ) : (
              <div className="space-y-3">
                {withdrawals
                  .filter((w) => w.status !== 'pending')
                  .map((w) => {
                    const badgeColor =
                      w.status === 'approved'
                        ? 'text-green-500 bg-green-500/10 border-green-500/20'
                        : 'text-red-500 bg-red-500/10 border-red-500/20';

                    const statusLabel = w.status === 'approved' ? 'Aprovado' : 'Rejeitado';

                    return (
                      <div
                        key={w.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg bg-muted/20 border border-border-custom/40 gap-3 text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-primary">
                              {formatCurrency(w.amount)}
                            </span>
                            <span className="text-[9px] text-secondary font-bold">
                              ({w.user_name})
                            </span>
                          </div>
                          <div className="text-[10px] text-secondary">
                            Pix {w.pix_key_type}: {w.pix_key}
                          </div>
                          <div className="text-[9px] text-secondary font-semibold">
                            Solicitado em {formatDate(w.created_at)}
                          </div>
                        </div>

                        <span
                          className={`self-start sm:self-center px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${badgeColor}`}
                        >
                          {statusLabel}
                        </span>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Conteúdo Aba 3: Finalizar Salas */}
      {adminTab === 'rooms' && (
        <div className="bg-card border border-border-custom rounded-2xl p-6 shadow-xl">
          <h2 className="text-base font-extrabold text-primary mb-1 uppercase tracking-wider flex items-center gap-2">
            <Crown size={20} className="text-accent-custom" />
            Encerramento de Bolões (Salas)
          </h2>
          <p className="text-xs text-secondary mb-5 font-medium">
            Salas cujo campeonato ou jogos vinculados já foram 100% finalizados (com resultados
            lançados) podem ter seus prêmios liquidados.
          </p>

          {rooms.length === 0 ? (
            <div className="text-center py-12 text-secondary text-xs font-semibold">
              Nenhuma sala cadastrada no sistema.
            </div>
          ) : (
            <div className="space-y-4">
              {rooms.map((r) => {
                const isFinalizing = finalizingRoomId === r.id;
                const entryFee = Number(r.entry_fee);
                const isFree = entryFee <= 0;

                // Prêmios
                const collectedTotal = r.participants_paid_count * entryFee;
                const winnersTotal = collectedTotal * 0.8;

                return (
                  <div
                    key={r.id}
                    className="p-4 rounded-xl bg-muted/40 border border-border-custom/60 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-xs"
                  >
                    <div className="space-y-2 w-full md:max-w-xl">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-primary text-sm">{r.name}</span>
                        {r.finalized ? (
                          <span className="bg-green-500/10 text-green-500 border border-green-500/20 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider">
                            Encerrado
                          </span>
                        ) : r.is_ready_to_finalize ? (
                          <span className="bg-blue-500/10 text-blue-500 border border-blue-500/20 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider animate-pulse">
                            Pronto para Pagar
                          </span>
                        ) : (
                          <span className="bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider">
                            Jogos em Andamento
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1 border-t border-border-custom/30 text-[10px]">
                        <div>
                          <span className="text-secondary font-bold block">Taxa de Inscrição:</span>
                          <span className="font-extrabold text-primary">
                            {isFree ? 'Grátis' : formatCurrency(entryFee)}
                          </span>
                        </div>
                        <div>
                          <span className="text-secondary font-bold block">Participantes Pagos:</span>
                          <span className="font-extrabold text-primary">
                            {r.participants_paid_count}
                          </span>
                        </div>
                        <div>
                          <span className="text-secondary font-bold block">Organizador/Vendedor:</span>
                          <span className="font-extrabold text-primary">{r.creator_name}</span>
                        </div>
                      </div>

                      {!isFree && !r.finalized && (
                        <div className="bg-base border border-border-custom/50 rounded-lg p-2.5 grid grid-cols-3 gap-2 text-[9px] font-bold">
                          <div>
                            <span className="text-secondary block">Total Arrecadado:</span>
                            <span className="text-primary block font-black text-xs">
                              {formatCurrency(collectedTotal)}
                            </span>
                          </div>
                          <div>
                            <span className="text-secondary block">Taxas Retidas (20%):</span>
                            <span className="text-secondary block">
                              {formatCurrency(collectedTotal * 0.2)}
                            </span>
                          </div>
                          <div>
                            <span className="text-accent-custom block">Prêmio Final (80%):</span>
                            <span className="text-accent-custom block font-black text-xs">
                              {formatCurrency(winnersTotal)}
                            </span>
                          </div>
                        </div>
                      )}

                      {r.finalized && r.finalized_at && (
                        <div className="text-[10px] text-secondary font-medium">
                          Encerrado e prêmios liquidados em {formatDate(r.finalized_at)}
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 self-end md:self-center">
                      {!r.finalized && (
                        <button
                          onClick={() => handleFinalizeRoom(r.id, r.name)}
                          disabled={!r.is_ready_to_finalize || isFinalizing}
                          className={`h-11 px-4 text-xs font-black uppercase tracking-wider rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5 ${
                            r.is_ready_to_finalize
                              ? 'bg-green-500 hover:bg-green-600 text-slate-950'
                              : 'bg-muted text-secondary border border-border-custom/40 opacity-50 cursor-not-allowed'
                          }`}
                        >
                          {isFinalizing ? (
                            <Spinner size={14} className="animate-spin" />
                          ) : (
                            <Crown size={14} weight="fill" />
                          )}
                          Finalizar e Pagar
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
