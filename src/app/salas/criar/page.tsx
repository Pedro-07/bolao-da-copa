import React from 'react';
import { createClient } from '@/lib/supabase/server';
import CreateRoomClient from '@/components/ui/CreateRoomClient';
import { Match } from '@/types';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function CriarSalaPage() {
  const supabase = await createClient();
  
  // Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  // Buscar se o usuário possui cadastro financeiro
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_financial_registered')
    .eq('id', user.id)
    .single();

  const isFinancialRegistered = !!profile?.is_financial_registered;

  // Fetch matches ordered by time
  const { data: matchesData } = await supabase
    .from('matches')
    .select('*')
    .order('match_time', { ascending: true });

  // Filtrar apenas partidas que ainda não começaram para seleção
  const matches: Match[] = (matchesData || []).filter(
    (m) => new Date(m.match_time) > new Date()
  );

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 md:py-16 bg-base text-primary min-h-[calc(100vh-4rem)]">
      <CreateRoomClient matches={matches} isFinancialRegistered={isFinancialRegistered} />
    </div>
  );
}
