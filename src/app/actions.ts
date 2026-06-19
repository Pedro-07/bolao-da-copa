'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { RankingEntry, Match, Prediction } from '@/types';
import { revalidatePath } from 'next/cache';
import timeMapping from '@/lib/match_times_mapping.json';
import { validateCPF, validateCNPJ, validateAge, validatePhone, validatePixKey } from '@/lib/validation';
import { fetchFinishedFixtures, TEAM_TRANSLATIONS } from '@/lib/footballApi';

async function ensureUserProfile(user: any) {
  try {
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile) {
      const name = user.user_metadata?.name || user.email?.split('@')[0] || 'Participante';
      await admin.from('profiles').insert({
        id: user.id,
        name: name,
        balance: 0.00
      });
    }
  } catch (err) {
    console.error('Erro ao verificar/criar perfil:', err);
  }
}

async function checkIsAdmin(userId: string, supabase: any): Promise<boolean> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', userId)
      .single();
    return !!profile?.is_admin;
  } catch {
    return false;
  }
}

/**
 * Salva ou edita o palpite de um usuário para uma determinada partida.
 * Restrição comportamental: O palpite só pode ser criado/editado se match_time > now()
 */
export async function savePrediction(
  matchId: string,
  homeScore: number,
  awayScore: number
) {
  try {
    const supabase = await createClient();

    // 1. Obter usuário autenticado
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Você precisa estar logado para palpitar.' };
    }

    await ensureUserProfile(user);

    // 2. Buscar dados da partida para verificar o horário de início
    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select('match_time, home_team, away_team')
      .eq('id', matchId)
      .single();

    if (matchError || !match) {
      return { success: false, error: 'Partida não encontrada.' };
    }

    // Validar se é confronto indefinido ("A confirmar")
    if (match.home_team === 'A confirmar' || match.away_team === 'A confirmar') {
      return { success: false, error: 'Não é permitido palpitar em confrontos indefinidos.' };
    }

    // 3. Validar se a partida já começou
    const matchTime = new Date(match.match_time);
    if (matchTime <= new Date()) {
      return { success: false, error: 'O palpite não pode ser enviado ou editado após o início da partida.' };
    }

    // 4. Inserir ou atualizar o palpite (Upsert)
    const { error: upsertError } = await supabase
      .from('predictions')
      .upsert(
        {
          user_id: user.id,
          match_id: matchId,
          home_score: homeScore,
          away_score: awayScore,
          updated_at: new Date().toISOString()
        },
        {
          onConflict: 'user_id,match_id'
        }
      );

    if (upsertError) {
      console.error('Erro no upsert do palpite:', upsertError);
      return { success: false, error: 'Erro ao salvar o palpite no banco de dados.' };
    }

    // Revalidar rotas para atualizar o cache
    revalidatePath('/palpites');
    revalidatePath(`/palpites/${matchId}`);
    revalidatePath('/perfil');
    revalidatePath('/');

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Ocorreu um erro inesperado.' };
  }
}

/**
 * Salva o resultado final de uma partida. Apenas admin pode executar.
 * Dispara automaticamente a trigger de recálculo de pontuações no banco de dados.
 */
export async function saveMatchResult(
  matchId: string,
  homeScore: number,
  awayScore: number
) {
  try {
    const supabase = await createClient();

    // 1. Obter usuário autenticado
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Usuário não autenticado.' };
    }

    // 2. Verificar se o usuário é administrador
    const isAdmin = await checkIsAdmin(user.id, supabase);
    if (!isAdmin) {
      return { success: false, error: 'Acesso negado. Apenas o administrador pode salvar resultados.' };
    }

    // 3. Atualizar o placar na tabela de partidas
    const { error: updateError } = await supabase
      .from('matches')
      .update({
        home_score: homeScore,
        away_score: awayScore
      })
      .eq('id', matchId);

    if (updateError) {
      console.error('Erro ao salvar resultado real:', updateError);
      return { success: false, error: 'Erro ao atualizar o placar da partida.' };
    }

    // Revalidar rotas para aplicar os pontos recalculados
    revalidatePath('/admin');
    revalidatePath('/palpites');
    revalidatePath('/perfil');
    revalidatePath('/');

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Ocorreu um erro inesperado.' };
  }
}

/**
 * Retorna o ranking consolidado de todos os participantes do bolão.
 * Puxa perfis e predictions do Supabase e calcula a agregação de pontos e palpites.
 */
export async function getRanking(): Promise<RankingEntry[]> {
  try {
    const supabase = await createClient();

    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, name, avatar_url, total_points, predictions_count, acertos_count, aproveitamento, rank_position')
      .eq('is_admin', false)
      .order('rank_position', { ascending: true });

    if (error || !profiles) {
      console.error('Erro ao buscar ranking:', error);
      return [];
    }

    return profiles.map((p) => ({
      user_id: p.id,
      name: p.name,
      avatar_url: p.avatar_url ?? null,
      total_points: p.total_points,
      predictions_count: p.predictions_count,
      acertos_count: p.acertos_count,
      aproveitamento: p.aproveitamento,
    }));
  } catch (error) {
    console.error('Erro ao construir o ranking:', error);
    return [];
  }
}

/**
 * Cadastra uma nova partida no banco de dados. Apenas admin pode executar.
 */
export async function createMatch(data: {
  home_team: string;
  away_team: string;
  home_flag: string;
  away_flag: string;
  match_time: string;
  stage: string;
  group_name: string | null;
}) {
  try {
    const supabase = await createClient();

    // 1. Obter usuário autenticado
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Usuário não autenticado.' };
    }

    // 2. Verificar se o usuário é administrador
    const isAdmin = await checkIsAdmin(user.id, supabase);
    if (!isAdmin) {
      return { success: false, error: 'Acesso negado. Apenas o administrador pode cadastrar partidas.' };
    }

    // 3. Inserir a partida no banco
    const { error: insertError } = await supabase
      .from('matches')
      .insert(data);

    if (insertError) {
      console.error('Erro ao inserir partida:', insertError);
      return { success: false, error: 'Erro ao cadastrar partida no banco de dados.' };
    }

    revalidatePath('/admin');
    revalidatePath('/palpites');
    revalidatePath('/');

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Ocorreu um erro inesperado.' };
  }
}

/**
 * Corrige o fuso horário de todos os jogos para o fuso horário oficial de Brasília/Fortaleza (BRT, UTC-3).
 * Apenas o admin autenticado pode executar.
 */
