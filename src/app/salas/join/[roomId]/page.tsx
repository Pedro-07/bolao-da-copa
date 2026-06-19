'use client';
 
import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { joinRoom, getRoomInviteDetails } from '@/app/actions';
import { Spinner, Warning, Trophy, Users, Coins, ArrowRight, SignIn, Plus, Info } from '@phosphor-icons/react';
import MatchCard from '@/components/ui/MatchCard';
import Link from 'next/link';
 
interface InviteRoom {
  id: string;
  name: string;
  entry_fee: number;
  creator_name: string;
}
 
export default function JoinRoomPage() {
  const router = useRouter();
  const { roomId } = useParams() as { roomId: string };
  const [loading, setLoading] = useState(true);
  const [room, setRoom] = useState<InviteRoom | null>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
 
  const supabase = createClient();
 
  useEffect(() => {
    if (!roomId) return;
 
    const fetchInviteData = async () => {
      try {
        // Obter usuário logado
        const { data: { user } } = await supabase.auth.getUser();
        setUser(user);
 
        // Obter dados do bolão e partidas
        const result = await getRoomInviteDetails(roomId);
        if (!result.success || !result.room) {
          setErrorMsg(result.error || 'Erro ao carregar dados do convite.');
        } else {
          setRoom(result.room);
          setMatches(result.matches || []);
        }
      } catch (err: any) {
        setErrorMsg(err.message || 'Erro inesperado ao buscar dados do convite.');
      } finally {
        setLoading(false);
      }
    };
 
    fetchInviteData();
  }, [roomId, supabase]);
 
  const handleJoin = async () => {
    if (!roomId || !termsAccepted) return;
    
    if (!user) {
      // Salvar ID no localStorage para fluxo de login/redirect posterior
      localStorage.setItem('pending_room_id', roomId);
      router.push(`/login?redirect=join`);
      return;
    }
 
    setIsJoining(true);
    try {
      const result = await joinRoom(roomId);
      if (!result.success) {
        setErrorMsg(result.error || 'Erro ao entrar na sala.');
        setIsJoining(false);
      } else {
        router.push(`/?tab=salas&roomId=${roomId}`);
        router.refresh();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao processar sua entrada.');
      setIsJoining(false);
    }
  };
 
  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 bg-base text-primary">
        <div className="w-full max-w-md bg-card border border-border-custom rounded-2xl p-8 text-center space-y-4 shadow-2xl">
          <div className="flex justify-center text-accent-custom animate-spin">
            <Spinner size={48} weight="bold" />
          </div>
          <h3 className="text-lg font-black uppercase tracking-wider">Carregando convite...</h3>
          <p className="text-xs text-secondary font-bold">Buscando informações do bolão.</p>
        </div>
      </div>
    );
  }
 
  if (errorMsg) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 bg-base text-primary">
        <div className="w-full max-w-md bg-card border border-border-custom rounded-2xl p-8 text-center space-y-4 shadow-2xl">
          <div className="flex justify-center text-red-500">
            <Warning size={48} />
          </div>
          <h2 className="text-xl font-bold uppercase tracking-wider text-red-500">Falha ao Acessar</h2>
          <p className="text-xs text-secondary leading-relaxed font-semibold">{errorMsg}</p>
          <button
            onClick={() => router.push('/')}
            className="w-full h-11 flex items-center justify-center bg-muted text-primary text-xs font-bold uppercase tracking-wider rounded-xl border border-border-custom hover:bg-muted/80 transition-all cursor-pointer"
          >
            Ir para Início
          </button>
        </div>
      </div>
    );
  }
 
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-base text-primary py-10 px-4 sm:px-6 lg:px-8 relative">
      {/* Botão Criar Sala no Canto Superior Direito */}
      <div className="absolute top-4 right-4 sm:top-8 sm:right-8 z-10">
        <Link
          href="/salas/criar"
          className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-accent-custom hover:bg-accent-hover text-slate-950 text-xs font-black uppercase tracking-wider rounded-xl shadow-md transition-all duration-200 cursor-pointer"
        >
          <Plus size={14} weight="bold" />
          Criar Sala
        </Link>
      </div>
 
      {room && (
        <div className="max-w-4xl mx-auto mt-8 sm:mt-12 space-y-12">
          {/* CTA e Instrução Superior */}
          <div className="text-center max-w-xl mx-auto space-y-4 select-none">
            <div className="w-16 h-16 bg-accent-custom/10 text-accent-custom border-2 border-accent-custom/30 rounded-full flex items-center justify-center text-3xl mx-auto shadow shadow-accent-custom/5">
              <Trophy size={32} weight="fill" />
            </div>
            <div className="space-y-1">
              <span className="text-[10px] bg-accent-custom/10 text-accent-custom border border-accent-custom/20 px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider select-none">
                Convite de Bolão Privado
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-primary uppercase tracking-wider pt-2">
                Você foi Convidado!
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-secondary font-medium leading-relaxed">
              Você foi convidado por <strong className="text-primary">{room.creator_name}</strong> para entrar na liga privada <strong className="text-primary">{room.name}</strong>. 
              {room.entry_fee > 0 ? (
                <span> Este bolão possui taxa de inscrição de <strong className="text-accent-custom">R$ {room.entry_fee.toFixed(2)}</strong> com premiação acumulada.</span>
              ) : (
                <span> Este bolão é totalmente gratuito.</span>
              )}
            </p>
            <p className="text-[10px] text-secondary font-bold uppercase tracking-wider border-t border-border-custom/30 pt-3 max-w-xs mx-auto">
              Confira os confrontos abaixo e confirme sua entrada!
            </p>
          </div>
 
          {/* Cards Escolhidos para o Palpite */}
          <div className="space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-secondary border-l-2 border-l-accent-custom pl-2 select-none">
              Jogos Inclusos na Liga ({matches.length})
            </h3>
            {matches.length === 0 ? (
              <div className="bg-card border border-border-custom rounded-2xl p-10 text-center text-secondary select-none font-bold text-xs">
                Nenhum jogo vinculado a esta sala.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {matches.map((match, idx) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    isAuthenticated={!!user}
                    disablePrediction={true}
                    matchNumber={idx + 1}
                  />
                ))}
              </div>
            )}
          </div>
 
          {/* Termos de Acordo e Fluxo Normal */}
          <div className="max-w-md mx-auto bg-card border border-border-custom rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="text-center space-y-1 select-none">
              <h4 className="text-xs font-black uppercase tracking-wider text-primary">
                Regras e Inscrição
              </h4>
              <p className="text-[10px] text-secondary font-bold">
                Por favor, revise os termos para prosseguir
              </p>
            </div>
 
            {/* Termos Compactos */}
            <div className="text-left space-y-3 bg-muted/40 border border-border-custom/50 rounded-2xl p-4 text-xs select-none">
              <span className="text-[9px] font-black uppercase tracking-widest text-secondary block border-b border-border-custom/30 pb-1.5 flex items-center gap-1">
                <Info size={12} className="text-accent-custom" />
                Regras Rápidas da Liga
              </span>
              <ul className="space-y-2 text-[10px] font-semibold text-secondary leading-normal">
                <li className="flex items-start gap-1.5">
                  <span className="text-accent-custom shrink-0">•</span>
                  <span><strong>Palpites:</strong> Registre palpites e pontue. Placar exato vale 3 pts.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-accent-custom shrink-0">•</span>
                  <span><strong>Prêmio:</strong> 80% do montante arrecadado é dividido entre os vencedores.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-accent-custom shrink-0">•</span>
                  <span><strong>Pagamento:</strong> Se for uma liga paga, você só pontua após pagar o Pix da taxa.</span>
                </li>
              </ul>
            </div>
 
            {/* Checkbox */}
            <label className="flex items-start gap-2.5 text-[10px] text-secondary font-medium cursor-pointer select-none text-left py-1 hover:text-primary transition-colors">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-0.5 shrink-0 rounded border-border-custom bg-base text-accent-custom focus:ring-accent-custom w-4 h-4 cursor-pointer"
              />
              <span>
                Declaro que li e concordo com os termos de pontuação, pagamento e distribuição de prêmios da sala.
              </span>
            </label>
 
            {/* Botão de Ação */}
            <div className="w-full pt-1">
              <button
                onClick={handleJoin}
                disabled={isJoining || !termsAccepted}
                className="w-full h-12 flex items-center justify-center gap-2 bg-gradient-to-r from-accent-custom to-accent-hover text-slate-950 text-xs font-extrabold uppercase tracking-wider rounded-xl shadow-lg transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isJoining ? (
                  <>
                    <Spinner size={16} className="animate-spin" />
                    Entrando no Bolão...
                  </>
                ) : user ? (
                  <>
                    <ArrowRight size={16} weight="bold" />
                    Confirmar e Entrar
                  </>
                ) : (
                  <>
                    <SignIn size={16} weight="bold" />
                    Fazer Login para Entrar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
