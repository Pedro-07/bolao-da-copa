'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { House, Calendar, Trophy, User, List } from '@phosphor-icons/react';
import { createClient } from '@/lib/supabase/client';

export default function BottomNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser();
      setIsAuthenticated(!!user);
    }
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setIsAuthenticated(!!session?.user);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  // Se não autenticado, não exibe a BottomNav (ou exibe apenas o link de Home/Login, mas ocultar é mais limpo)
  if (!isAuthenticated) return null;

  const tabs = [
    { name: 'Início', href: '/', icon: House },
    { name: 'Palpitar', href: '/palpites', icon: Calendar },
    { name: 'Ligas', href: '/?tab=salas', icon: Trophy },
    { name: 'Todos', href: '/todos', icon: List },
    { name: 'Perfil', href: '/perfil', icon: User },
  ];

  return (
    <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t border-border-custom text-primary transition-all duration-300 pb-safe">
      <div className="flex justify-around items-center h-16 px-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isLigas = tab.href.startsWith('/?');
          const isHome = tab.href === '/';
          
          let isActive = false;
          if (isLigas) {
            isActive = pathname === '/' && (searchParams.get('tab') === 'salas' || !!searchParams.get('roomId'));
          } else if (isHome) {
            isActive = pathname === '/' && searchParams.get('tab') !== 'salas' && !searchParams.get('roomId');
          } else {
            isActive = pathname === tab.href;
          }

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center justify-center flex-1 h-full min-h-[48px] min-w-[48px] gap-1 focus:outline-none transition-colors duration-200 ${
                isActive ? 'text-accent-custom' : 'text-secondary hover:text-primary'
              }`}
            >
              <Icon size={22} weight={isActive ? 'bold' : 'regular'} />
              <span className="text-[10px] font-bold uppercase tracking-wider">
                {tab.name}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