export async function shiftAllMatchTimes() {
  try {
    const supabase = await createClient();

    // 1. Obter usuário autenticado
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Usuário não autenticado.' };
    }

    // 2. Verificar se o usuário é administrador
    const isAdmin = await checkIsAdmin(user.id, supabase);
    if (!isAdmin) {
      return { success: false, error: 'Acesso negado. Apenas o administrador pode ajustar horários.' };
    }

    // 3. Buscar todas as partidas
    const { data: matches, error: fetchError } = await supabase
      .from('matches')
      .select('id, home_team, away_team, stage, group_name, match_time');

    if (fetchError || !matches) {
      return { success: false, error: 'Erro ao buscar partidas.' };
    }

    // 4. Mapear e atualizar cada partida
    for (const match of matches) {
      let correctTime: string | null = null;

      if (match.stage === 'Fase de Grupos') {
        // Encontrar por times
        const mapped = timeMapping.find((item: any) => {
          return item.stage === 'Fase de Grupos' &&
            ((item.home_team === match.home_team && item.away_team === match.away_team) ||
             (item.home_team === match.away_team && item.away_team === match.home_team));
        });
        if (mapped) {
          correctTime = mapped.correct_time;
        }
      } else {
        // Para mata-mata, encontrar por id primeiro (caso os IDs coincidam)
        const mappedById = timeMapping.find((item: any) => item.id === match.id);
        if (mappedById) {
          correctTime = mappedById.correct_time;
        } else {
          // Fallback se o ID mudou (ex: se o banco foi recriado):
          // Encontrar todos os jogos desta fase no banco, ordenados por match_time original
          const stageMatches = matches
            .filter((m) => m.stage === match.stage)
            .sort((a, b) => new Date(a.match_time).getTime() - new Date(b.match_time).getTime());
          
          const index = stageMatches.findIndex((m) => m.id === match.id);
          
          // Encontrar todos os mapeamentos desta fase, ordenados por correct_time
          const mappedStage = timeMapping
            .filter((item: any) => item.stage === match.stage)
            .sort((a: any, b: any) => new Date(a.correct_time).getTime() - new Date(b.correct_time).getTime());
          
          if (index !== -1 && mappedStage[index]) {
            correctTime = mappedStage[index].correct_time;
          }
        }
      }

      if (!correctTime) {
        console.warn(`Aviso: Horário correto não encontrado para a partida ${match.home_team} vs ${match.away_team} (${match.stage})`);
        continue;
      }

      const { error: updateError } = await supabase
        .from('matches')
        .update({ match_time: correctTime })
        .eq('id', match.id);

      if (updateError) {
        console.error(`Erro ao atualizar partida ${match.id}:`, updateError);
        return { success: false, error: `Erro ao atualizar partida: ${updateError.message}` };
      }
    }

    revalidatePath('/admin');
    revalidatePath('/palpites');
    revalidatePath('/todos');
    revalidatePath('/');

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Erro inesperado.' };
  }
}

/**
 * Atualiza o apelido (nome público) do usuário logado na tabela profiles.
 */
export async function updateNickname(newName: string) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { success: false, error: 'Não autenticado.' };

    const trimmed = newName.trim();
    if (trimmed.length < 2) return { success: false, error: 'Apelido deve ter pelo menos 2 caracteres.' };
    if (trimmed.length > 30) return { success: false, error: 'Apelido deve ter no máximo 30 caracteres.' };

    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('name', trimmed)
      .neq('id', user.id)
      .maybeSingle();

    if (existing) return { success: false, error: 'Esse apelido já está em uso.' };

    const { error } = await supabase
      .from('profiles')
      .update({ name: trimmed })
      .eq('id', user.id);

    if (error) return { success: false, error: error.message };

    // Recalcular posições de ranking pois a ordem alfabética do nome mudou
    const admin = createAdminClient();
    await admin.rpc('recalculate_ranking');

    revalidatePath('/perfil');
    revalidatePath('/');
    revalidatePath('/todos');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Erro inesperado.' };
  }
}

/**
 * Salva a URL do avatar do usuário na tabela profiles.
 */
export async function updateAvatarUrl(avatarUrl: string) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { success: false, error: 'Não autenticado.' };

    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', user.id);

    if (error) return { success: false, error: error.message };

    revalidatePath('/perfil');
    revalidatePath('/');
    revalidatePath('/todos');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Erro inesperado.' };
  }
}

/**
 * Exclui um usuário pelo ID. Apenas admin pode executar.
 * Remove também os palpites e o perfil associado.
 */
export async function deleteUser(userId: string) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { success: false, error: 'Não autenticado.' };

    const isAdmin = await checkIsAdmin(user.id, supabase);
    if (!isAdmin) {
      return { success: false, error: 'Acesso negado.' };
    }

    if (userId === user.id) {
      return { success: false, error: 'Não é possível excluir sua própria conta.' };
    }

    const admin = createAdminClient();

    await admin.from('predictions').delete().eq('user_id', userId);
    await admin.from('profiles').delete().eq('id', userId);

    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) return { success: false, error: error.message };

    revalidatePath('/admin');
    revalidatePath('/');
    revalidatePath('/todos');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Erro inesperado.' };
  }
}

/**
 * Cria um novo usuário com apelido + senha, sem confirmação de e-mail.
 * Usa o Admin API (service role) para marcar o e-mail como já confirmado.
 */
export async function registerUser(nickname: string, password: string) {
  try {
    const supabase = createAdminClient();

    const sanitized = nickname
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '.')
      .replace(/[^a-z0-9.]/g, '');

    if (!sanitized) {
      return { success: false, error: 'Apelido inválido. Use letras e números.' };
    }

    const email = `${sanitized}@bolao.interno`;

    const { error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: nickname.trim() },
    });

    if (error) {
      if (error.message.includes('already been registered') || error.message.includes('already exists')) {
        return { success: false, error: 'Esse apelido já está em uso. Escolha outro.' };
      }
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Erro ao criar conta.' };
  }
}

/**
 * Cria uma nova sala privada com jogos e taxa de aposta (R$).
 */
export async function createRoom(name: string, entryFee: number, matchIds: string[], creatorParticipates: boolean = true) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { success: false, error: 'Não autenticado.' };

    await ensureUserProfile(user);

    const trimmedName = name.trim();
    if (trimmedName.length < 3) return { success: false, error: 'Nome da sala deve ter pelo menos 3 caracteres.' };
    if (trimmedName.length > 50) return { success: false, error: 'Nome da sala deve ter no máximo 50 caracteres.' };
    if (entryFee < 10.00) return { success: false, error: 'A taxa de entrada mínima é de R$ 10,00.' };
    if (matchIds.length === 0) return { success: false, error: 'Selecione pelo menos uma partida para esta sala.' };

    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .insert({
        name: trimmedName,
        entry_fee: entryFee,
        created_by: user.id,
        creator_participates: creatorParticipates
      })
      .select('id')
      .single();

    if (roomError || !room) {
      return { success: false, error: roomError?.message || 'Erro ao criar a sala.' };
    }

    const matchesToInsert = matchIds.map((matchId) => ({
      room_id: room.id,
      match_id: matchId,
    }));

    const { error: matchesError } = await supabase
      .from('room_matches')
      .insert(matchesToInsert);

    if (matchesError) {
      const admin = createAdminClient();
      await admin.from('rooms').delete().eq('id', room.id);
      return { success: false, error: matchesError.message };
    }

    if (creatorParticipates) {
      const { error: participantError } = await supabase
        .from('room_participants')
        .insert({
          room_id: room.id,
          user_id: user.id,
          payment_status: 'pending',
        });

      if (participantError) {
        const admin = createAdminClient();
        await admin.from('rooms').delete().eq('id', room.id);
        return { success: false, error: participantError.message };
      }
    }

    revalidatePath('/');
    return { success: true, roomId: room.id };
  } catch (error: any) {
    return { success: false, error: error.message || 'Erro inesperado.' };
  }
}

