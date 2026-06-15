'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Match } from '@/types';
import { createRoom } from '@/app/actions';
import { Trophy, ArrowLeft, Check, SquaresFour, Circle, CheckCircle, Warning, Coins, Info, Bank } from '@phosphor-icons/react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import FinancialRegistrationModal from './FinancialRegistrationModal';

interface CreateRoomClientProps {
  matches: Match[];
  isFinancialRegistered: boolean;
}

export default function CreateRoomClient({ matches, isFinancialRegistered }: CreateRoomClientProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [entryFeeMode, setEntryFeeMode] = useState<'predefined' | 'custom'>('predefined');
  const [predefinedFee, setPredefinedFee] = useState<number>(10);
  const [customFee, setCustomFee] = useState('');
  const [activeViewTab, setActiveViewTab] = useState<'config' | 'rules'>('config');
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Inicia com todos os jogos selecionados por padrão
  const [selectedMatchIds, setSelectedMatchIds] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    matches.forEach((m) => {
      // Evita pré-selecionar jogos sem times definidos
      if (m.home_team !== 'A confirmar' && m.away_team !== 'A confirmar') {
        initial[m.id] = true;
      }
    });
    return initial;
  });

  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Agrupar partidas por Fase/Grupo
  const groupMatches = () => {
    const groups: Record<string, Match[]> = {};
    matches.forEach((m) => {
      const groupName = m.stage === 'Fase de Grupos' && m.group_name ? m.group_name : m.stage;
      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push(m);
    });
    return groups;
  };

  const matchesByGroup = groupMatches();

  const handleToggleMatch = (id: string) => {
    setSelectedMatchIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Funções de seleção global
  const selectAllMatches = () => {
    const next: Record<string, boolean> = {};
    matches.forEach((m) => {
      if (m.home_team !== 'A confirmar' && m.away_team !== 'A confirmar') {
        next[m.id] = true;
      }
    });
    setSelectedMatchIds(next);
  };

  const selectGroupStage = () => {
    const next: Record<string, boolean> = {};
    matches.forEach((m) => {
      if (m.stage === 'Fase de Grupos' && m.home_team !== 'A confirmar' && m.away_team !== 'A confirmar') {
        next[m.id] = true;
      }
    });
    setSelectedMatchIds(next);
  };

  const selectPlayoffs = () => {
    const next: Record<string, boolean> = {};
    matches.forEach((m) => {
      if (m.stage !== 'Fase de Grupos' && m.home_team !== 'A confirmar' && m.away_team !== 'A confirmar') {
        next[m.id] = true;
      }
    });
    setSelectedMatchIds(next);
  };

  const selectNone = () => {
    setSelectedMatchIds({});
  };

  const getFinalFeeValue = () => {
    if (entryFeeMode === 'predefined') return predefinedFee;
    const custom = parseFloat(customFee.replace(',', '.'));
    return isNaN(custom) || custom <= 0 ? 0 : custom;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const selectedIds = Object.keys(selectedMatchIds).filter((id) => selectedMatchIds[id]);
    if (selectedIds.length === 0) {
      setErrorMsg('Selecione pelo menos um jogo para sua sala.');
      return;
    }

    const feeValue = getFinalFeeValue();
    if (feeValue <= 0) {
      setErrorMsg('A taxa de entrada da sala deve ser maior que R$ 0,00.');
      return;
    }

    startTransition(async () => {
      const result = await createRoom(name, feeValue, selectedIds);
      if (!result.success) {
        setErrorMsg(result.error || 'Erro ao criar a sala.');
      } else {
        router.push(`/?tab=salas&roomId=${result.roomId}`);
        router.refresh();
      }
    });
  };

  const selectedCount = Object.values(selectedMatchIds).filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* Botão Voltar */}
      <button
        onClick={() => router.push('/')}
        className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-secondary hover:text-primary transition-colors cursor-pointer"
      >
        <ArrowLeft size={16} />
        Voltar para a Classificação
      </button>

      {/* Título da Página */}
      <div className="border-b border-border-custom/60 pb-5">
        <h1 className="text-2xl sm:text-4xl font-black text-primary uppercase tracking-wider flex items-center gap-3">
          <Trophy size={36} className="text-accent-custom" />
          Criar Novo Bolão
        </h1>
        <p className="text-xs sm:text-sm text-secondary mt-2 font-medium">
          Personalize as partidas, defina o valor do convite via Pix e dispute um ranking exclusivo com seus amigos.
        </p>
      </div>

      {/* Abas de Navegação */}
      <div className="flex border border-border-custom/50 bg-muted/40 p-1 rounded-2xl">
        <button
          type="button"
          onClick={() => setActiveViewTab('config')}
          className={`flex-grow py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer ${
            activeViewTab === 'config' ? 'bg-accent-custom text-slate-950 shadow-md' : 'text-secondary hover:text-primary'
          }`}
        >
          <SquaresFour size={16} />
          Configurar Bolão
        </button>
        <button
          type="button"
          onClick={() => setActiveViewTab('rules')}
          className={`flex-grow py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer ${
            activeViewTab === 'rules' ? 'bg-accent-custom text-slate-950 shadow-md' : 'text-secondary hover:text-primary'
          }`}
        >
          <Info size={16} />
          Como Funciona
        </button>
      </div>

      {activeViewTab === 'rules' && (
        <div className="bg-card border border-border-custom rounded-2xl p-6 shadow-xl space-y-6 animate-fadeIn">
          <h3 className="text-sm font-extrabold text-primary uppercase tracking-wider flex items-center gap-2 border-b border-border-custom/40 pb-3">
            <Info size={20} className="text-accent-custom" />
            Regulamento e Funcionamento das Salas
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-muted/20 border border-border-custom/40 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-accent-custom font-extrabold text-xs uppercase tracking-wider">
                <Trophy size={16} />
                Pontuação: Apenas Placar Exato
              </div>
              <p className="text-[11px] text-secondary leading-relaxed font-semibold">
                Nas salas privadas, a única pontuação válida é o acerto exato do placar final de um jogo (vale 3 pontos). Acertos parciais (apenas o vencedor ou empates não exatos) valem 0 pontos.
              </p>
            </div>

            <div className="p-4 bg-muted/20 border border-border-custom/40 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-accent-custom font-extrabold text-xs uppercase tracking-wider">
                <Coins size={16} />
                Divisão de Prêmios (80%)
              </div>
              <p className="text-[11px] text-secondary leading-relaxed font-semibold">
                Do total arrecadado com as taxas de inscrição pagas pelos participantes, 80% é integralmente destinado à premiação dos ganhadores. Os 20% restantes cobrem as taxas de operação e administrativas.
              </p>
            </div>

            <div className="p-4 bg-muted/20 border border-border-custom/40 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-accent-custom font-extrabold text-xs uppercase tracking-wider">
                <CheckCircle size={16} />
                Ganhador do Bolão
              </div>
              <p className="text-[11px] text-secondary leading-relaxed font-semibold">
                O prêmio acumulado de 80% é dividido em partes iguais entre todos os participantes da sala que terminarem empatados na primeira posição do ranking ao final do bolão, desde que tenham acumulado pontos (&gt; 0).
              </p>
            </div>

            <div className="p-4 bg-muted/20 border border-border-custom/40 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-accent-custom font-extrabold text-xs uppercase tracking-wider">
                <Warning size={16} />
                Acúmulo para o Criador
              </div>
              <p className="text-[11px] text-secondary leading-relaxed font-semibold">
                Se nenhum participante da sala conseguir acertar qualquer placar exato ao final do bolão, não haverá vencedores e a premiação total acumulada (80%) será automaticamente revertida para o saldo do criador/dono da sala.
              </p>
            </div>
          </div>
        </div>
      )}

      {activeViewTab === 'config' && (
        !isFinancialRegistered ? (
          <div className="bg-card border border-border-custom rounded-2xl p-6 text-center shadow-xl space-y-5 animate-fadeIn select-none">
            <div className="w-16 h-16 bg-accent-custom/10 text-accent-custom border border-accent-custom/20 rounded-full flex items-center justify-center text-3xl mx-auto shadow-inner">
              <Bank size={32} />
            </div>
            <div className="max-w-md mx-auto space-y-2">
              <h3 className="text-base font-black text-primary uppercase tracking-wider">
                Cadastro de Recebimento Requerido
              </h3>
              <p className="text-xs text-secondary leading-relaxed font-semibold">
                Para criar novos bolões privados, receber taxas de inscrição dos participantes e transferir seus lucros, você precisa concluir seu cadastro financeiro.
              </p>
            </div>
            <div>
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="min-h-[44px] px-6 bg-accent-custom hover:bg-accent-hover text-slate-950 text-xs font-black uppercase tracking-wider rounded-xl shadow-md transition-all inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                Concluir Cadastro de Recebimento
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-8">
          {/* Card Informações Básicas */}
          <div className="bg-card border border-border-custom rounded-2xl p-5 sm:p-6 space-y-6 shadow-xl relative overflow-hidden">
            <h3 className="text-xs font-black uppercase tracking-wider text-secondary flex items-center gap-2 border-b border-border-custom/40 pb-3">
              <SquaresFour size={16} className="text-accent-custom" />
              Configurações Gerais
            </h3>

            {/* Nome da Sala */}
            <div className="space-y-2">
              <label className="text-xs font-extrabold text-primary uppercase tracking-wider block">
                Nome da Sala / Grupo
              </label>
              <input
                type="text"
                required
                disabled={isPending}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Amigos do Futebol, Bolão da Firma"
                className="w-full h-12 px-4 bg-base border border-border-custom focus:border-accent-custom text-primary text-sm rounded-xl focus:outline-none transition-colors disabled:opacity-50 font-semibold"
              />
            </div>

            {/* Valor de Aposta (Pix) */}
            <div className="space-y-3">
              <label className="text-xs font-extrabold text-primary uppercase tracking-wider block">
                Taxa de Entrada (Aposta em R$)
              </label>

              {/* Abas de Escolha de Modo de Custo */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-muted/40 border border-border-custom/50 rounded-xl">
                <button
                  type="button"
                  onClick={() => setEntryFeeMode('predefined')}
                  className={`py-2 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                    entryFeeMode === 'predefined' ? 'bg-accent-custom text-slate-950' : 'text-secondary hover:text-primary'
                  }`}
                >
                  Valores Fixos
                </button>
                <button
                  type="button"
                  onClick={() => setEntryFeeMode('custom')}
                  className={`py-2 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                    entryFeeMode === 'custom' ? 'bg-accent-custom text-slate-950' : 'text-secondary hover:text-primary'
                  }`}
                >
                  Personalizado
                </button>
              </div>

              {/* Detalhes de Valores */}
              {entryFeeMode === 'predefined' && (
                <div className="flex gap-2.5 flex-wrap pt-1">
                  {[5, 10, 20, 50].map((fee) => (
                    <button
                      key={fee}
                      type="button"
                      onClick={() => setPredefinedFee(fee)}
                      className={`h-10 px-4 rounded-xl text-xs font-black uppercase tracking-wider border transition-all cursor-pointer flex items-center gap-1.5 ${
                        predefinedFee === fee
                          ? 'bg-accent-custom/15 text-accent-custom border-accent-custom'
                          : 'bg-base border-border-custom text-secondary hover:text-primary'
                      }`}
                    >
                      <Coins size={14} />
                      R$ {fee.toFixed(2)}
                    </button>
                  ))}
                </div>
              )}

              {entryFeeMode === 'custom' && (
                <div className="relative w-full sm:w-48 pt-1">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-secondary text-sm font-bold">
                    R$
                  </span>
                  <input
                    type="text"
                    required={entryFeeMode === 'custom'}
                    disabled={isPending}
                    value={customFee}
                    onChange={(e) => setCustomFee(e.target.value)}
                    placeholder="15,00"
                    className="w-full h-11 pl-9 pr-4 bg-base border border-border-custom focus:border-accent-custom text-primary text-sm rounded-xl focus:outline-none transition-colors font-semibold"
                  />
                </div>
              )}

              {/* Aviso de Pix */}
              <div className="flex items-start gap-2.5 bg-accent-custom/5 border border-accent-custom/25 rounded-xl p-3.5 text-accent-custom text-xs font-medium mt-3">
                <CheckCircle size={18} className="shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Os convidados precisarão pagar o valor de{' '}
                  <span className="font-extrabold">R$ {getFinalFeeValue().toFixed(2)}</span> via Pix (QR Code/Copia e Cola gerados automaticamente no app) para que seus palpites pontuem e apareçam no ranking desta sala.
                </p>
              </div>
            </div>
          </div>

          {/* Seleção de Jogos */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-custom/40 pb-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-secondary flex items-center gap-2">
                Selecione as Partidas ({selectedCount} de {matches.length})
              </h3>
              {/* Atalhos Rápidos */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={selectAllMatches}
                  className="px-2.5 py-1 text-[9px] font-black uppercase tracking-wider bg-muted hover:bg-muted/80 text-primary border border-border-custom/60 rounded-md transition-colors cursor-pointer"
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={selectGroupStage}
                  className="px-2.5 py-1 text-[9px] font-black uppercase tracking-wider bg-muted hover:bg-muted/80 text-primary border border-border-custom/60 rounded-md transition-colors cursor-pointer"
                >
                  Fase de Grupos
                </button>
                <button
                  type="button"
                  onClick={selectPlayoffs}
                  className="px-2.5 py-1 text-[9px] font-black uppercase tracking-wider bg-muted hover:bg-muted/80 text-primary border border-border-custom/60 rounded-md transition-colors cursor-pointer"
                >
                  Mata-Mata
                </button>
                <button
                  type="button"
                  onClick={selectNone}
                  className="px-2.5 py-1 text-[9px] font-black uppercase tracking-wider bg-muted hover:bg-muted/80 text-primary border border-border-custom/60 rounded-md transition-colors cursor-pointer"
                >
                  Nenhum
                </button>
              </div>
            </div>

            {/* Listagem de Partidas Agrupadas */}
            <div className="space-y-6 max-h-[500px] overflow-y-auto pr-1 border border-border-custom/40 rounded-2xl p-4 bg-muted/10">
              {Object.entries(matchesByGroup).map(([groupName, groupMatches]) => (
                <div key={groupName} className="space-y-2.5">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-secondary select-none border-l-2 border-l-accent-custom pl-2 bg-muted/30 py-1 rounded-r-md">
                    {groupName}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {groupMatches.map((match) => {
                      const isSelected = !!selectedMatchIds[match.id];
                      const isUndecided = match.home_team === 'A confirmar' || match.away_team === 'A confirmar';
                      
                      return (
                        <div
                          key={match.id}
                          onClick={() => !isUndecided && handleToggleMatch(match.id)}
                          className={`p-3 border rounded-xl flex items-center justify-between gap-3 transition-all duration-200 ${
                            isUndecided 
                              ? 'opacity-40 cursor-not-allowed bg-muted/20 border-border-custom/40' 
                              : 'cursor-pointer hover:border-accent-custom/50'
                          } ${
                            isSelected && !isUndecided
                              ? 'bg-accent-custom/5 border-accent-custom/60'
                              : 'bg-card border-border-custom'
                          }`}
                        >
                          <div className="flex flex-col min-w-0 flex-grow">
                            <div className="flex items-center gap-1.5 font-bold text-xs text-primary min-w-0">
                              <span className="shrink-0 text-base">{match.home_flag}</span>
                              <span className="truncate">{match.home_team}</span>
                              <span className="text-secondary select-none font-medium px-1">vs</span>
                              <span className="shrink-0 text-base">{match.away_flag}</span>
                              <span className="truncate">{match.away_team}</span>
                            </div>
                            <span className="text-[9px] text-secondary font-bold uppercase tracking-wider mt-1 select-none">
                              {format(new Date(match.match_time), "dd 'de' MMM, HH:mm", { locale: ptBR })}
                            </span>
                          </div>

                          {/* Check Icon */}
                          {!isUndecided && (
                            <div className="shrink-0">
                              {isSelected ? (
                                <CheckCircle size={20} weight="fill" className="text-accent-custom" />
                              ) : (
                                <Circle size={20} className="text-border-custom hover:text-secondary" />
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {errorMsg && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold rounded-xl p-3.5 text-center flex items-center justify-center gap-2">
              <Warning size={16} />
              {errorMsg}
            </div>
          )}

          {/* Botão de Criação */}
          <button
            type="submit"
            disabled={isPending || !name}
            className="w-full h-12 flex items-center justify-center gap-2 bg-gradient-to-r from-accent-custom to-accent-hover text-slate-950 text-sm font-extrabold uppercase tracking-wider rounded-xl shadow-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {isPending ? 'Criando Sala...' : 'Criar Sala e Gerar Convite'}
          </button>
          </form>
        )
      )}

      <FinancialRegistrationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => {
          router.refresh();
        }}
      />
    </div>
  );
}
