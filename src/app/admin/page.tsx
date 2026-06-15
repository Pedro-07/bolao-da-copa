import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Match } from '@/types';
import AdminPanelClient from '@/components/ui/AdminPanelClient';
import { getAllWithdrawalsAdmin, getAllRoomsAdmin } from '@/app/actions';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  if (!adminEmail || user.email !== adminEmail) redirect('/');

  const [matchesResult, profilesResult, predictionsResult, withdrawalsRes, roomsRes] = await Promise.all([
    supabase.from('matches').select('*').order('match_time', { ascending: true }),
    supabase.from('profiles').select('id, name').order('name', { ascending: true }),
    supabase.from('predictions').select('user_id'),
    getAllWithdrawalsAdmin(),
    getAllRoomsAdmin(),
  ]);

  const matches: Match[] = matchesResult.data || [];

  const predCounts: Record<string, number> = {};
  (predictionsResult.data || []).forEach((p: { user_id: string }) => {
    predCounts[p.user_id] = (predCounts[p.user_id] || 0) + 1;
  });

  const users = (profilesResult.data || []).map((p: { id: string; name: string }) => ({
    id: p.id,
    name: p.name,
    predictionCount: predCounts[p.id] || 0,
  }));

  const withdrawals = withdrawalsRes.success ? withdrawalsRes.data : [];
  const rooms = roomsRes.success ? roomsRes.data : [];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 md:py-16 bg-base text-primary min-h-[calc(100vh-4rem)] transition-colors duration-300">
      <div className="mb-10 border-b border-border-custom/60 pb-6">
        <h1 className="text-2xl sm:text-4xl font-black text-primary uppercase tracking-wider">
          Painel do Administrador
        </h1>
        <p className="text-sm text-secondary mt-2 font-medium">
          Gerencie partidas, resultados, saques e encerramento de bolões.
        </p>
      </div>

      <AdminPanelClient
        matches={matches}
        users={users}
        adminUserId={user.id}
        withdrawals={withdrawals as any}
        rooms={rooms as any}
      />
    </div>
  );
}