/**
 * Insere um usuário logado nos participantes da sala como pendente de pagamento (se houver custo).
 */
export async function joinRoom(roomId: string) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { success: false, error: 'Não autenticado.' };

    await ensureUserProfile(user);

    // Use admin client to read room data — invited users are not yet participants,
    // so the RLS SELECT policy would block them from seeing the room.
    const admin = createAdminClient();
    const { data: room, error: roomError } = await admin
      .from('rooms')
      .select('id, entry_fee, created_by')
      .eq('id', roomId)
      .single();

    if (roomError || !room) return { success: false, error: 'Sala não encontrada.' };

    // Validar se alguma partida vinculada à sala já começou (previne fraudes e inscrições tardias)
    const { data: roomMatchesData } = await admin
      .from('room_matches')
      .select('match_id')
      .eq('room_id', roomId);
    
    const matchIds = (roomMatchesData || []).map((rm) => rm.match_id);
    if (matchIds.length > 0) {
      const { data: startedMatches } = await admin
        .from('matches')
        .select('id')
        .in('id', matchIds)
        .lt('match_time', new Date().toISOString());

      if (startedMatches && startedMatches.length > 0) {
        return { success: false, error: 'Não é possível entrar nesta sala pois um ou mais jogos já começaram.' };
      }
    }

    // Use admin client for room_participants operations — RLS blocks non-members
    // from SELECT/INSERT on room_participants, which prevents joining.
    const { data: existingMember } = await admin
      .from('room_participants')
      .select('payment_status')
      .eq('room_id', roomId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingMember) {
      return { success: true, alreadyMember: true, paymentStatus: existingMember.payment_status };
    }

    const isCreator = room.created_by === user.id;
    const paymentStatus = (Number(room.entry_fee) > 0 && !isCreator) ? 'pending' : 'paid';

    const { error: joinError } = await admin
      .from('room_participants')
      .insert({
        room_id: roomId,
        user_id: user.id,
        payment_status: paymentStatus,
      });

    if (joinError) return { success: false, error: joinError.message };

    revalidatePath('/');
    return { success: true, alreadyMember: false, paymentStatus };
  } catch (error: any) {
    return { success: false, error: error.message || 'Erro inesperado.' };
  }
}

/**
 * Retorna todas as salas que o usuário atual participa.
 */
export async function getUserRooms() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { success: false, error: 'Não autenticado.', rooms: [] };

    // 1. Obter todas as salas que o usuário participa
    const { data: participantData, error: partError } = await supabase
      .from('room_participants')
      .select(`
        room_id,
        payment_status,
        rooms (
          id,
          name,
          entry_fee,
          created_by,
          creator_participates,
          finalized,
          profiles:created_by (
            name
          )
        )
      `)
      .eq('user_id', user.id);

    if (partError) return { success: false, error: partError.message, rooms: [] };

    // 2. Obter todas as salas criadas pelo usuário (para garantir que apareçam mesmo se ele não participar)
    const { data: createdRoomsData, error: createdError } = await supabase
      .from('rooms')
      .select('id, name, entry_fee, created_by, creator_participates, finalized, profiles:created_by(name)')
      .eq('created_by', user.id);

    if (createdError) return { success: false, error: createdError.message, rooms: [] };

    const roomsMap = new Map<string, any>();

    // Processar salas onde participa
    for (const p of (participantData || [])) {
      if (!p.rooms) continue;
      const roomInfo: any = p.rooms;
      const creatorName = Array.isArray(roomInfo.profiles)
        ? roomInfo.profiles[0]?.name
        : (roomInfo.profiles as any)?.name;

      roomsMap.set(roomInfo.id, {
        id: roomInfo.id,
        name: roomInfo.name,
        entry_fee: Number(roomInfo.entry_fee),
        created_by: roomInfo.created_by,
        creator_name: creatorName || 'Participante',
        creator_participates: roomInfo.creator_participates,
        payment_status: p.payment_status,
        finalized: roomInfo.finalized,
      });
    }

    // Processar salas criadas (podem incluir salas onde ele não joga)
    for (const roomInfo of (createdRoomsData || [])) {
      if (roomsMap.has(roomInfo.id)) continue;
      const creatorName = Array.isArray(roomInfo.profiles)
        ? roomInfo.profiles[0]?.name
        : (roomInfo.profiles as any)?.name;

      roomsMap.set(roomInfo.id, {
        id: roomInfo.id,
        name: roomInfo.name,
        entry_fee: Number(roomInfo.entry_fee),
        created_by: roomInfo.created_by,
        creator_name: creatorName || 'Participante',
        creator_participates: roomInfo.creator_participates,
        payment_status: 'non_participant',
        finalized: roomInfo.finalized,
      });
    }

    const roomsList = [];
    for (const roomInfo of roomsMap.values()) {
      const { count: matchesCount } = await supabase
        .from('room_matches')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', roomInfo.id);

      const { count: participantsCount } = await supabase
        .from('room_participants')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', roomInfo.id);

      const { count: paidCount } = await supabase
        .from('room_participants')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', roomInfo.id)
        .eq('payment_status', 'paid');

      const entryFeeValue = Number(roomInfo.entry_fee) || 0;
      const totalAmountRaised = entryFeeValue * (paidCount || 0);

      let isWinner = false;
      if (roomInfo.finalized) {
        const rankingResult = await getRoomRanking(roomInfo.id);
        if (rankingResult.success && rankingResult.ranking && rankingResult.ranking.length > 0) {
          const topScore = rankingResult.ranking[0].total_points;
          const userEntry = rankingResult.ranking.find((r) => r.user_id === user.id);
          if (userEntry && userEntry.total_points === topScore) {
            isWinner = true;
          }
        }
      }

      roomsList.push({
        ...roomInfo,
        matches_count: matchesCount || 0,
        participants_count: participantsCount || 0,
        paid_participants_count: paidCount || 0,
        total_amount_raised: totalAmountRaised,
        is_winner: isWinner,
      });
    }

    return { success: true, rooms: roomsList };
  } catch (error: any) {
    return { success: false, error: error.message || 'Erro inesperado.', rooms: [] };
  }
}

