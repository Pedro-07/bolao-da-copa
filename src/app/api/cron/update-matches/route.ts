import { NextRequest, NextResponse } from 'next/server';
import { fetchAndUpdateMatchResults } from '@/app/actions';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // 1. Validar o token de segurança nos parâmetros ou headers
    const { searchParams } = new URL(req.url);
    const clientSecret = (searchParams.get('secret') || req.headers.get('Authorization')?.replace('Bearer ', ''))?.trim();
    const cronSecret = process.env.CRON_SECRET?.trim();

    if (!cronSecret || clientSecret !== cronSecret) {
      return NextResponse.json(
        { error: 'Não autorizado. Token de segurança inválido ou ausente.' },
        { status: 401 }
      );
    }

    // 2. Chamar a server action passando o segredo para bypassar o auth check do admin logado
    const result = await fetchAndUpdateMatchResults(cronSecret);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Erro na sincronização de partidas.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      updatedCount: result.updatedCount,
      message: result.message
    });
  } catch (error: any) {
    console.error('[Cron Job Match Sync] Erro interno:', error);
    return NextResponse.json(
      { error: error.message || 'Erro interno no servidor.' },
      { status: 500 }
    );
  }
}
