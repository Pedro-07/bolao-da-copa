'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { joinRoom, getRoomInviteDetails } from '@/app/actions';
import { Spinner, Warning, Trophy, Users, Coins, ArrowRight, SignIn } from '@phosphor-icons/react';

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
  const [user, setUser] = useState<any>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    if (!roomId) return;

    const fetchInviteData = async () => {
      try {
        // Obter usuário logado
        const { data: { user } } = await supabase.auth.getUser();
        setUser(user);

        // Obter dados do bolão
        const result = await getRoomInviteDetails(roomId);
        if (!result.success || !result.room) {
          setErrorMsg(result.error || 'Erro ao carregar dados do convite.');
        } else {
          setRoom(result.room);
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
    if (!roomId) return;
    
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
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 bg-base text-primary">
      {room && (
        <div className="w-full max-w-md bg-card border border-border-custom rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden transition-all duration-300">
          {/* Background decoration glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-accent-custom/5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col items-center text-center space-y-6">
            {/* Header Badge */}
            <div className="w-16 h-16 bg-accent-custom/10 text-accent-custom border-2 border-accent-custom/30 rounded-full flex items-center justify-center text-3xl shadow shadow-accent-custom/5">
              <Trophy size={32} weight="fill" />
            </div>

            {/* Title */}
            <div className="space-y-1.5 select-none">
              <h2 className="text-xl font-black text-primary uppercase tracking-wider">
                Você foi Convidado!
              </h2>
              <p className="text-xs text-secondary font-bold uppercase tracking-wider">
                Para participar do bolão da Copa
              </p>
            </div>

            {/* Room Card Info */}
            <div className="w-full bg-muted/40 border border-border-custom/50 rounded-2xl p-4 text-left space-y-3.5 relative overflow-hidden">
              <h3 className="text-sm font-black text-primary uppercase tracking-wider truncate border-b border-border-custom/30 pb-2">
                {room.name}
              </h3>
              
              <div className="space-y-2 text-xs font-bold text-secondary">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] uppercase tracking-wider text-secondary/60">Organizado por:</span>
                  <span className="text-primary">{room.creator_name}</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-[10px] uppercase tracking-wider text-secondary/60">Taxa de Entrada:</span>
                  {room.entry_fee > 0 ? (
                    <span className="text-accent-custom font-extrabold text-sm">
                      R$ {room.entry_fee.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-green-500 uppercase tracking-wider text-[10px]">
                      Bolão Gratuito
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Action Button */}
            <div className="w-full pt-2">
              <button
                onClick={handleJoin}
                disabled={isJoining}
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

            {/* Footer note */}
            <p className="text-[9px] text-secondary font-semibold max-w-[280px]">
              {user 
                ? 'Ao clicar em entrar, você se juntará à liga privada. Se for uma liga paga, seus palpites só contam após pagar o Pix na tela do bolão.'
                : 'Você precisa ter uma conta no sistema para participar. O login é simples e utiliza seu apelido personalizado.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
