'use client';

import React, { useState, useTransition, Suspense } from 'react';
import { createClient } from '@/lib/supabase/client';
import { registerUser } from '@/app/actions';
import { User, Lock, Spinner, CheckSquare } from '@phosphor-icons/react';
import { useSearchParams, useRouter } from 'next/navigation';

function nicknameToEmail(nickname: string): string {
  const sanitized = nickname
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9.]/g, '');
  return `${sanitized}@bolao.interno`;
}

function toEmail(input: string): string {
  // Admin entra com e-mail real; demais usuários usam apelido
  if (input.includes('@')) return input.trim();
  return nicknameToEmail(input);
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorParam = searchParams.get('error');

  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [isTransitionPending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    errorParam === 'invalid_token'
      ? { type: 'error', text: 'Sessão inválida. Faça login novamente.' }
      : null
  );

  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname || !password) return;
    setStatusMessage(null);

    startTransition(async () => {
      try {
        if (mode === 'login') {
          const { error } = await supabase.auth.signInWithPassword({
            email: toEmail(nickname),
            password,
          });

          if (error) {
            setStatusMessage({ type: 'error', text: 'Apelido ou senha incorretos.' });
          } else {
            const pendingRoomId = localStorage.getItem('pending_room_id');
            if (pendingRoomId) {
              localStorage.removeItem('pending_room_id');
              router.push(`/salas/join/${pendingRoomId}`);
            } else {
              router.push('/palpites');
            }
            router.refresh();
          }
        } else {
          const result = await registerUser(nickname, password);

          if (!result.success) {
            setStatusMessage({ type: 'error', text: result.error || 'Erro ao criar conta.' });
            return;
          }

          // Loga direto após criar conta
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: nicknameToEmail(nickname),
            password,
          });

          if (!signInError) {
            const pendingRoomId = localStorage.getItem('pending_room_id');
            if (pendingRoomId) {
              localStorage.removeItem('pending_room_id');
              router.push(`/salas/join/${pendingRoomId}`);
            } else {
              router.push('/palpites');
            }
            router.refresh();
          } else {
            setStatusMessage({ type: 'success', text: 'Conta criada! Agora entre com seu apelido e senha.' });
            setMode('login');
            setPassword('');
          }
        }
      } catch (err: any) {
        setStatusMessage({ type: 'error', text: err.message || 'Erro inesperado.' });
      }
    });
  };

  return (
    <div className="w-full max-w-md bg-card border border-border-custom rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden transition-all duration-300">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-accent-custom/5 rounded-full blur-3xl pointer-events-none" />

      <div className="text-center mb-6">
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-primary uppercase tracking-wider">
          Acessar Bolão
        </h1>
        <p className="text-xs text-secondary mt-2 font-bold uppercase tracking-wider">
          {mode === 'login' ? 'Entre com seu apelido' : 'Crie seu apelido'}
        </p>
      </div>

      {/* Tabs: Entrar / Criar Conta */}
      <div className="flex border border-border-custom/50 mb-6 bg-muted/40 p-1 rounded-xl">
        <button
          type="button"
          onClick={() => { setMode('login'); setStatusMessage(null); }}
          className={`flex-1 min-h-[48px] rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-200 cursor-pointer ${
            mode === 'login'
              ? 'bg-accent-custom text-slate-950 shadow'
              : 'text-secondary hover:text-primary'
          }`}
        >
          Entrar
        </button>
        <button
          type="button"
          onClick={() => { setMode('register'); setStatusMessage(null); }}
          className={`flex-1 min-h-[48px] rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-200 cursor-pointer ${
            mode === 'register'
              ? 'bg-accent-custom text-slate-950 shadow'
              : 'text-secondary hover:text-primary'
          }`}
        >
          Criar Conta
        </button>
      </div>

      {statusMessage?.type === 'success' ? (
        <div className="text-center py-6 space-y-4 animate-fadeIn">
          <div className="flex justify-center text-accent-custom">
            <CheckSquare size={52} weight="fill" />
          </div>
          <h3 className="text-lg font-bold text-primary uppercase tracking-wider">Conta criada!</h3>
          <p className="text-sm text-secondary leading-relaxed font-semibold">{statusMessage.text}</p>
          <button
            onClick={() => setStatusMessage(null)}
            className="min-h-[48px] px-6 text-xs font-bold text-accent-custom hover:underline transition-all uppercase tracking-wider cursor-pointer"
          >
            Ir para o Login
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="nickname" className="text-xs font-bold text-secondary uppercase tracking-wider block">
              {mode === 'login' ? 'Seu Apelido' : 'Escolha um Apelido'}
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-secondary">
                <User size={18} />
              </span>
              <input
                id="nickname"
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                disabled={isTransitionPending}
                className="w-full h-12 pl-10 pr-4 bg-base border border-border-custom focus:border-accent-custom text-primary text-sm rounded-xl focus:outline-none transition-colors disabled:opacity-50 font-medium"
                placeholder={mode === 'login' ? 'Ex: Marcos' : 'Ex: Marcos, João...'}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-xs font-bold text-secondary uppercase tracking-wider block">
              {mode === 'login' ? 'Sua Senha' : 'Crie uma Senha'}
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-secondary">
                <Lock size={18} />
              </span>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isTransitionPending}
                className="w-full h-12 pl-10 pr-4 bg-base border border-border-custom focus:border-accent-custom text-primary text-sm rounded-xl focus:outline-none transition-colors disabled:opacity-50 font-medium"
                placeholder={mode === 'login' ? 'Sua senha' : 'Mínimo 6 caracteres'}
                minLength={mode === 'register' ? 6 : undefined}
                required
              />
            </div>
          </div>

          {statusMessage?.type === 'error' && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold rounded-xl p-3.5 text-center">
              {statusMessage.text}
            </div>
          )}

          <button
            type="submit"
            disabled={isTransitionPending}
            className="w-full h-12 flex items-center justify-center gap-2 bg-gradient-to-r from-accent-custom to-accent-hover text-slate-950 text-sm font-extrabold uppercase tracking-wider rounded-xl shadow-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {isTransitionPending ? (
              <>
                <Spinner className="animate-spin" size={18} weight="bold" />
                Carregando...
              </>
            ) : mode === 'login' ? (
              'Entrar'
            ) : (
              'Criar Conta'
            )}
          </button>
        </form>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 bg-base text-primary transition-colors duration-300">
      <Suspense fallback={
        <div className="w-full max-w-md bg-card border border-border-custom rounded-2xl p-8 text-center text-secondary font-bold shadow-md">
          Carregando...
        </div>
      }>
        <LoginForm />
      </Suspense>
    </div>
  );
}
