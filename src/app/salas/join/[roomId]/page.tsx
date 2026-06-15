'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { joinRoom } from '@/app/actions';
import { Spinner, Warning } from '@phosphor-icons/react';

export default function JoinRoomPage() {
  const router = useRouter();
  const { roomId } = useParams() as { roomId: string };
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const hasExecuted = useRef(false);

  useEffect(() => {
    if (!roomId || hasExecuted.current) return;
    hasExecuted.current = true;

    const executeJoin = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          // Store roomId in localStorage for redirect after login
          localStorage.setItem('pending_room_id', roomId);
          router.push(`/login?redirect=join`);
          return;
        }

        // User is logged in, join the room
        const result = await joinRoom(roomId);
        if (!result.success) {
          setErrorMsg(result.error || 'Erro ao entrar na sala.');
          setLoading(false);
          return;
        }

        // Redirect to homepage with active tab = salas & selected roomId
        router.push(`/?tab=salas&roomId=${roomId}`);
      } catch (err: any) {
        setErrorMsg(err.message || 'Erro inesperado ao entrar na sala.');
        setLoading(false);
      }
    };

    executeJoin();
  }, [roomId, router]);

  if (errorMsg) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 bg-base text-primary">
        <div className="w-full max-w-md bg-card border border-border-custom rounded-2xl p-8 text-center space-y-4 shadow-2xl">
          <div className="flex justify-center text-red-500">
            <Warning size={48} />
          </div>
          <h2 className="text-xl font-bold uppercase tracking-wider text-red-500">Falha ao Entrar</h2>
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
      <div className="w-full max-w-md bg-card border border-border-custom rounded-2xl p-8 text-center space-y-4 shadow-2xl">
        <div className="flex justify-center text-accent-custom animate-spin">
          <Spinner size={48} weight="bold" />
        </div>
        <h3 className="text-lg font-black uppercase tracking-wider">Processando convite...</h3>
        <p className="text-xs text-secondary font-bold">Validando dados da sala e sua participação. Aguarde um instante.</p>
      </div>
    </div>
  );
}
