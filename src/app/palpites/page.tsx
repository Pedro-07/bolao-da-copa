import React from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Match, Prediction } from '@/types';
import PredictionsAccordionList from '@/components/ui/PredictionsAccordionList';

export const dynamic = 'force-dynamic';

export default async function PalpitesPage() {
  const supabase = await createClient();

  // 1. Verificar se usuário está autenticado
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  // 2. Buscar salas em que o usuário está participando (como jogador)
  const { data: userRoomsData } = await supabase
    .from('room_participants')
    .select(`
      room_id,
      payment_status,
      rooms (
        id,
        name
      )
    `)
    .eq('user_id', user.id);

  const userRooms = userRoomsData || [];
  const roomIds = userRooms.map((ur) => ur.room_id);

  let matches: Match[] = [];
  const roomMatchesMap: Record<string, string[]> = {};
  const formattedRooms = userRooms.map((ur: any) => ({
    room_id: ur.room_id,
    payment_status: ur.payment_status,
    name: ur.rooms?.name || 'Bolão Privado',
  }));

  if (roomIds.length > 0) {
    const { data: roomMatchesData } = await supabase
      .from('room_matches')
      .select('room_id, match_id')
      .in('room_id', roomIds);

    let allMatchIds: string[] = [];
    if (roomMatchesData && roomMatchesData.length > 0) {
      roomMatchesData.forEach((rm) => {
        if (!roomMatchesMap[rm.room_id]) {
          roomMatchesMap[rm.room_id] = [];
        }
        roomMatchesMap[rm.room_id].push(rm.match_id);
        allMatchIds.push(rm.match_id);
      });

      allMatchIds = Array.from(new Set(allMatchIds));

      // Buscar as partidas
      const { data: matchesData } = await supabase
        .from('matches')
        .select('*')
        .in('id', allMatchIds)
        .order('match_time', { ascending: true });

      // Filtrar apenas partidas que ainda não começaram
      matches = (matchesData || []).filter(
        (m) => new Date(m.match_time) > new Date()
      );
    }
  }

  // 3. Buscar palpites cadastrados do usuário
  const { data: predictionsData } = await supabase
    .from('predictions')
    .select('*')
    .eq('user_id', user.id);

  const predictions: Prediction[] = predictionsData || [];

  // Mapear palpites por match_id
  const predictionsMap = new Map<string, Prediction>();
  predictions.forEach((p) => {
    predictionsMap.set(p.match_id, p);
  });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 md:py-16 bg-base text-primary min-h-[calc(100vh-4rem)] transition-colors duration-300">
      <div className="mb-10 border-b border-border-custom/60 pb-6">
        <h1 className="text-2xl sm:text-4xl font-black text-primary uppercase tracking-wider">
          Meus Palpites
        </h1>
        <p className="text-sm text-secondary mt-2 font-medium">
          Dê ou edite seus palpites nas partidas dos seus bolões. Os palpites se encerram pontualmente no horário de início de cada jogo.
        </p>
      </div>

      {formattedRooms.length === 0 ? (
        <div className="bg-card border border-border-custom rounded-2xl p-10 text-center space-y-4 shadow-xl">
          <p className="text-sm text-secondary font-semibold">
            Você não está participando de nenhum bolão ativo como jogador.
          </p>
          <p className="text-xs text-secondary/70">
            Você precisa criar ou entrar em um bolão privado para começar a dar seus palpites.
          </p>
          <div className="pt-2">
            <a
              href="/?tab=salas"
              className="inline-flex items-center justify-center min-h-[44px] px-6 bg-accent-custom hover:bg-accent-hover text-slate-950 text-xs font-black uppercase tracking-wider rounded-xl shadow transition-all cursor-pointer"
            >
              Criar ou Entrar em um Bolão
            </a>
          </div>
        </div>
      ) : matches.length === 0 ? (
        <div className="bg-card border border-border-custom rounded-2xl p-8 text-center text-secondary">
          Nenhuma partida pendente de palpite nos seus bolões ativos.
        </div>
      ) : (
        <PredictionsAccordionList
          matches={matches}
          predictionsMap={predictionsMap}
          isAuthenticated={true}
          userRooms={formattedRooms}
          roomMatchesMap={roomMatchesMap}
        />
      )}
    </div>
  );
}
