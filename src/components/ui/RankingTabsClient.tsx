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
  creator_name: string;
  payment_status: string;
  matches_count: number;
  participants_count: number;
  paid_participants_count?: number;
  total_amount_raised?: number;
  finalized: boolean;
  is_winner?: boolean;
}

interface RankingTabsClientProps {
  currentUserId?: string | null;
  totalMatches: number;
  initialRooms: Room[];
  isFinancialRegistered: boolean;
  isSandbox?: boolean;
  layout?: 'main' | 'sidebar';
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
  currentUserId,
  totalMatches,
  initialRooms,
  isFinancialRegistered,
  isSandbox = false,
  layout = 'sidebar',
}: RankingTabsClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'salas' | 'regulamento'>('salas');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [rooms, setRooms] = useState<Room[]>(initialRooms);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  // Sync initialRooms to state when they change
  useEffect(() => {
    setRooms(initialRooms);
  }, [initialRooms]);

  const selectRoom = (roomId: string | null) => {
    setSelectedRoomId(roomId);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (roomId) {
        url.searchParams.set('tab', 'salas');
        url.searchParams.set('roomId', roomId);
      } else {
        url.searchParams.delete('roomId');
      }
      router.push(url.pathname + url.search);
    }
  };
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

  // Sincronização em tempo real do pagamento Pix do usuário
  useEffect(() => {
    if (!showPixModal || !selectedRoomId || !currentUserId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`payment_sync_${selectedRoomId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'room_participants',
          filter: `user_id=eq.${currentUserId}`,
        },
        (payload: any) => {
          if (payload.new && payload.new.room_id === selectedRoomId && payload.new.payment_status === 'paid') {
            setPaymentSuccess(true);
            setIsSimulatingPayment(false);
            setTimeout(() => {
              setShowPixModal(false);
              setPaymentSuccess(false);
              refreshRooms();
            }, 3000);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [showPixModal, selectedRoomId, currentUserId]);

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
      const params = new URLSearchParams(window.location.search);
      const urlRoomId = params.get('roomId');
      
      if (layout === 'main') {
        const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;
        if (urlRoomId) {
          setSelectedRoomId(urlRoomId);
        } else if (isDesktop) {
          setSelectedRoomId(rooms[0].id);
        }
      } else {
        setSelectedRoomId(rooms[0].id);
      }
    }
  }, [rooms, selectedRoomId, layout]);

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
            <div className={layout === 'main' && selectedRoom ? "grid grid-cols-1 md:grid-cols-12 gap-6 items-start" : "space-y-5"}>
              {/* Lista de Salas em formato de Cards menores */}
              <div className={layout === 'main' && selectedRoom ? "hidden md:block md:col-span-4 space-y-3" : "space-y-3"}>
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-black uppercase tracking-wider text-secondary">
                    Minhas Ligas Ativas ({rooms.length})
                  </h4>
                  <Link
                    href="/salas/criar"
                    className="h-9 px-3 bg-accent-custom hover:bg-accent-hover text-slate-950 rounded-xl flex items-center justify-center gap-1.5 transition-all text-[10px] font-black uppercase tracking-wider cursor-pointer"
                  >
                    <Plus size={14} weight="bold" />
                    Criar Sala
                  </Link>
                </div>

                <div className={layout === 'main' && selectedRoom ? "grid grid-cols-1 gap-3" : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"}>
                  {rooms.map((room) => {
                    const isSelected = room.id === selectedRoomId;
                    const totalArrecadado = room.total_amount_raised || 0;
                    
                    // Render do Badge de Status
                    let statusLabel = 'Participando';
                    let statusColor = 'bg-green-500/10 text-green-500 border-green-500/20';
                    
                    if (room.is_winner) {
                      statusLabel = 'Você Ganhou! 🏆';
                      statusColor = 'bg-amber-500/20 text-amber-400 border-amber-500/40 font-extrabold animate-pulse';
                    } else if (room.finalized) {
                      statusLabel = 'Finalizada 🏆';
                      statusColor = 'bg-blue-500/10 text-blue-500 border-blue-500/20';
                    } else if (room.payment_status === 'pending') {
                      statusLabel = 'Pendente ⚠️';
                      statusColor = 'bg-amber-500/10 text-amber-500 border-amber-500/20';
                    } else if (room.payment_status === 'non_participant') {
                      statusLabel = 'Apenas Admin 👑';
                      statusColor = 'bg-purple-500/10 text-purple-500 border-purple-500/20';
                    }

                    return (
                      <div
                        key={room.id}
                        onClick={() => selectRoom(room.id)}
                        className={`p-3.5 border rounded-2xl cursor-pointer transition-all duration-200 flex flex-col justify-between gap-2.5 relative overflow-hidden group hover:translate-y-[-2px] ${
                          isSelected
                            ? room.is_winner
                              ? 'bg-amber-500/10 border-amber-500 shadow-lg shadow-amber-500/20'
                              : 'bg-accent-custom/5 border-accent-custom shadow-md shadow-accent-custom/5'
                            : room.is_winner
                              ? 'bg-amber-500/5 border-amber-500/30 hover:border-amber-500/60 shadow shadow-amber-500/5'
                              : 'bg-card border-border-custom hover:border-border-custom-hover hover:bg-muted/10'
                        }`}
                      >
                        {/* Background light glow effect on hover/selected */}
                        <div className={`absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl pointer-events-none transition-all duration-300 ${
                          room.is_winner
                            ? 'bg-amber-500/15'
                            : isSelected ? 'bg-accent-custom/10' : 'bg-transparent group-hover:bg-primary/5'
                        }`} />

                        {/* Top Line: Name and Status Badge */}
                        <div className="flex justify-between items-start gap-2 min-w-0">
                          <h5 className={`text-[11px] font-black uppercase tracking-wider truncate min-w-0 transition-colors ${
                            room.is_winner
                              ? 'text-amber-400 group-hover:text-amber-300'
                              : 'text-primary group-hover:text-accent-custom'
                          }`}>
                            {room.name}
                          </h5>
                          <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md border shrink-0 select-none ${statusColor}`}>
                            {statusLabel}
                          </span>
                        </div>

                        {/* Middle info */}
                        <div className="text-[10px] space-y-1 text-secondary font-bold">
                          <div className="flex items-center gap-1">
                            <span className="text-[9px] uppercase tracking-wider text-secondary/60">Dono:</span>
                            <span className="text-primary truncate max-w-[120px]">{room.creator_name}</span>
                          </div>
                          {room.entry_fee > 0 ? (
                            <div className={`flex items-center gap-1 ${room.is_winner ? 'text-amber-400' : 'text-accent-custom'}`}>
                              <span>Acumulado:</span>
                              <span className="font-extrabold text-primary">R$ {totalArrecadado.toFixed(2)}</span>
                            </div>
                          ) : (
                            <div className="text-green-500">
                              Bolão Gratuito
                            </div>
                          )}
                        </div>

                        {/* Bottom Info: Members and Matches count */}
                        <div className="flex items-center justify-between border-t border-border-custom/30 pt-2 text-[9px] text-secondary font-bold">
                          <span className="flex items-center gap-1">
                            <Users size={12} />
                            {room.participants_count} {room.participants_count === 1 ? 'membro' : 'membros'}
                          </span>
                          <span>
                            {room.matches_count} {room.matches_count === 1 ? 'jogo' : 'jogos'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {selectedRoom && (
                <div className={layout === 'main' && selectedRoom ? "md:col-span-8 space-y-5" : "space-y-5"}>
                  {layout === 'main' && (
                    <button
                      onClick={() => selectRoom(null)}
                      className="md:hidden w-full mb-4 h-10 flex items-center justify-center gap-1.5 border border-border-custom hover:bg-muted text-primary text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                    >
                      &larr; Voltar para todas as salas
                    </button>
                  )}
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
                              <span><strong>Pontuação:</strong> Placar Exato = 3 pts; Vencedor + Saldo = 2 pts; Vencedor/Empate não-exato = 1 pt.</span>
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
                              <span>A premiação é creditada no <strong>dia seguinte</strong> e os resultados são atualizados diariamente às <strong>7h da manhã</strong>.</span>
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
                          isRoomFinalized={selectedRoom.finalized}
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
                🎯 Critérios de Pontuação
              </span>
              <p className="text-[11px] text-secondary leading-relaxed font-semibold">
                Seus palpites acumulam pontos das seguintes formas:
                <br />• <strong>3 pontos:</strong> Acerto do placar exato da partida.
                <br />• <strong>2 pontos:</strong> Acerto do vencedor e saldo de gols (exceto empate).
                <br />• <strong>1 ponto:</strong> Acerto apenas do vencedor ou do empate não-exato.
                <br />• <strong>0 pontos:</strong> Erro total do resultado.
              </p>
            </div>

            <div className="p-3 bg-muted/20 border border-border-custom/40 rounded-xl space-y-1">
              <span className="text-accent-custom font-extrabold text-[10px] uppercase tracking-wider block">
                💰 Divisão da Premiação e Comissões
              </span>
              <p className="text-[11px] text-secondary leading-relaxed font-semibold">
                O prêmio de 80% do arrecadado é dividido igualmente entre todos na 1ª posição do ranking (com pontos &gt; 0). 
                <br />• <strong>Criador Jogando:</strong> Paga a taxa de entrada. Premiação = 80%; Plataforma = 20%.
                <br />• <strong>Criador Não Jogando:</strong> Não paga entrada. Recebe 10% de comissão das inscrições; Plataforma = 10%; Ganhadores = 80%.
              </p>
            </div>

            <div className="p-3 bg-muted/20 border border-border-custom/40 rounded-xl space-y-1">
              <span className="text-accent-custom font-extrabold text-[10px] uppercase tracking-wider block">
                👑 Acúmulo para o Criador da Sala (Caso sem Ganhador)
              </span>
              <p className="text-[11px] text-secondary leading-relaxed font-semibold">
                Se nenhum participante conseguir pontuar ao final do bolão, o prêmio acumulado de 80% será revertido integralmente para o criador/dono da sala, e 20% fica retido pela plataforma.
              </p>
            </div>

            <div className="p-3 bg-muted/20 border border-border-custom/40 rounded-xl space-y-1">
              <span className="text-accent-custom font-extrabold text-[10px] uppercase tracking-wider block">
                ⏰ Sincronização & Pagamento do Prêmio
              </span>
              <p className="text-[11px] text-secondary leading-relaxed font-semibold">
                • Os resultados dos jogos no aplicativo são atualizados diariamente sempre às <strong>7h da manhã</strong>.
                <br />• A premiação das salas será creditada no saldo da carteira do(s) vencedor(es) no <strong>dia seguinte</strong> ao encerramento oficial de todas as partidas da sala.
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

            {paymentSuccess ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-5 text-center animate-scaleUp select-none">
                <div className="w-20 h-20 bg-green-500/10 text-green-500 border-2 border-green-500/30 rounded-full flex items-center justify-center text-4xl shadow-lg shadow-green-500/10 animate-bounce">
                  <CheckCircle size={44} weight="fill" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-black text-green-500 uppercase tracking-wider">
                    Pagamento Confirmado!
                  </h3>
                  <p className="text-[11px] text-secondary font-semibold max-w-[260px] mx-auto leading-relaxed">
                    Sua inscrição na sala <strong className="text-primary">{selectedRoom.name}</strong> foi confirmada com sucesso!
                  </p>
                  <p className="text-[10px] text-secondary/70 font-semibold pt-1">
                    Seus palpites agora estão valendo pontos no ranking.
                  </p>
                </div>
              </div>
            ) : (
              <>
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
                    disabled={isLoadingPix || !!pixError || isSimulatingPayment}
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

                   {!isSimulatingPayment && isSandbox && (
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
              </>
            )}
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