/**
 * Retorna os detalhes de uma sala e os IDs dos jogos vinculados.
 */
export async function getRoomDetails(roomId: string) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { success: false, error: 'Não autenticado.' };

    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('id, name, entry_fee, created_by')
      .eq('id', roomId)
      .single();

    if (roomError || !room) return { success: false, error: 'Sala não encontrada.' };

    const { data: roomMatches } = await supabase
      .from('room_matches')
      .select('match_id')
      .eq('room_id', roomId);

    const matchIds = (roomMatches || []).map((rm) => rm.match_id);

    return {
      success: true,
      room: {
        id: room.id,
        name: room.name,
        entry_fee: Number(room.entry_fee),
        created_by: room.created_by,
        match_ids: matchIds,
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Erro inesperado.' };
  }
}

/**
 * Confirma o pagamento de um participante de uma sala paga.
 */
export async function confirmRoomPayment(roomId: string) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { success: false, error: 'Não autenticado.' };

    const asaasUrl = process.env.ASAAS_API_URL || 'https://api-sandbox.asaas.com/v3';
    if (!asaasUrl.includes('sandbox')) {
      return { success: false, error: 'A confirmação manual só é permitida em ambiente de testes (Sandbox).' };
    }

    const { error: updateError } = await supabase
      .from('room_participants')
      .update({ payment_status: 'paid' })
      .eq('room_id', roomId)
      .eq('user_id', user.id);

    if (updateError) return { success: false, error: updateError.message };

    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Erro inesperado.' };
  }
}

/**
 * Retorna a classificação dinâmica da sala filtrando participantes pagos e jogos vinculados.
 */
export async function getRoomRanking(roomId: string) {
  try {
    const supabase = await createClient();

    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('id')
      .eq('id', roomId)
      .single();

    if (roomError || !room) return { success: false, error: 'Sala não encontrada.', ranking: [] };

    const { data: rmData } = await supabase
      .from('room_matches')
      .select('match_id')
      .eq('room_id', roomId);

    const roomMatchIds = (rmData || []).map((rm) => rm.match_id);
    if (roomMatchIds.length === 0) {
      return { success: true, ranking: [] };
    }

    const { data: rpData } = await supabase
      .from('room_participants')
      .select(`
        user_id,
        profiles (
          id,
          name,
          avatar_url,
          is_admin
        )
      `)
      .eq('room_id', roomId)
      .eq('payment_status', 'paid');

    const paidParticipants = (rpData || [])
      .filter((rp) => rp.profiles !== null && !(rp.profiles as any).is_admin)
      .map((rp: any) => ({
        user_id: rp.user_id,
        name: rp.profiles.name,
        avatar_url: rp.profiles.avatar_url || null,
      }));

    if (paidParticipants.length === 0) {
      return { success: true, ranking: [] };
    }

    const participantIds = paidParticipants.map((p) => p.user_id);
    const { data: predData } = await supabase
      .from('predictions')
      .select('user_id, match_id, points')
      .in('user_id', participantIds)
      .in('match_id', roomMatchIds)
      .not('points', 'is', null);

    const predictions = predData || [];

    const ranking: RankingEntry[] = paidParticipants.map((p) => {
      const userPreds = predictions.filter((pred) => pred.user_id === p.user_id);
      // Somar a pontuação de todos os palpites conforme as regras reais (3, 2, 1, 0)
      const totalPoints = userPreds.reduce((sum, pred) => sum + (pred.points || 0), 0);
      const predictionsCount = userPreds.length;
      const acertosCount = userPreds.filter((pred) => pred.points === 3).length;
      const aproveitamento = predictionsCount > 0 
        ? Math.round((acertosCount / predictionsCount) * 100) 
        : 0;

      return {
        user_id: p.user_id,
        name: p.name,
        avatar_url: p.avatar_url,
        total_points: totalPoints,
        predictions_count: predictionsCount,
        acertos_count: acertosCount,
        aproveitamento: aproveitamento,
        rank_position: 0,
      };
    });

    ranking.sort((a, b) => {
      if (b.total_points !== a.total_points) {
        return b.total_points - a.total_points;
      }
      if (b.predictions_count !== a.predictions_count) {
        return b.predictions_count - a.predictions_count;
      }
      return a.name.localeCompare(b.name);
    });

    ranking.forEach((entry, idx) => {
      entry.rank_position = idx + 1;
    });

    return { success: true, ranking };
  } catch (error: any) {
    return { success: false, error: error.message || 'Erro inesperado.', ranking: [] };
  }
}

function generateRandomCpf(): string {
  const num = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += num[i] * (10 - i);
  }
  let r = sum % 11;
  const d1 = r < 2 ? 0 : 11 - r;
  num.push(d1);
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += num[i] * (11 - i);
  }
  r = sum % 11;
  const d2 = r < 2 ? 0 : 11 - r;
  num.push(d2);
  return num.join('');
}

/**
 * Gera uma cobrança de Pix no Asaas para o participante pagar a taxa da sala.
 */
