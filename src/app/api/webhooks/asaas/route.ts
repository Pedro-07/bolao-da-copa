import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  try {
    // Validate Webhook Access Token
    const token = req.headers.get('asaas-access-token');
    if (process.env.ASAAS_WEBHOOK_TOKEN && token !== process.env.ASAAS_WEBHOOK_TOKEN) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const body = await req.json();

    // Verify webhook event
    const event = body.event;
    if (event !== 'PAYMENT_RECEIVED' && event !== 'PAYMENT_CONFIRMED') {
      return NextResponse.json({ received: true, ignoredEvent: event });
    }

    const payment = body.payment;
    if (!payment) {
      return NextResponse.json({ error: 'Falta objeto de pagamento.' }, { status: 400 });
    }

    const externalReference = payment.externalReference;
    if (!externalReference || !externalReference.includes(':')) {
      return NextResponse.json({ error: 'externalReference inválido.' }, { status: 400 });
    }

    const [roomId, userId] = externalReference.split(':');

    const supabase = createAdminClient();

    // 1. Verificar se participante já está pago para evitar comissões duplicadas
    const { data: participant, error: partError } = await supabase
      .from('room_participants')
      .select('payment_status')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .maybeSingle();

    if (partError) {
      console.error('[Webhook Asaas] Erro ao obter participante:', partError.message);
      return NextResponse.json({ error: 'Erro ao buscar participante.' }, { status: 500 });
    }

    if (!participant) {
      return NextResponse.json({ error: 'Participante não encontrado.' }, { status: 404 });
    }

    // Se já foi pago, apenas retorna sucesso sem duplicar comissão
    if (participant.payment_status === 'paid') {
      return NextResponse.json({ success: true, message: 'Pagamento já processado anteriormente.' });
    }

    // 2. Buscar detalhes da sala para cálculo da comissão
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('name, entry_fee, created_by, creator_commission_percent')
      .eq('id', roomId)
      .single();

    if (roomError || !room) {
      console.error('[Webhook Asaas] Erro ao obter dados da sala:', roomError?.message);
      return NextResponse.json({ error: 'Sala não encontrada.' }, { status: 404 });
    }

    // 3. Obter nome do participante pagante
    const { data: profile } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', userId)
      .single();
    
    const payerName = profile?.name || 'Participante';

    // 4. Calcular e processar comissão do criador (se aplicável)
    const entryFee = Number(room.entry_fee);
    const commissionPercent = Number(room.creator_commission_percent ?? 10.00);
    const isCreator = room.created_by === userId;

    if (entryFee > 0 && commissionPercent > 0 && !isCreator) {
      const commissionAmount = entryFee * (commissionPercent / 100);

      if (commissionAmount > 0) {
        // Obter saldo atual do criador da sala
        const { data: creatorProfile, error: creatorError } = await supabase
          .from('profiles')
          .select('balance')
          .eq('id', room.created_by)
          .single();

        if (!creatorError && creatorProfile) {
          const currentBalance = Number(creatorProfile.balance || 0);
          const newBalance = currentBalance + commissionAmount;

          // Atualizar saldo do criador
          const { error: balanceUpdateError } = await supabase
            .from('profiles')
            .update({ balance: newBalance })
            .eq('id', room.created_by);

          if (balanceUpdateError) {
            console.error('[Webhook Asaas] Erro ao atualizar saldo do criador:', balanceUpdateError.message);
          } else {
            // Gravar histórico de transação
            const { error: txError } = await supabase
              .from('transactions')
              .insert({
                user_id: room.created_by,
                amount: commissionAmount,
                type: 'commission',
                description: `Comissão pela inscrição de ${payerName} na sala "${room.name}"`,
                reference_id: roomId,
              });

            if (txError) {
              console.error('[Webhook Asaas] Erro ao registrar transação de comissão:', txError.message);
            } else {
              console.log(`[Webhook Asaas] Comissão de R$ ${commissionAmount.toFixed(2)} creditada ao criador ${room.created_by}`);
            }
          }
        }
      }
    }

    // 5. Marcar participante como pago
    const { error: updateError } = await supabase
      .from('room_participants')
      .update({ payment_status: 'paid' })
      .eq('room_id', roomId)
      .eq('user_id', userId);

    if (updateError) {
      console.error('[Webhook Asaas] Erro ao marcar participante como pago:', updateError.message);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, roomId, userId, statusChanged: 'paid' });
  } catch (error: any) {
    console.error('Erro inesperado no webhook do Asaas:', error.message);
    return NextResponse.json({ error: error.message || 'Erro interno.' }, { status: 500 });
  }
}
