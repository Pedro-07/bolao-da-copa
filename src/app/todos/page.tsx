import React from 'react';
import { createClient } from '@/lib/supabase/server';
import PredictionsListClient from '@/components/ui/PredictionsListClient';
import { Match } from '@/types';

export const dynamic = 'force-dynamic';

interface RawPrediction {
  id: string;
  match_id: string;
  user_id: string;
  home_score: number;
  away_score: number;
  points: number | null;
  profiles: {
    name: string;
  } | null;
}

export default async function TodosPalpitesPage() {
  const supabase = await createClient();
  
  // 1. Obter usuário logado
  const { data: { user } } = await supabase.auth.getUser();

  // 2. Buscar todas as partidas ordenadas
  const { data: matchesData } = await supabase
    .from('matches')
    .select('*')
    .order('match_time', { ascending: true });
  const matches: Match[] = matchesData || [];

  // 3. Buscar todos os perfis (para mostrar quem não palpitou)
  const { data: profilesData } = await supabase
    .from('profiles')
    .select('id, name, avatar_url')
    .order('name', { ascending: true });
  const allProfiles = (profilesData || []) as { id: string; name: string; avatar_url?: string | null }[];

  // 4. Buscar todos os palpites
  const { data: predictionsData } = await supabase
    .from('predictions')
    .select(`
      id,
      match_id,
      user_id,
      home_score,
      away_score,
      points,
      profiles (
        name
      )
    `);

  const rawPredictions = (predictionsData || []) as unknown as RawPrediction[];

  const now = new Date();

  // 4. Mapear palpites — todos visíveis para todos, porém com higienização de placares para jogos futuros de terceiros
  const predictions = rawPredictions
    .map((p) => {
      const match = matches.find((m) => m.id === p.match_id);
      const isSelf = user?.id === p.user_id;
      const hasStarted = match ? new Date(match.match_time) <= now : false;
      const showScore = hasStarted || isSelf;

      return {
        id: p.id,
        match_id: p.match_id,
        user_id: p.user_id,
        home_score: showScore ? p.home_score : -1,
        away_score: showScore ? p.away_score : -1,
        points: p.points,
        user_name: p.profiles?.name || 'Participante'
      };
    });

  // 5. Buscar contagem total de palpites por jogo usando a RPC get_predictions_count
  const predictionsCount: Record<string, number> = {};
  
  try {
    const { data: countsData, error: countsError } = await supabase.rpc('get_predictions_count');
    if (!countsError && countsData) {
      countsData.forEach((row: any) => {
        predictionsCount[row.match_id] = Number(row.count);
      });
    }
  } catch (err) {
    console.error('Erro ao chamar RPC get_predictions_count:', err);
  }

  // Preencher contagens restantes com fallback seguro
  matches.forEach((m) => {
    if (predictionsCount[m.id] === undefined) {
      const fallbackCount = predictions.filter((p) => p.match_id === m.id).length;
      predictionsCount[m.id] = fallbackCount;
    }
  });

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 md:py-16 bg-base text-primary min-h-[calc(100vh-4rem)] transition-colors duration-300">
      <div className="mb-8 border-b border-border-custom/60 pb-5">
        <h1 className="text-2xl sm:text-4xl font-black text-primary uppercase tracking-wider">
          Palpites de Todos
        </h1>
        <p className="text-xs sm:text-sm text-secondary mt-2 font-medium">
          Acompanhe todos os palpites enviados pelos participantes da Copa.
        </p>
      </div>

      {matches.length === 0 ? (
        <div className="bg-card border border-border-custom rounded-2xl p-8 text-center text-secondary">
          Nenhum jogo cadastrado.
        </div>
      ) : (
        <PredictionsListClient
          matches={matches}
          predictions={predictions}
          predictionsCount={predictionsCount}
          currentUserId={user?.id || null}
          allProfiles={allProfiles}
        />
      )}
    </div>
  );
}