export async function generatePixCharge(roomId: string) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { success: false, error: 'Não autenticado.' };

    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('id, name, entry_fee')
      .eq('id', roomId)
      .single();

    if (roomError || !room) return { success: false, error: 'Sala não encontrada.' };
    if (Number(room.entry_fee) <= 0) return { success: false, error: 'Esta sala não possui taxa de inscrição.' };

    // Validar se alguma partida vinculada à sala já começou (previne fraudes e pagamentos tardios)
    const { data: roomMatchesData } = await supabase
      .from('room_matches')
      .select('match_id')
      .eq('room_id', roomId);
    
    const matchIds = (roomMatchesData || []).map((rm) => rm.match_id);
    if (matchIds.length > 0) {
      const { data: startedMatches } = await supabase
        .from('matches')
        .select('id')
        .in('id', matchIds)
        .lt('match_time', new Date().toISOString());

      if (startedMatches && startedMatches.length > 0) {
        return { success: false, error: 'Não é possível gerar Pix para esta sala pois um ou mais jogos já começaram.' };
      }
    }

    const { data: participant, error: partError } = await supabase
      .from('room_participants')
      .select('payment_status, asaas_payment_id, pix_qr_code, pix_copia_e_cola')
      .eq('room_id', roomId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!participant) {
      return { success: false, error: 'Você precisa entrar na sala antes de efetuar o pagamento.' };
    }

    if (participant.payment_status === 'paid') {
      return { success: true, paymentStatus: 'paid' };
    }

    if (participant.asaas_payment_id && participant.pix_qr_code && participant.pix_copia_e_cola) {
      return {
        success: true,
        paymentStatus: 'pending',
        qrCode: participant.pix_qr_code,
        copiaECola: participant.pix_copia_e_cola,
        paymentId: participant.asaas_payment_id,
      };
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('name, full_name, cpf_cnpj, phone, asaas_customer_id')
      .eq('id', user.id)
      .single();

    let customerId = profile?.asaas_customer_id;

    const asaasUrl = process.env.ASAAS_API_URL || 'https://api-sandbox.asaas.com/v3';
    const asaasKey = process.env.ASAAS_API_KEY;
    const userAgent = process.env.ASAAS_USER_AGENT || 'bolao_copa_2026';

    if (!asaasKey) {
      console.error('[Asaas] ASAAS_API_KEY está vazia ou undefined. Valor:', JSON.stringify(asaasKey));
      return { success: false, error: 'Chave de API do Asaas não configurada no servidor.' };
    }
    console.log('[Asaas] API Key carregada. Primeiros 20 chars:', asaasKey.substring(0, 20) + '...');

    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': userAgent,
      'access_token': asaasKey,
    };

    if (!customerId) {
      if (!profile?.cpf_cnpj) {
        return {
          success: false,
          error: 'Você precisa cadastrar seu CPF/CNPJ no perfil financeiro antes de realizar o pagamento.'
        };
      }

      // Asaas requires name to contain only letters and spaces, and cpfCnpj is a mandatory field
      const inputName = profile?.full_name || profile?.name || user.email?.split('@')[0] || 'Participante';
      const sanitizedName = inputName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/[^a-zA-Z\s]/g, '') // Remove non-letters and non-spaces
        .trim() || 'Participante';

      const customerRes = await fetch(`${asaasUrl}/customers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: sanitizedName,
          cpfCnpj: profile.cpf_cnpj,
          email: user.email || undefined,
          phone: profile?.phone || undefined,
        }),
      });

      if (!customerRes.ok) {
        const errText = await customerRes.text();
        console.error('[Asaas] Erro ao criar cliente:', customerRes.status, errText);
        return { success: false, error: `Erro ao criar cliente no Asaas: ${errText}` };
      }

      const customerData = await customerRes.json();
      customerId = customerData.id;

      await supabase
        .from('profiles')
        .update({ asaas_customer_id: customerId })
        .eq('id', user.id);
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 3);
    const dueDateStr = dueDate.toISOString().split('T')[0];

    const paymentRes = await fetch(`${asaasUrl}/payments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customer: customerId,
        billingType: 'PIX',
        value: Number(room.entry_fee),
        dueDate: dueDateStr,
        description: `Inscrição no Bolão - Sala: ${room.name}`,
        externalReference: `${roomId}:${user.id}`,
      }),
    });

    if (!paymentRes.ok) {
      const errText = await paymentRes.text();
      console.error('[Asaas] Erro ao criar cobrança:', paymentRes.status, errText);
      return { success: false, error: `Erro ao criar cobrança no Asaas: ${errText}` };
    }

    const paymentData = await paymentRes.json();
    const paymentId = paymentData.id;

    const qrRes = await fetch(`${asaasUrl}/payments/${paymentId}/pixQrCode`, {
      method: 'GET',
      headers: {
        'User-Agent': userAgent,
        'access_token': asaasKey,
      },
    });

    if (!qrRes.ok) {
      const errText = await qrRes.text();
      console.error('[Asaas] Erro ao obter QR Code:', qrRes.status, errText);
      return { success: false, error: `Erro ao obter QR Code do Asaas: ${errText}` };
    }

    const qrData = await qrRes.json();
    const qrCode = qrData.encodedImage;
    const copiaECola = qrData.payload;

    const { error: updateError } = await supabase
      .from('room_participants')
      .update({
        asaas_payment_id: paymentId,
        pix_qr_code: qrCode,
        pix_copia_e_cola: copiaECola,
      })
      .eq('room_id', roomId)
      .eq('user_id', user.id);

    if (updateError) {
      return { success: false, error: `Erro ao atualizar dados de pagamento: ${updateError.message}` };
    }

    return {
      success: true,
      paymentStatus: 'pending',
      qrCode,
      copiaECola,
      paymentId,
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Erro inesperado ao gerar pagamento Pix.' };
  }
}

/**
 * Solicita um saque Pix. Reduz o saldo do usuário e cria uma transação de saque pendente.
 */
export async function requestWithdrawal(amount: number, pixKeyType: 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP', pixKey: string) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { success: false, error: 'Não autenticado.' };

    await ensureUserProfile(user);

    if (amount <= 0) return { success: false, error: 'Valor de saque deve ser maior que zero.' };
    const sanitizedPixKey = pixKey.trim();
    if (!sanitizedPixKey) return { success: false, error: 'Chave Pix não informada.' };

    const admin = createAdminClient();

    // 1. Debitar do saldo do usuário de forma atômica (previne condições de corrida)
    const { data: hasDebited, error: rpcError } = await admin
      .rpc('decrement_balance', {
        p_user_id: user.id,
        p_amount: amount
      });

    if (rpcError || !hasDebited) {
      return { success: false, error: rpcError?.message || 'Saldo insuficiente ou falha ao debitar saldo.' };
    }

    // 2. Criar solicitação em public.withdrawals
    const { data: withdrawal, error: withdrawalError } = await admin
      .from('withdrawals')
      .insert({
        user_id: user.id,
        amount,
        pix_key_type: pixKeyType,
        pix_key: sanitizedPixKey,
        status: 'pending'
      })
      .select('id')
      .single();

    if (withdrawalError || !withdrawal) {
      // Reverter saldo caso dê erro
      await admin.rpc('increment_balance', {
        p_user_id: user.id,
        p_amount: amount
      });
      return { success: false, error: 'Erro ao criar solicitação de saque: ' + withdrawalError?.message };
    }

    // 3. Registrar no extrato (transactions) como negativo (débito)
    await admin
      .from('transactions')
      .insert({
        user_id: user.id,
        amount: -amount,
        type: 'withdrawal',
        description: `Saque solicitado (Pix: ${pixKeyType} - ${sanitizedPixKey})`,
        reference_id: withdrawal.id
      });

    revalidatePath('/perfil');
    revalidatePath('/admin');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Erro inesperado.' };
  }
}

/**
 * Aprova uma solicitação de saque Pix. Apenas administrador pode executar.
 */
export async function approveWithdrawal(withdrawalId: string) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { success: false, error: 'Não autenticado.' };

    const isAdmin = await checkIsAdmin(user.id, supabase);
    if (!isAdmin) {
      return { success: false, error: 'Acesso negado.' };
    }

    const admin = createAdminClient();

    // Obter o saque
    const { data: withdrawal, error: wError } = await admin
      .from('withdrawals')
      .select('status')
      .eq('id', withdrawalId)
      .single();

    if (wError || !withdrawal) return { success: false, error: 'Solicitação de saque não encontrada.' };
    if (withdrawal.status !== 'pending') return { success: false, error: 'Este saque já foi processado.' };

    const { error: updateError } = await admin
      .from('withdrawals')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', withdrawalId);

    if (updateError) return { success: false, error: 'Erro ao aprovar saque: ' + updateError.message };

    revalidatePath('/perfil');
    revalidatePath('/admin');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Erro inesperado.' };
  }
}

