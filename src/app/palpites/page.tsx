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

  // 2. Buscar todas as partidas
  const { data: matchesData } = await supabase
    .from('matches')
    .select('*')
    .order('match_time', { ascending: true });

  // Filtrar apenas partidas que ainda não começaram
  const matches: Match[] = (matchesData || []).filter(
    (m) => new Date(m.match_time) > new Date()
  );

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
          Dê ou edite seus palpites nas partidas abaixo. Os palpites se encerram pontualmente no horário de início de cada jogo.
        </p>
      </div>

      {matches.length === 0 ? (
        <div className="bg-card border border-border-custom rounded-2xl p-8 text-center text-secondary">
          Nenhuma partida disponível no momento.
        </div>
      ) : (
        <PredictionsAccordionList
          matches={matches}
          predictionsMap={predictionsMap}
          isAuthenticated={true}
        />
      )}
    </div>
  );
}
