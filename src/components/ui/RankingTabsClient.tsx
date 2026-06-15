'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { RankingEntry, Match, Prediction } from '@/types';
import { getRoomRanking, confirmRoomPayment, getUserRooms, generatePixCharge, getRoomMatches } from '@/app/actions';
import { Trophy, Users, Plus, Clipboard, Check, CheckCircle, Spinner, QrCode, Coins, ArrowSquareIn, Warning, Info, Bank } from '@phosphor-icons/react';
import RankingTable from './RankingTable';
import MatchCard from './MatchCard';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import FinancialRegistrationModal from './FinancialRegistrationModal';
import { useRouter } from 'next/navigation';

interface Room {
  id: string;
  name: string;
  entry_fee: number;
  created_by: string;
  payment_status: string;
  matches_count: number;
  participants_count: number;
}

interface RankingTabsClientProps {
  globalRanking: RankingEntry[];
  currentUserId?: string | null;
  totalMatches: number;
  initialRooms: Room[];
  isFinancialRegistered: boolean;
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {}
  }
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    return false;
  }
}

export default function RankingTabsClient({
  globalRanking,
  currentUserId,
  totalMatches,
  initialRooms,
  isFinancialRegistered,
}: RankingTabsClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'geral' | 'salas' | 'regulamento'>('geral');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [rooms, setRooms] = useState<Room[]>(initialRooms);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [roomRanking, setRoomRanking] = useState<RankingEntry[]>([]);
  const [isLoadingRanking, setIsLoadingRanking] = useState(false);
  const [showPixModal, setShowPixModal] = useState(false);
  const [isFinancialModalOpen, setIsFinancialModalOpen] = useState(false);
  
  // Pix states
  const [pixCopied, setPixCopied] = useState(false);
  const [isSimulatingPayment, setIsSimulatingPayment] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [isLoadingPix, setIsLoadingPix] = useState(false);
  const [pixError, setPixError] = useState<string | null>(null);
  const [pixQrCode, setPixQrCode] = useState('');
  const [pixCopiaECola, setPixCopiaECola] = useState('');

  // Estados de Palpites/Jogos da Sala
  const [roomMatches, setRoomMatches] = useState<Match[]>([]);
  const [roomPredictionsMap, setRoomPredictionsMap] = useState<Map<string, Prediction>>(new Map());
  const [isLoadingMatches, setIsLoadingMatches] = useState(false);

  // Read URL query parameters to auto-select tab and room
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    const roomId = params.get('roomId');
    if (tab === 'salas') {
      setActiveTab('salas');
      if (roomId) {
        setSelectedRoomId(roomId);
      }
    }
  }, []);

  // Sync selected room ranking and matches
  useEffect(() => {
    if (!selectedRoomId || activeTab !== 'salas') return;

    const fetchRankingAndMatches = async () => {
      setIsLoadingRanking(true);
      const res = await getRoomRanking(selectedRoomId);
      if (res.success && res.ranking) {
        setRoomRanking(res.ranking);
      } else {
        setRoomRanking([]);
      }
      setIsLoadingRanking(false);

      // Carregar partidas caso o participante esteja pendente de pagamento
      const currentRoom = rooms.find((r) => r.id === selectedRoomId);
      if (currentRoom && currentRoom.payment_status === 'pending') {
        setIsLoadingMatches(true);
        const resMatches = await getRoomMatches(selectedRoomId);
        if (resMatches.success) {
          setRoomMatches(resMatches.matches || []);
          const pMap = new Map<string, Prediction>();
          (resMatches.predictions || []).forEach((p: Prediction) => {
            pMap.set(p.match_id, p);
          });
          setRoomPredictionsMap(pMap);
        } else {
          setRoomMatches([]);
          setRoomPredictionsMap(new Map());
        }
        setIsLoadingMatches(false);
      }
    };

    fetchRankingAndMatches();
  }, [selectedRoomId, activeTab, rooms]);

  // Sincronização em tempo real de palpites inseridos/alterados
  useEffect(() => {
    if (!selectedRoomId || !currentUserId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`predictions_sync_${selectedRoomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'predictions',
          filter: `user_id=eq.${currentUserId}`,
        },
        async () => {
          const resMatches = await getRoomMatches(selectedRoomId);
          if (resMatches.success) {
            const pMap = new Map<string, Prediction>();
            (resMatches.predictions || []).forEach((p: Prediction) => {
              pMap.set(p.match_id, p);
            });
            setRoomPredictionsMap(pMap);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedRoomId, currentUserId]);

  // Refresh user rooms list
  const refreshRooms = async () => {
    const res = await getUserRooms();
    if (res.success && res.rooms) {
      setRooms(res.rooms as Room[]);
    }
  };

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) || rooms[0] || null;

  // Auto-select first room if none selected
  useEffect(() => {
    if (rooms.length > 0 && !selectedRoomId) {
      setSelectedRoomId(rooms[0].id);
    }
  }, [rooms, selectedRoomId]);

  // Subscribe to real-time payment status changes via Supabase Realtime
  useEffect(() => {
    if (!selectedRoomId || !currentUserId) return;
    
    const supabase = createClient();
    const channel = supabase
      .channel(`room_participants_${selectedRoomId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'room_participants',
          filter: `room_id=eq.${selectedRoomId}`,
        },
        (payload) => {
          if (payload.new.user_id === currentUserId && payload.new.payment_status === 'paid') {
            setPaymentSuccess(true);
            setTimeout(() => {
              setShowPixModal(false);
              setPaymentSuccess(false);
              refreshRooms();
            }, 1500);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedRoomId, currentUserId]);

  const handleCopyLink = async (roomId: string) => {
    const inviteLink = `${window.location.protocol}//${window.location.host}/salas/join/${roomId}`;
    await copyTextToClipboard(inviteLink);
    alert('Link de convite copiado para a área de transferência!');
  };

  const handleOpenPixModal = async () => {
    if (!selectedRoom) return;
    setShowPixModal(true);
    setIsLoadingPix(true);
    setPixError(null);
    setPixQrCode('');
    setPixCopiaECola('');

    const res = await generatePixCharge(selectedRoom.id);
    if (res.success) {
      if (res.paymentStatus === 'paid') {
        setPaymentSuccess(true);
        setTimeout(() => {
          setShowPixModal(false);
          setPaymentSuccess(false);
          refreshRooms();
        }, 1500);
      } else {
        setPixQrCode(res.qrCode || '');
        setPixCopiaECola(res.copiaECola || '');
      }
    } else {
      setPixError(res.error || 'Erro ao gerar Pix.');
    }
    setIsLoadingPix(false);
  };

  const handleCopyPix = async () => {
    if (!pixCopiaECola) return;
    await copyTextToClipboard(pixCopiaECola);
    setPixCopied(true);
    setTimeout(() => setPixCopied(false), 2000);
  };

  const handleManualConfirm = async () => {
    if (!selectedRoom) return;
    setIsSimulatingPayment(true);
    const res = await confirmRoomPayment(selectedRoom.id);
    if (res.success) {
      setPaymentSuccess(true);
      setIsSimulatingPayment(false);
      setTimeout(() => {
        setShowPixModal(false);
        setPaymentSuccess(false);
        refreshRooms();
      }, 1500);
    }
  };

  return (
    <div className="space-y-6">
      {/* Abas Superiores */}
      <div className="flex border border-border-custom/50 bg-muted/40 p-1 rounded-2xl gap-1">
        <button
          onClick={() => setActiveTab('geral')}
          className={`flex-grow py-3 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer ${
            activeTab === 'geral' ? 'bg-accent-custom text-slate-950 shadow-md' : 'text-secondary hover:text-primary'
          }`}
        >
          <Trophy size={14} />
          Geral
        </button>
        <button
          onClick={() => setActiveTab('salas')}
          className={`flex-grow py-3 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer ${
            activeTab === 'salas' ? 'bg-accent-custom text-slate-950 shadow-md' : 'text-secondary hover:text-primary'
          }`}
        >
          <Users size={14} />
          Minhas Salas
        </button>
        <button
          onClick={() => setActiveTab('regulamento')}
          className={`flex-grow py-3 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer ${
            activeTab === 'regulamento' ? 'bg-accent-custom text-slate-950 shadow-md' : 'text-secondary hover:text-primary'
          }`}
        >
          <Info size={14} />
          Regulamento
        </button>
      </div>

      {/* Conteúdo Geral */}
      {activeTab === 'geral' && (
        <RankingTable ranking={globalRanking} currentUserId={currentUserId} totalMatches={totalMatches} />
      )}

      {/* Conteúdo de Salas */}
      {activeTab === 'salas' && (
        <div className="space-y-5">
          {!currentUserId ? (
            /* Não Autenticado */
            <div className="bg-card border border-border-custom rounded-2xl p-8 text-center space-y-4 shadow-xl">
              <div className="flex justify-center text-accent-custom">
                <Warning size={48} />
              </div>
              <h4 className="text-sm font-black uppercase tracking-wider">Acesso Restrito</h4>
              <p className="text-xs text-secondary leading-relaxed font-semibold">
                Você precisa estar logado para visualizar suas salas privadas ou criar novos grupos de apostas.
              </p>
              <div className="pt-2">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center min-h-[44px] px-6 bg-accent-custom hover:bg-accent-hover text-slate-950 text-xs font-extrabold uppercase tracking-wider rounded-xl shadow transition-all"
                >
                  Fazer Login / Cadastrar
                </Link>
              </div>
            </div>
          ) : rooms.length === 0 ? (
            /* Sem Salas */
            <div className="bg-card border border-border-custom rounded-2xl p-8 text-center space-y-4 shadow-xl">
              <div className="flex justify-center text-accent-custom">
                <Users size={48} />
              </div>
              <h4 className="text-sm font-black uppercase tracking-wider">Nenhuma Sala Encontrada</h4>
              <p className="text-xs text-secondary leading-relaxed font-semibold">
                Você ainda não faz parte de nenhuma sala privada nesta Copa. Crie uma agora e convide seus amigos!
              </p>
              <div className="pt-2">
                <Link
                  href="/salas/criar"
                  className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-6 bg-accent-custom hover:bg-accent-hover text-slate-950 text-xs font-extrabold uppercase tracking-wider rounded-xl shadow transition-all"
                >
                  <Plus size={14} weight="bold" />
                  Criar Nova Sala
                </Link>
              </div>
            </div>
          ) : (
            /* Com Salas */
            <div className="space-y-5">
              {/* Seletor de Sala e Botão de Criar */}
              <div className="flex gap-2">
                <select
                  value={selectedRoomId || ''}
                  onChange={(e) => setSelectedRoomId(e.target.value)}
                  className="flex-grow h-11 px-3 bg-card border border-border-custom text-primary text-xs font-bold rounded-xl focus:outline-none focus:border-accent-custom transition-all"
                >
                  {rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name} {room.entry_fee > 0 ? `(R$ ${room.entry_fee.toFixed(2)})` : '(Grátis)'}
                    </option>
                  ))}
                </select>
                <Link
                  href="/salas/criar"
                  className="h-11 px-3.5 bg-card hover:bg-muted/40 border border-border-custom text-accent-custom rounded-xl flex items-center justify-center transition-all shrink-0 cursor-pointer"
                  title="Criar Nova Sala"
                >
                  <Plus size={18} weight="bold" />
                </Link>
              </div>

              {selectedRoom && (
                <div className="space-y-5">
                  {/* Card de Informações da Sala */}
                  <div className="bg-card border border-border-custom rounded-2xl p-4.5 space-y-4.5 shadow-lg relative overflow-hidden">
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <h4 className="text-sm font-black text-primary uppercase tracking-wider truncate max-w-[200px] sm:max-w-xs">
                          {selectedRoom.name}
                        </h4>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-[10px] bg-muted text-secondary border border-border-custom/50 px-2 py-0.5 rounded-full font-bold select-none">
                            {selectedRoom.participants_count} {selectedRoom.participants_count === 1 ? 'membro' : 'membros'}
                          </span>
                          <span className="text-[10px] bg-muted text-secondary border border-border-custom/50 px-2 py-0.5 rounded-full font-bold select-none">
                            {selectedRoom.matches_count} {selectedRoom.matches_count === 1 ? 'jogo' : 'jogos'}
                          </span>
                        </div>
                      </div>
                      <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border shrink-0 select-none ${
                        selectedRoom.entry_fee > 0
                          ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                          : 'bg-green-500/10 text-green-500 border-green-500/20'
                      }`}>
                        {selectedRoom.entry_fee > 0 ? `Taxa: R$ ${selectedRoom.entry_fee.toFixed(2)}` : 'Grátis'}
                      </span>
                    </div>

                    {/* Caixa de Compartilhamento */}
                    <div className="space-y-2 border-t border-border-custom/40 pt-3.5">
                      <label className="text-[9px] font-black uppercase tracking-widest text-secondary block">
                        Convidar Participantes
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          readOnly
                          value={`${window.location.protocol}//${window.location.host}/salas/join/${selectedRoom.id}`}
                          className="flex-grow h-9 px-3 bg-base border border-border-custom text-secondary text-[10px] font-medium rounded-lg focus:outline-none select-all"
                        />
                        <button
                          onClick={() => handleCopyLink(selectedRoom.id)}
                          className="h-9 px-3 bg-accent-custom hover:bg-accent-hover text-slate-950 font-black text-[10px] uppercase tracking-wider rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Clipboard size={14} />
                          Copiar
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Fluxo de Pagamento Pix Pendente com Palpites Prévios */}
                  {selectedRoom.payment_status === 'pending' ? (
                    !isFinancialRegistered ? (
                      <div className="bg-card border border-border-custom rounded-2xl p-6 text-center shadow-lg space-y-5 animate-fadeIn select-none">
                        <div className="w-14 h-14 bg-accent-custom/10 text-accent-custom border border-accent-custom/20 rounded-full flex items-center justify-center text-2xl mx-auto shadow-inner">
                          <Bank size={28} />
                        </div>
                        <div className="max-w-md mx-auto space-y-1.5">
                          <h5 className="text-xs font-black uppercase tracking-wider text-primary">
                            Cadastro de Recebimento Requerido
                          </h5>
                          <p className="text-[11px] text-secondary leading-relaxed font-semibold text-center">
                            Para poder realizar seus palpites nesta sala e prosseguir com a taxa de inscrição via Pix, conclua seu cadastro de pagamento para garantir o recebimento de prêmios.
                          </p>
                        </div>
                        <div>
                          <button
                            type="button"
                            onClick={() => setIsFinancialModalOpen(true)}
                            className="min-h-[38px] px-5 bg-accent-custom hover:bg-accent-hover text-slate-950 text-[10px] font-black uppercase tracking-wider rounded-xl shadow-md transition-all inline-flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            Concluir Cadastro de Recebimento
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-6 animate-fadeIn">
                      {/* Banner Informativo */}
                      <div className="bg-card border-2 border-dashed border-amber-500/30 rounded-2xl p-5 space-y-3.5 shadow-lg relative overflow-hidden animate-fadeIn">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
                        
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-amber-500/10 text-amber-500 rounded-xl border border-amber-500/20 shrink-0">
                            <Coins size={22} />
                          </div>
                          <div className="space-y-1">
                            <h5 className="text-xs font-black uppercase tracking-wider text-amber-500">
                              Passo 1: Dê seus palpites abaixo
                            </h5>
                            <p className="text-[11px] text-secondary leading-relaxed font-semibold">
                              Você entrou nesta sala! Insira seus palpites para os jogos da sala listados abaixo. Seus pontos só começarão a ser contabilizados no ranking após a confirmação e pagamento da taxa de <span className="text-primary font-bold">R$ {selectedRoom.entry_fee.toFixed(2)}</span>.
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Lista de Jogos da Sala */}
                      <div className="space-y-4">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-secondary border-l-2 border-l-amber-500 pl-2 select-none">
                          Jogos da Sala Privada
                        </h4>
                        
                        {isLoadingMatches ? (
                          <div className="py-12 flex items-center justify-center gap-2 text-xs text-secondary font-bold">
                            <Spinner size={18} className="animate-spin text-amber-500" />
                            Carregando confrontos...
                          </div>
                        ) : roomMatches.length === 0 ? (
                          <div className="text-center py-8 text-xs text-secondary font-bold bg-muted/20 border border-border-custom/50 rounded-2xl">
                            Nenhum jogo cadastrado nesta sala.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 gap-4">
                            {roomMatches.map((match, idx) => (
                              <MatchCard
                                key={match.id}
                                match={match}
                                prediction={roomPredictionsMap.get(match.id)}
                                isAuthenticated={true}
                                matchNumber={idx + 1}
                              />
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Caixa de Checkout do Pix */}
                      <div className="bg-card border border-border-custom rounded-2xl p-5 space-y-5 shadow-xl text-center relative overflow-hidden">
                        <h5 className="text-xs font-black uppercase tracking-wider text-primary">Passo 2: Confirmar & Pagar</h5>
                        
                        {/* Regulamento/Como Funciona compacto */}
                        <div className="text-left space-y-3.5 bg-muted/30 border border-border-custom/50 rounded-xl p-3.5 select-none text-xs">
                          <span className="text-[9px] font-black uppercase tracking-widest text-secondary block border-b border-border-custom/30 pb-1.5 flex items-center gap-1">
                            <Info size={12} className="text-accent-custom" />
                            Regulamento Rápido da Sala
                          </span>
                          <ul className="space-y-2 text-[10px] font-semibold text-secondary leading-normal">
                            <li className="flex items-start gap-1.5">
                              <span className="text-accent-custom shrink-0">•</span>
                              <span>Apenas acertos de <strong>placar exato</strong> somam pontos (3 pts). Outros resultados valem 0.</span>
                            </li>
                            <li className="flex items-start gap-1.5">
                              <span className="text-accent-custom shrink-0">•</span>
                              <span><strong>80% do valor total arrecadado</strong> vai para o(s) primeiro(s) colocado(s) da sala.</span>
                            </li>
                            <li className="flex items-start gap-1.5">
                              <span className="text-accent-custom shrink-0">•</span>
                              <span>Se ninguém pontuar, a premiação vai para o <strong>dono/criador do bolão</strong>.</span>
                            </li>
                            <li className="flex items-start gap-1.5">
                              <span className="text-accent-custom shrink-0">•</span>
                              <span>Palpites se encerram pontualmente no horário de início de cada partida.</span>
                            </li>
                          </ul>
                        </div>

                        {/* Checkbox de Aceitação */}
                        <label className="flex items-start gap-2.5 text-[10px] text-secondary font-medium cursor-pointer select-none text-left py-1 hover:text-primary transition-colors">
                          <input
                            type="checkbox"
                            checked={termsAccepted}
                            onChange={(e) => setTermsAccepted(e.target.checked)}
                            className="mt-0.5 shrink-0 rounded border-border-custom bg-base text-accent-custom focus:ring-accent-custom w-4 h-4 cursor-pointer"
                          />
                          <span>
                            Declaro que li e concordo com o regulamento acima, aceitando os termos de participação, pontuação e premiação desta sala.
                          </span>
                        </label>

                        <button
                          onClick={handleOpenPixModal}
                          disabled={!termsAccepted}
                          className="w-full h-12 flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <QrCode size={18} />
                          Confirmar Palpites e Pagar Pix (R$ {selectedRoom.entry_fee.toFixed(2)})
                        </button>
                      </div>
                    </div>
                  )
                ) : (
                    /* Ranking da Sala */
                    <div className="space-y-4 animate-fadeIn">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-secondary border-l-2 border-l-accent-custom pl-2 select-none">
                        Classificação da Sala
                      </h4>
                      {isLoadingRanking ? (
                        <div className="py-12 flex items-center justify-center gap-2 text-xs text-secondary font-bold">
                          <Spinner size={18} className="animate-spin text-accent-custom" />
                          Buscando pontuações...
                        </div>
                      ) : (
                        <RankingTable
                          ranking={roomRanking}
                          currentUserId={currentUserId}
                          totalMatches={selectedRoom.matches_count}
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Conteúdo do Regulamento */}
      {activeTab === 'regulamento' && (
        <div className="bg-card border border-border-custom rounded-2xl p-5 sm:p-6 space-y-6 shadow-xl text-primary animate-fadeIn">
          <h3 className="text-sm font-extrabold uppercase tracking-wider flex items-center gap-2 border-b border-border-custom/40 pb-3">
            <Info size={20} className="text-accent-custom" />
            Regulamento Geral & Como Funciona
          </h3>

          <div className="space-y-4">
            <div className="p-3 bg-muted/20 border border-border-custom/40 rounded-xl space-y-1">
              <span className="text-accent-custom font-extrabold text-[10px] uppercase tracking-wider block">
                🎯 Critério de Pontuação Exclusivo
              </span>
              <p className="text-[11px] text-secondary leading-relaxed font-semibold">
                Nas salas privadas, você só ganha pontos ao acertar o **placar exato** da partida (concede 3 pontos). Acertos parciais (vencedor com saldo errado ou empate não exato) valem **0 pontos**.
              </p>
            </div>

            <div className="p-3 bg-muted/20 border border-border-custom/40 rounded-xl space-y-1">
              <span className="text-accent-custom font-extrabold text-[10px] uppercase tracking-wider block">
                💰 Divisão da Premiação (80%)
              </span>
              <p className="text-[11px] text-secondary leading-relaxed font-semibold">
                80% de todo o valor arrecadado na sala via Pix é destinado para a premiação dos ganhadores da sala (dividido igualmente em caso de empate no 1º lugar, desde que tenham pontos). Os 20% restantes cobrem taxas administrativas da plataforma.
              </p>
            </div>

            <div className="p-3 bg-muted/20 border border-border-custom/40 rounded-xl space-y-1">
              <span className="text-accent-custom font-extrabold text-[10px] uppercase tracking-wider block">
                👑 Acúmulo para o Criador da Sala
              </span>
              <p className="text-[11px] text-secondary leading-relaxed font-semibold">
                Caso nenhum participante da sala consiga acertar nenhum placar exato, o valor da premiação acumulada (80%) será integralmente transferido para o criador/dono da sala.
              </p>
            </div>

            <div className="p-3 bg-muted/20 border border-border-custom/40 rounded-xl space-y-1">
              <span className="text-accent-custom font-extrabold text-[10px] uppercase tracking-wider block">
                ⏰ Bloqueio de Palpites
              </span>
              <p className="text-[11px] text-secondary leading-relaxed font-semibold">
                Os palpites de cada jogo podem ser criados ou editados livremente até o horário do apito inicial da respectiva partida. Após o início, o jogo é bloqueado para palpites.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Modal Pix Premium */}
      {showPixModal && selectedRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm bg-card border border-border-custom rounded-2xl p-6 shadow-2xl relative overflow-hidden transition-all duration-300">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-accent-custom/5 rounded-full blur-3xl pointer-events-none" />

            <div className="text-center mb-5">
              <h3 className="text-base font-black text-primary uppercase tracking-wider flex items-center justify-center gap-2">
                <QrCode size={20} className="text-accent-custom" />
                Pagamento via Pix
              </h3>
              <p className="text-[11px] text-secondary mt-1 font-bold uppercase tracking-wider">
                Inscrição: {selectedRoom.name}
              </p>
            </div>

            {/* Valor */}
            <div className="bg-base border border-border-custom/50 rounded-xl p-3.5 text-center mb-5 select-none">
              <span className="text-[10px] font-black text-secondary uppercase tracking-widest block">Valor Cobrado</span>
              <span className="text-2xl font-black text-accent-custom tracking-wider block mt-1">
                R$ {selectedRoom.entry_fee.toFixed(2)}
              </span>
            </div>

            {/* QR Code Real/Carregamento */}
            <div className="flex flex-col items-center justify-center bg-white border border-slate-200 p-4 rounded-xl mb-5 mx-auto w-48 h-48 select-none relative">
              {isLoadingPix ? (
                <div className="flex flex-col items-center gap-2 text-slate-900">
                  <Spinner size={32} className="animate-spin text-accent-custom" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Gerando Pix...</span>
                </div>
              ) : pixError ? (
                <div className="text-red-500 text-center text-[10px] font-bold p-2">
                  {pixError}
                </div>
              ) : pixQrCode ? (
                <img
                  src={`data:image/png;base64,${pixQrCode}`}
                  alt="QR Code Pix"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-slate-400 text-center text-[10px] font-bold">
                  Nenhum QR Code gerado.
                </div>
              )}
            </div>

            {/* Instruções */}
            <div className="space-y-4">
              <button
                onClick={handleCopyPix}
                disabled={isLoadingPix || !!pixError || isSimulatingPayment || paymentSuccess}
                className="w-full h-11 flex items-center justify-center gap-2 bg-accent-custom hover:bg-accent-hover text-slate-950 text-xs font-extrabold uppercase tracking-wider rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                {pixCopied ? (
                  <>
                    <Check size={16} weight="bold" />
                    Chave Copiada!
                  </>
                ) : (
                  <>
                    <Clipboard size={16} />
                    Copiar Pix Copia e Cola
                  </>
                )}
              </button>

              {/* Status de Simulação */}
              {isSimulatingPayment && (
                <div className="flex items-center justify-center gap-2.5 text-xs text-amber-500 font-extrabold text-center py-2 select-none animate-pulse">
                  <Spinner size={16} className="animate-spin shrink-0" />
                  Aguardando confirmação do Pix...
                </div>
              )}

              {paymentSuccess && (
                <div className="flex items-center justify-center gap-2 text-xs text-green-500 font-extrabold text-center py-2 select-none">
                  <CheckCircle size={18} weight="fill" className="shrink-0" />
                  Pagamento Confirmado com Sucesso!
                </div>
              )}

              {!isSimulatingPayment && !paymentSuccess && (
                <div className="space-y-2 border-t border-border-custom/45 pt-3.5">
                  <div className="flex items-center gap-1.5 text-amber-500 text-[9px] font-black uppercase tracking-wider">
                    <Warning size={12} />
                    Ambiente de Teste (Sandbox)
                  </div>
                  <p className="text-[10px] text-secondary leading-relaxed font-medium">
                    Como estamos no ambiente de homologação do Asaas, este QR Code é fictício e <strong>não funcionará em aplicativos de bancos reais</strong>. 
                    Clique no botão abaixo para simular o pagamento e confirmar instantaneamente!
                  </p>
                  <button
                    onClick={handleManualConfirm}
                    className="w-full h-9 flex items-center justify-center bg-muted hover:bg-muted/80 text-primary text-[10px] font-black uppercase tracking-wider rounded-lg border border-border-custom/60 transition-colors cursor-pointer"
                  >
                    Simular Confirmação Instantânea
                  </button>
                </div>
              )}

              <button
                onClick={() => setShowPixModal(false)}
                disabled={isSimulatingPayment}
                className="w-full h-9 flex items-center justify-center text-secondary hover:text-primary text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer"
              >
                Cancelar e Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      <FinancialRegistrationModal
        isOpen={isFinancialModalOpen}
        onClose={() => setIsFinancialModalOpen(false)}
        onSuccess={() => {
          router.refresh();
        }}
      />
    </div>
  );
}