/**
 * Rejeita uma solicitação de saque Pix e estorna o valor ao saldo do usuário. Apenas admin.
 */
export async function rejectWithdrawal(withdrawalId: string) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { success: false, error: 'Não autenticado.' };

    const isAdmin = await checkIsAdmin(user.id, supabase);
    if (!isAdmin) {
      return { success: false, error: 'Acesso negado.' };
    }

    const admin = createAdminClient();

    // Obter o saque
    const { data: withdrawal, error: wError } = await admin
      .from('withdrawals')
      .select('*')
      .eq('id', withdrawalId)
      .single();

    if (wError || !withdrawal) return { success: false, error: 'Solicitação de saque não encontrada.' };
    if (withdrawal.status !== 'pending') return { success: false, error: 'Este saque já foi processado.' };

    // Estornar saldo do usuário
    const { data: profile } = await admin
      .from('profiles')
      .select('balance')
      .eq('id', withdrawal.user_id)
      .single();

    const currentBalance = Number(profile?.balance || 0);
    const refundAmount = Number(withdrawal.amount);
    const newBalance = currentBalance + refundAmount;

    // 1. Devolver saldo
    const { error: balanceError } = await admin
      .from('profiles')
      .update({ balance: newBalance })
      .eq('id', withdrawal.user_id);

    if (balanceError) return { success: false, error: 'Erro ao estornar saldo: ' + balanceError.message };

    // 2. Atualizar status do saque para rejeitado
    await admin
      .from('withdrawals')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', withdrawalId);

    // 3. Gravar transação do estorno (refund)
    await admin
      .from('transactions')
      .insert({
        user_id: withdrawal.user_id,
        amount: refundAmount,
        type: 'refund',
        description: `Estorno de saque rejeitado (Ref: ${withdrawalId})`,
        reference_id: withdrawalId
      });

    revalidatePath('/perfil');
    revalidatePath('/admin');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Erro inesperado.' };
  }
}

/**
 * Encerra uma sala e distribui o prêmio final acumulado entre os 1º colocados.
 */
export async function finalizeRoom(roomId: string) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { success: false, error: 'Não autenticado.' };

    const isAdmin = await checkIsAdmin(user.id, supabase);
    if (!isAdmin) {
      return { success: false, error: 'Acesso negado.' };
    }

    const admin = createAdminClient();

    // 1. Obter dados da sala
    const { data: room, error: roomError } = await admin
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single();

    if (roomError || !room) return { success: false, error: 'Sala não encontrada.' };
    if (room.finalized) return { success: false, error: 'Esta sala já foi encerrada.' };

    // 2. Validar se todos os jogos vinculados possuem resultado
    const { data: roomMatches } = await admin
      .from('room_matches')
      .select('match_id')
      .eq('room_id', roomId);
    
    const matchIds = (roomMatches || []).map(rm => rm.match_id);
    if (matchIds.length === 0) return { success: false, error: 'Nenhum jogo vinculado a esta sala.' };

    const { data: unfinishedMatches, error: matchesError } = await admin
      .from('matches')
      .select('id')
      .in('id', matchIds)
      .or('home_score.is.null,away_score.is.null');

    if (matchesError) return { success: false, error: 'Erro ao validar partidas da sala.' };
    if (unfinishedMatches && unfinishedMatches.length > 0) {
      return { success: false, error: `Existem ${unfinishedMatches.length} partidas sem placar real lançado.` };
    }

    // 3. Obter participantes pagos
    const { data: participants, error: partError } = await admin
      .from('room_participants')
      .select('user_id, payment_status')
      .eq('room_id', roomId)
      .eq('payment_status', 'paid');

    if (partError || !participants || participants.length === 0) {
      return { success: false, error: 'Nenhum participante com inscrição paga nesta sala.' };
    }

    const entryFee = Number(room.entry_fee);

    // O criador agora paga a entrada se escolheu participar.
    // O total arrecadado é baseado em todos os participantes pagos.
    const paidParticipantsCount = participants.length;
    const totalCollected = paidParticipantsCount * entryFee;

    // Premiação é exatamente 80% do valor total arrecadado
    const netPrizePool = totalCollected * 0.8;

    if (entryFee <= 0 || netPrizePool <= 0) {
      // Sala gratuita: Apenas encerra sem distribuir prêmio
      const { error: updateError } = await admin
        .from('rooms')
        .update({ finalized: true, finalized_at: new Date().toISOString() })
        .eq('id', roomId);
      
      if (updateError) return { success: false, error: 'Erro ao finalizar a sala.' };
      
      revalidatePath('/admin');
      return { success: true, message: 'Sala gratuita finalizada com sucesso.' };
    }

    // 4. Calcular classificação da sala
    const rankingResult = await getRoomRanking(roomId);
    if (!rankingResult.success || !rankingResult.ranking) {
      return { success: false, error: 'Erro ao calcular ranking para distribuição: ' + (rankingResult.error || 'Nenhum ranking gerado.') };
    }

    const ranking = rankingResult.ranking;
    // Filtrar participantes que ficaram em 1º lugar (rank_position = 1) E que acertaram pelo menos 1 placar exato (total_points > 0)
    const winners = ranking.filter(entry => entry.rank_position === 1 && entry.total_points > 0);

    if (winners.length === 0) {
      // Caso não haja vencedor, o prêmio fica para o dono da sala/bolão
      const { data: creatorProfile } = await admin
        .from('profiles')
        .select('balance')
        .eq('id', room.created_by)
        .single();
      
      const currentBal = Number(creatorProfile?.balance || 0);
      const newBal = currentBal + netPrizePool;

      await admin
        .from('profiles')
        .update({ balance: newBal })
        .eq('id', room.created_by);

      await admin
        .from('transactions')
        .insert({
          user_id: room.created_by,
          amount: netPrizePool,
          type: 'prize_win',
          description: `Acúmulo de prêmio sem vencedores na sala "${room.name}"`,
          reference_id: roomId
        });
    } else {
      // Se houver vencedores, divide a premiação entre eles (truncando em duas casas decimais)
      const prizeShare = Math.floor((netPrizePool / winners.length) * 100) / 100;

      // Creditar prêmio a cada vencedor
      for (const winner of winners) {
        const { data: wProfile } = await admin
          .from('profiles')
          .select('balance')
          .eq('id', winner.user_id)
          .single();
        
        const currentBal = Number(wProfile?.balance || 0);
        const newBal = currentBal + prizeShare;

        // Atualizar saldo
        await admin
          .from('profiles')
          .update({ balance: newBal })
          .eq('id', winner.user_id);

        // Inserir transação de prêmio
        const tieMsg = winners.length > 1 ? ` (Dividido entre ${winners.length} participantes)` : '';
        await admin
          .from('transactions')
          .insert({
            user_id: winner.user_id,
            amount: prizeShare,
            type: 'prize_win',
            description: `Prêmio de 1º lugar na sala "${room.name}"${tieMsg}`,
            reference_id: roomId
          });
      }
    }

    // 6. Atualizar status da sala
    const { error: updateError } = await admin
      .from('rooms')
      .update({ finalized: true, finalized_at: new Date().toISOString() })
      .eq('id', roomId);

    if (updateError) {
      return { success: false, error: 'Erro ao atualizar status de encerramento da sala: ' + updateError.message };
    }

    revalidatePath('/admin');
    revalidatePath('/perfil');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Erro inesperado.' };
  }
}

