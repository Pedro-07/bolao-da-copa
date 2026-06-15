import type { Metadata } from 'next';
import { Outfit } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/ui/Navbar';
import BottomNav from '@/components/ui/BottomNav';
import Toast from '@/components/ui/Toast';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
});

const siteUrl = 'https://bolao-copa-do-mundo-tau.vercel.app';

export const metadata: Metadata = {
  title: 'Bolão Copa do Mundo 2026',
  description: 'Palpite nos jogos da Copa do Mundo 2026, acumule pontos e dispute com seus amigos no ranking geral!',
  keywords: ['copa do mundo', 'bolão', 'futebol', 'amigos', 'palpites', '2026'],
  metadataBase: new URL(siteUrl),
  manifest: '/manifest.json',
  openGraph: {
    title: 'Bolão Copa do Mundo 2026 ⚽',
    description: 'Palpite nos jogos, acumule pontos e vença seus amigos na maior Copa do Mundo de todos os tempos!',
    url: siteUrl,
    siteName: 'Bolão Copa 2026',
    locale: 'pt_BR',
    type: 'website',
    images: [{ url: '/og-image', width: 1200, height: 630, alt: 'Bolão Copa do Mundo 2026' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bolão Copa do Mundo 2026 ⚽',
    description: 'Palpite nos jogos e dispute com seus amigos!',
    images: ['/og-image'],
  },
};

export const viewport = {
  themeColor: '#090d16',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${outfit.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var saved = localStorage.getItem('theme');
                  var dark = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
                  if (dark) {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className={`${outfit.className} min-h-full flex flex-col bg-base text-primary selection:bg-accent-custom selection:text-slate-950 pb-16 sm:pb-0`}>
        <Navbar />
        <main className="flex-grow">
          {children}
        </main>
        <BottomNav />
        <Toast />
      </body>
    </html>
  );
}
