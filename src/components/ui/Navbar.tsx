'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Trophy, Shield, User, SignOut, List, X, Calendar, SoccerBall } from '@phosphor-icons/react';
import ThemeToggle from './ThemeToggle';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    async function getUserData() {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('name, is_admin')
          .eq('id', user.id)
          .single();
        
        setProfile(profile);
        setIsAdmin(!!profile?.is_admin);
      } else {
        setProfile(null);
        setIsAdmin(false);
      }
    }

    getUserData();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUser(session.user);

        const { data: profile } = await supabase
          .from('profiles')
          .select('name, is_admin')
          .eq('id', session.user.id)
          .single();
        setProfile(profile);
        setIsAdmin(!!profile?.is_admin);
      } else {
        setUser(null);
        setProfile(null);
        setIsAdmin(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const navItems = [
    { name: 'Ranking', href: '/', icon: Trophy },
    ...(user ? [{ name: 'Palpitar', href: '/palpites', icon: Calendar }] : []),
    ...(user ? [{ name: 'Todos', href: '/todos', icon: List }] : []),
    ...(user ? [{ name: 'Meu Perfil', href: '/perfil', icon: User }] : []),
    ...(isAdmin ? [{ name: 'Painel Admin', href: '/admin', icon: Shield }] : []),
  ];

  return (
    <>
      <nav className="sticky top-0 z-50 bg-card/90 backdrop-blur-md border-b border-border-custom text-primary transition-all duration-300">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center">
              <Link href="/" className="flex items-center gap-2.5 group min-h-[48px] min-w-[48px] focus:outline-none">
                <SoccerBall size={24} className="text-accent-custom transform group-hover:rotate-45 transition-transform duration-500" weight="fill" />
                <span className="font-extrabold text-base sm:text-lg tracking-wider bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent uppercase">
                  BOLÃO COPA 2026
                </span>
              </Link>
            </div>

            {/* Desktop Nav Items */}
            <div className="hidden md:flex items-center gap-5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                      isActive
                        ? 'bg-accent-custom text-slate-950 shadow-md shadow-green-500/10'
                        : 'text-secondary hover:text-primary hover:bg-muted/80'
                    }`}
                  >
                    <Icon size={16} weight={isActive ? 'bold' : 'regular'} />
                    {item.name}
                  </Link>
                );
              })}
            </div>

            {/* User Info & Actions (Desktop) */}
            <div className="hidden md:flex items-center gap-4">
              <ThemeToggle />
              
              {user ? (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-secondary font-bold">
                    Olá, <span className="text-accent-custom font-extrabold">{profile?.name || user.email?.split('@')[0]}</span>
                  </span>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-rose-500 hover:text-rose-400 hover:bg-rose-950/20 border border-transparent hover:border-rose-900/40 transition-all duration-200 cursor-pointer"
                  >
                    <SignOut size={15} />
                    Sair
                  </button>
                </div>
              ) : (
                <Link
                  href="/login"
                  className="px-4 py-2 bg-gradient-to-r from-accent-custom to-accent-hover text-slate-950 text-xs font-extrabold uppercase tracking-wider rounded-xl shadow-md transition-all duration-200"
                >
                  Entrar
                </Link>
              )}
            </div>

            {/* Mobile Header Controls (ThemeToggle + Avatar/Burger) */}
            <div className="flex md:hidden items-center gap-2">
              <ThemeToggle />
              
              {user ? (
                <Link
                  href="/perfil"
                  className="w-12 h-12 flex items-center justify-center rounded-xl bg-muted text-accent-custom border border-border-custom font-extrabold focus:outline-none"
                  aria-label="Ir para Perfil"
                >
                  <User size={20} weight="bold" />
                </Link>
              ) : (
                <Link
                  href="/login"
                  className="h-11 px-3 bg-gradient-to-r from-accent-custom to-accent-hover text-slate-950 text-[10px] font-extrabold uppercase tracking-wider rounded-xl shadow-md flex items-center justify-center transition-all duration-200"
                >
                  Entrar
                </Link>
              )}

              {/* Botão Hambúrguer */}
              <button
                onClick={() => setIsOpen(true)}
                className="w-12 h-12 flex items-center justify-center rounded-xl text-secondary hover:text-primary hover:bg-muted border border-border-custom focus:outline-none cursor-pointer"
                aria-label="Abrir menu"
              >
                <List size={22} />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Drawer / Bottom Sheet Mobile */}
      {isOpen && (
        <div className="fixed inset-0 z-50 md:hidden animate-fadeIn">
          {/* Overlay escuro de clique fora */}
          <div
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity duration-300"
          />

          {/* Container do Drawer deslizante */}
          <div className="absolute bottom-0 left-0 right-0 bg-card border-t border-border-custom rounded-t-3xl p-6 shadow-2xl flex flex-col gap-4 max-h-[85vh] overflow-y-auto pb-safe">
            {/* Drag Handle Indicator */}
            <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mb-2 select-none" />

            <div className="flex justify-between items-center mb-2">
              <h2 className="text-base font-black text-primary uppercase tracking-widest">
                Menu de Navegação
              </h2>
              <button
                onClick={() => setIsOpen(false)}
                className="w-10 h-10 flex items-center justify-center bg-muted rounded-full text-secondary hover:text-primary focus:outline-none cursor-pointer"
                aria-label="Fechar menu"
              >
                <X size={18} weight="bold" />
              </button>
            </div>

            {/* Informações do Usuário no Drawer */}
            {user && (
              <div className="bg-muted/50 border border-border-custom/50 rounded-2xl p-4 flex items-center gap-3">
                <span className="w-10 h-10 flex items-center justify-center rounded-full bg-accent-custom/10 text-accent-custom border border-accent-custom/20 font-black text-sm uppercase">
                  {(profile?.name || user.email || 'P').substring(0, 1)}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-extrabold text-primary truncate">
                    {profile?.name || user.email?.split('@')[0]}
                  </div>
                  <div className="text-xs text-secondary truncate">
                    {user.email}
                  </div>
                </div>
              </div>
            )}

            {/* Links de Navegação */}
            <div className="flex flex-col gap-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className={`flex items-center gap-3 h-12 px-4 rounded-xl text-sm font-bold uppercase tracking-wider transition-colors ${
                      isActive
                        ? 'bg-accent-custom text-slate-950'
                        : 'text-secondary hover:text-primary hover:bg-muted'
                    }`}
                  >
                    <Icon size={18} weight={isActive ? 'bold' : 'regular'} />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </div>

            {/* Ações Finais */}
            <div className="border-t border-border-custom pt-4 mt-2">
              {user ? (
                <button
                  onClick={() => {
                    setIsOpen(false);
                    handleLogout();
                  }}
                  className="w-full h-12 flex items-center justify-center gap-2 rounded-xl text-rose-500 hover:text-rose-400 hover:bg-rose-950/20 border border-border-custom text-xs font-bold uppercase tracking-wider cursor-pointer"
                >
                  <SignOut size={16} />
                  Sair da Conta
                </button>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setIsOpen(false)}
                  className="w-full h-12 flex items-center justify-center bg-gradient-to-r from-accent-custom to-accent-hover text-slate-950 rounded-xl text-xs font-extrabold uppercase tracking-wider shadow-md"
                >
                  Entrar
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