/**
 * Retorna as transações financeiras do usuário logado.
 */
export async function getTransactions() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { success: false, error: 'Não autenticado.', data: [] };

    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) return { success: false, error: error.message, data: [] };
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message || 'Erro inesperado.', data: [] };
  }
}

/**
 * Retorna as solicitações de saque Pix do usuário logado.
 */
export async function getWithdrawals() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { success: false, error: 'Não autenticado.', data: [] };

    const { data, error } = await supabase
      .from('withdrawals')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) return { success: false, error: error.message, data: [] };
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message || 'Erro inesperado.', data: [] };
  }
}

/**
 * Retorna todas as solicitações de saque (Admin).
 */
export async function getAllWithdrawalsAdmin() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { success: false, error: 'Não autenticado.', data: [] };

    const isAdmin = await checkIsAdmin(user.id, supabase);
    if (!isAdmin) {
      return { success: false, error: 'Acesso negado.', data: [] };
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('withdrawals')
      .select(`
        *,
        profile:profiles(name)
      `)
      .order('created_at', { ascending: false });

    if (error) return { success: false, error: error.message, data: [] };
    
    // Mapear para facilitar
    const formatted = (data || []).map((w: any) => ({
      ...w,
      user_name: w.profile?.name || 'Usuário'
    }));

    return { success: true, data: formatted };
  } catch (error: any) {
    return { success: false, error: error.message || 'Erro inesperado.', data: [] };
  }
}

/**
 * Retorna todas as salas com status para exibição no painel admin.
 */
export async function getAllRoomsAdmin() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { success: false, error: 'Não autenticado.', data: [] };

    const isAdmin = await checkIsAdmin(user.id, supabase);
    if (!isAdmin) {
      return { success: false, error: 'Acesso negado.', data: [] };
    }

    const admin = createAdminClient();
    const { data: rooms, error } = await admin
      .from('rooms')
      .select(`
        *,
        creator:created_by(name)
      `)
      .order('created_at', { ascending: false });

    if (error) return { success: false, error: error.message, data: [] };

    const formattedRooms = [];
    for (const r of (rooms || [])) {
      // Contar jogos vinculados
      const { count: matchesCount } = await admin
        .from('room_matches')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', r.id);

      // Contar participantes pagos
      const { count: paidCount } = await admin
        .from('room_participants')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', r.id)
        .eq('payment_status', 'paid');

      // Verificar se todos os jogos estão concluídos
      const { data: roomMatches } = await admin
        .from('room_matches')
        .select('match_id')
        .eq('room_id', r.id);
      const matchIds = (roomMatches || []).map(rm => rm.match_id);

      let isReadyToFinalize = false;
      if (matchIds.length > 0) {
        const { count: unfinishedCount } = await admin
          .from('matches')
          .select('*', { count: 'exact', head: true })
          .in('id', matchIds)
          .or('home_score.is.null,away_score.is.null');
        
        isReadyToFinalize = (unfinishedCount === 0);
      }

      formattedRooms.push({
        ...r,
        creator_name: r.creator?.name || 'Criador',
        matches_count: matchesCount || 0,
        participants_paid_count: paidCount || 0,
        is_ready_to_finalize: isReadyToFinalize && !r.finalized
      });
    }

    return { success: true, data: formattedRooms };
  } catch (error: any) {
    return { success: false, error: error.message || 'Erro inesperado.', data: [] };
  }
}

/**
 * Obtém as partidas de uma sala e os palpites do usuário logado para essas partidas.
 */
export async function getRoomMatches(roomId: string) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Não autenticado.', matches: [], predictions: [] };

    // Buscar relações de jogos na sala
    const { data: rmData, error: rmError } = await supabase
      .from('room_matches')
      .select(`
        match_id,
        matches (
          id,
          home_team,
          away_team,
          home_flag,
          away_flag,
          match_time,
          stage,
          group_name,
          home_score,
          away_score
        )
      `)
      .eq('room_id', roomId);

    if (rmError || !rmData) {
      return { success: false, error: 'Erro ao buscar jogos da sala.', matches: [], predictions: [] };
    }

    const matches: Match[] = rmData
      .map((rm: any) => rm.matches)
      .filter((m) => m !== null && new Date(m.match_time) > new Date());

    const matchIds = matches.map((m) => m.id);
    if (matchIds.length === 0) {
      return { success: true, matches: [], predictions: [] };
    }

    // Buscar palpites do usuário autenticado para estes jogos
    const { data: predData } = await supabase
      .from('predictions')
      .select('*')
      .eq('user_id', user.id)
      .in('match_id', matchIds);

    return {
      success: true,
      matches,
      predictions: predData || []
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Erro inesperado.', matches: [], predictions: [] };
  }
}

/**
 * Salva e valida o cadastro financeiro de um usuário logado.
 */
export async function saveFinancialProfile(data: {
  fullName: string;
  cpfCnpj: string;
  birthDate: string;
  phone: string;
  pixKeyType: 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP';
  pixKey: string;
}) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { success: false, error: 'Não autenticado.' };

    const name = data.fullName.trim();
    const cleanCpfCnpj = data.cpfCnpj.replace(/\D/g, '');
    const bDate = data.birthDate.trim();
    const cleanPhone = data.phone.replace(/\D/g, '');
    const pixType = data.pixKeyType;
    const pKey = data.pixKey.trim();

    if (!name || name.length < 5 || !name.includes(' ')) {
      return { success: false, error: 'Por favor, informe seu nome completo (mínimo de 5 caracteres e com sobrenome).' };
    }

    const isCPF = cleanCpfCnpj.length === 11;
    const isCNPJ = cleanCpfCnpj.length === 14;

    if (!isCPF && !isCNPJ) {
      return { success: false, error: 'Documento deve ser um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.' };
    }

    if (isCPF && !validateCPF(cleanCpfCnpj)) {
      return { success: false, error: 'CPF informado é inválido.' };
    }

    if (isCNPJ && !validateCNPJ(cleanCpfCnpj)) {
      return { success: false, error: 'CNPJ informado é inválido.' };
    }

    if (!validateAge(bDate)) {
      return { success: false, error: 'Você precisa ser maior de idade (18+ anos) para participar.' };
    }

    if (!validatePhone(cleanPhone)) {
      return { success: false, error: 'Telefone Celular informado é inválido.' };
    }

    if (!validatePixKey(pixType, pKey, cleanCpfCnpj)) {
      return { success: false, error: `Chave Pix inválida para o tipo ${pixType}.` };
    }

    // Verificar se este CPF/CNPJ já está cadastrado em outro perfil
    const { data: existingCpf } = await supabase
      .from('profiles')
      .select('id')
      .eq('cpf_cnpj', cleanCpfCnpj)
      .neq('id', user.id)
      .maybeSingle();

    if (existingCpf) {
      return { success: false, error: 'Este CPF/CNPJ já está cadastrado em outra conta.' };
    }

    // Atualizar no banco de dados
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        full_name: name,
        cpf_cnpj: cleanCpfCnpj,
        birth_date: bDate,
        phone: cleanPhone,
        pix_key_type: pixType,
        pix_key: pKey,
        is_financial_registered: true,
      })
      .eq('id', user.id);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    revalidatePath('/perfil');
    revalidatePath('/');
    revalidatePath('/salas/criar');
    
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro inesperado.' };
  }
}

/**
 * Busca resultados na API de futebol e atualiza as partidas pendentes no banco.
 * Suporta execução por administrador autenticado ou bypass seguro via Cron Job.
 */
export async function fetchAndUpdateMatchResults(bypassCronSecret?: string) {
  try {
    const isCronBypass = bypassCronSecret && 
                         process.env.CRON_SECRET && 
                         bypassCronSecret.trim() === process.env.CRON_SECRET.trim();

    if (!isCronBypass) {
      const supabase = await createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        return { success: false, error: 'Usuário não autenticado.' };
      }

      const isAdmin = await checkIsAdmin(user.id, supabase);
      if (!isAdmin) {
        return { success: false, error: 'Acesso negado. Apenas o administrador pode atualizar resultados.' };
      }
    }

    // Usaremos o admin client para ler/gravar para suportar execução via Cron (bypass RLS)
    const admin = createAdminClient();
    
    // Buscar partidas do nosso banco de dados que não possuem resultado e que já iniciaram
    const now = new Date().toISOString();
    const { data: dbMatches, error: dbError } = await admin
      .from('matches')
      .select('*')
      .is('home_score', null)
      .is('away_score', null)
      .lt('match_time', now);

    if (dbError || !dbMatches) {
      console.error('[API-Football Sync] Erro ao buscar partidas no banco:', dbError?.message);
      return { success: false, error: 'Erro ao buscar partidas pendentes no banco de dados.' };
    }

    if (dbMatches.length === 0) {
      return { success: true, updatedCount: 0, message: 'Nenhuma partida pendente de resultado no fuso horário atual.' };
    }

    // Buscar partidas finalizadas da API-Football
    const apiFixtures = await fetchFinishedFixtures();
    let updatedCount = 0;

    for (const dbMatch of dbMatches) {
      const translatedHome = TEAM_TRANSLATIONS[dbMatch.home_team] || dbMatch.home_team;
      const translatedAway = TEAM_TRANSLATIONS[dbMatch.away_team] || dbMatch.away_team;

      let matchFixture = null;

      if (dbMatch.api_fixture_id) {
        matchFixture = apiFixtures.find((apiMatch) => apiMatch.id === dbMatch.api_fixture_id);
      }

      if (!matchFixture) {
        const dbMatchDate = new Date(dbMatch.match_time);
        
        matchFixture = apiFixtures.find((apiMatch) => {
          const homeNameApi = apiMatch.teams.home.name.toLowerCase();
          const awayNameApi = apiMatch.teams.away.name.toLowerCase();
          const homeNameTranslated = translatedHome.toLowerCase();
          const awayNameTranslated = translatedAway.toLowerCase();

          const sameTeams = (homeNameApi === homeNameTranslated && awayNameApi === awayNameTranslated) ||
                            (homeNameApi === awayNameTranslated && awayNameApi === homeNameTranslated);

          if (!sameTeams) return false;

          const apiMatchDate = new Date(apiMatch.date);
          if (apiMatchDate.getFullYear() !== dbMatchDate.getFullYear()) {
            return true; // Ignora o horário se estiver testando com temporadas históricas (ex: 2022)
          }
          const diffHours = Math.abs(apiMatchDate.getTime() - dbMatchDate.getTime()) / (1000 * 60 * 60);
          return diffHours <= 4;
        });
      }

      if (matchFixture && 
          matchFixture.goals.home !== null && 
          matchFixture.goals.away !== null && 
          ['FT', 'AET', 'PEN'].includes(matchFixture.status.short)) {
        
        const isReversed = matchFixture.teams.home.name.toLowerCase() === translatedAway.toLowerCase();
        const apiHomeScore = matchFixture.goals.home;
        const apiAwayScore = matchFixture.goals.away;
        
        const homeScore = isReversed ? apiAwayScore : apiHomeScore;
        const awayScore = isReversed ? apiHomeScore : apiAwayScore;

        const { error: updateError } = await admin
          .from('matches')
          .update({
            home_score: homeScore,
            away_score: awayScore
          })
          .eq('id', dbMatch.id);

        if (updateError) {
          console.error(`[API-Football Sync] Erro ao atualizar partida ${dbMatch.id}:`, updateError.message);
        } else {
          updatedCount++;
        }
      }
    }

    if (updatedCount > 0) {
      revalidatePath('/admin');
      revalidatePath('/palpites');
      revalidatePath('/perfil');
      revalidatePath('/');
    }

    return { 
      success: true, 
      updatedCount, 
      message: updatedCount > 0 
        ? `${updatedCount} partidas atualizadas com sucesso!` 
        : 'Nenhuma nova partida finalizada correspondente foi encontrada.' 
    };
  } catch (error: any) {
    console.error('[API-Football Sync] Erro inesperado na sincronização:', error);
    return { success: false, error: error.message || 'Erro ao sincronizar resultados.' };
  }
}

/**
 * Busca detalhes de uma sala para a página de convite/entrada.
 */
export async function getRoomInviteDetails(roomId: string) {
  try {
    const admin = createAdminClient();
    const { data: room, error } = await admin
      .from('rooms')
      .select('id, name, entry_fee, created_by, profiles:created_by(name)')
      .eq('id', roomId)
      .single();

    if (error || !room) return { success: false, error: 'Sala não encontrada.' };
    
    const creatorName = Array.isArray(room.profiles)
      ? room.profiles[0]?.name
      : (room.profiles as any)?.name;

    return {
      success: true,
      room: {
        id: room.id,
        name: room.name,
        entry_fee: Number(room.entry_fee),
        creator_name: creatorName || 'Participante',
      }
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Erro inesperado.' };
  }
}

