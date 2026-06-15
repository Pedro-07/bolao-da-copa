'use client';

import React, { useState } from 'react';
import { requestWithdrawal } from '@/app/actions';
import { Calendar, CheckCircle, XCircle, Clock, Bank, ArrowUpRight, ArrowDownLeft } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import FinancialRegistrationModal from './FinancialRegistrationModal';

interface Transaction {
  id: string;
  amount: number;
  type: 'commission' | 'prize_win' | 'withdrawal' | 'refund' | 'admin_adjustment';
  description: string;
  created_at: string;
}

interface Withdrawal {
  id: string;
  amount: number;
  pix_key_type: string;
  pix_key: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

interface FinancialProfileClientProps {
  initialBalance: number;
  transactions: Transaction[];
  withdrawals: Withdrawal[];
  isFinancialRegistered: boolean;
  fullName: string;
  cpfCnpj: string;
  birthDate: string;
  phone: string;
  pixKeyType: 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP';
  pixKey: string;
}

export default function FinancialProfileClient({
  initialBalance,
  transactions,
  withdrawals,
  isFinancialRegistered,
  fullName,
  cpfCnpj,
  birthDate,
  phone,
  pixKeyType: initialPixKeyType,
  pixKey: initialPixKey,
}: FinancialProfileClientProps) {
  const router = useRouter();
  const [balance, setBalance] = useState(initialBalance);
  const [activeTab, setActiveTab] = useState<'extract' | 'withdrawals'>('extract');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRegModalOpen, setIsRegModalOpen] = useState(false);
  
  // Form state
  const [amount, setAmount] = useState('');
  const [pixKeyType, setPixKeyType] = useState<'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP'>(initialPixKeyType);
  const [pixKey, setPixKey] = useState(initialPixKey);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Local copy of transactions/withdrawals for instant UI update
  const [localTxList, setLocalTxList] = useState<Transaction[]>(transactions);
  const [localWithdrawals, setLocalWithdrawals] = useState<Withdrawal[]>(withdrawals);

  const handleOpenModal = () => {
    if (!isFinancialRegistered) {
      setIsRegModalOpen(true);
      return;
    }
    setIsModalOpen(true);
    setAmount('');
    setPixKeyType(initialPixKeyType);
    setPixKey(initialPixKey);
    setError(null);
    setSuccess(false);
  };

  const handleRequestWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);

    const val = Number(amount.replace(',', '.'));
    if (isNaN(val) || val <= 0) {
      setError('Por favor, informe um valor de saque válido.');
      setLoading(false);
      return;
    }

    if (val > balance) {
      setError('Saldo insuficiente para realizar este saque.');
      setLoading(false);
      return;
    }

    if (!pixKey.trim()) {
      setError('Por favor, informe a chave Pix.');
      setLoading(false);
      return;
    }

    try {
      const res = await requestWithdrawal(val, pixKeyType, pixKey);
      if (res.success) {
        setSuccess(true);
        const newBal = balance - val;
        setBalance(newBal);
        
        // Add locally
        const newWithdrawalId = Math.random().toString();
        const newW: Withdrawal = {
          id: newWithdrawalId,
          amount: val,
          pix_key_type: pixKeyType,
          pix_key: pixKey.trim(),
          status: 'pending',
          created_at: new Date().toISOString(),
        };

        const newTx: Transaction = {
          id: Math.random().toString(),
          amount: -val,
          type: 'withdrawal',
          description: `Saque solicitado (Pix: ${pixKeyType} - ${pixKey.trim()})`,
          created_at: new Date().toISOString(),
        };

        setLocalWithdrawals([newW, ...localWithdrawals]);
        setLocalTxList([newTx, ...localTxList]);

        setTimeout(() => {
          setIsModalOpen(false);
        }, 2000);
      } else {
        setError(res.error || 'Erro ao processar saque.');
      }
    } catch (err: any) {
      setError(err.message || 'Erro inesperado.');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val);
  };

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Cadastro Financeiro Section */}
      <div className="bg-card border border-border-custom rounded-2xl p-5 sm:p-6 relative overflow-hidden shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-6 select-none">
        <div className="absolute top-0 right-0 w-32 h-32 bg-accent-custom/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="space-y-2">
          <h3 className="text-xs font-black uppercase tracking-wider text-secondary flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${isFinancialRegistered ? 'bg-accent-custom' : 'bg-amber-500'} animate-pulse`} />
            Dados de Recebimento
          </h3>
          {isFinancialRegistered ? (
            <div className="space-y-1">
              <p className="text-sm font-extrabold text-primary uppercase">
                {fullName}
              </p>
              <p className="text-[11px] text-secondary font-bold">
                CPF/CNPJ: <span className="text-primary font-mono">{cpfCnpj.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.***.***-$4")}</span>
              </p>
              <p className="text-[11px] text-secondary font-bold">
                Chave Pix ({pixKeyType}): <span className="text-primary font-mono select-all">{pixKey}</span>
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-xs font-bold text-amber-500">
                Cadastro Financeiro Não Concluído
              </p>
              <p className="text-[10px] text-secondary font-semibold">
                Você precisa preencher seu cadastro de pagamento para poder criar bolões e solicitar saques.
              </p>
            </div>
          )}
        </div>

        <div className="shrink-0">
          <button
            onClick={() => setIsRegModalOpen(true)}
            className="min-h-[40px] px-5 bg-muted hover:bg-border-custom text-primary text-xs font-bold uppercase tracking-wider rounded-xl border border-border-custom transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            {isFinancialRegistered ? 'Atualizar Cadastro' : 'Cadastrar Conta Pix'}
          </button>
        </div>
      </div>
      {/* Cards Financeiros */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Card Saldo Principal */}
        <div className="bg-card border border-border-custom rounded-2xl p-6 relative overflow-hidden shadow-lg flex flex-col justify-between min-h-[160px]">
          <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/5 rounded-full blur-2xl pointer-events-none" />
          <div>
            <span className="text-secondary text-[10px] font-black uppercase tracking-wider block">
              Saldo Disponível
            </span>
            <span className="text-3xl font-black text-green-500 tracking-wider mt-1 block">
              {formatCurrency(balance)}
            </span>
          </div>
          <div className="mt-4">
            <button
              onClick={handleOpenModal}
              disabled={balance <= 0}
              className={`w-full min-h-[44px] flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${
                balance > 0
                  ? 'bg-green-500 hover:bg-green-600 text-slate-950 shadow-md cursor-pointer'
                  : 'bg-muted text-secondary border border-border-custom/50 cursor-not-allowed'
              }`}
            >
              <Bank size={16} />
              Solicitar Saque Pix
            </button>
          </div>
        </div>

        {/* Card Outros Detalhes */}
        <div className="bg-card border border-border-custom rounded-2xl p-6 relative overflow-hidden shadow-lg flex flex-col justify-between min-h-[160px]">
          <div className="absolute top-0 right-0 w-24 h-24 bg-accent-custom/5 rounded-full blur-2xl pointer-events-none" />
          <div className="space-y-4">
            <div>
              <span className="text-secondary text-[10px] font-black uppercase tracking-wider block">
                Comissões Acumuladas
              </span>
              <span className="text-lg font-black text-primary tracking-wider mt-0.5 block">
                {formatCurrency(
                  localTxList
                    .filter((t) => t.type === 'commission')
                    .reduce((acc, curr) => acc + curr.amount, 0)
                )}
              </span>
            </div>
            <div className="border-t border-border-custom/40 pt-3 flex justify-between items-center">
              <div>
                <span className="text-secondary text-[9px] font-bold uppercase tracking-wider block">
                  Saques Pendentes
                </span>
                <span className="text-sm font-extrabold text-amber-500 mt-0.5 block">
                  {formatCurrency(
                    localWithdrawals
                      .filter((w) => w.status === 'pending')
                      .reduce((acc, curr) => acc + curr.amount, 0)
                  )}
                </span>
              </div>
              <div>
                <span className="text-secondary text-[9px] font-bold uppercase tracking-wider block">
                  Prêmios de Sala
                </span>
                <span className="text-sm font-extrabold text-accent-custom mt-0.5 block">
                  {formatCurrency(
                    localTxList
                      .filter((t) => t.type === 'prize_win')
                      .reduce((acc, curr) => acc + curr.amount, 0)
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs de Extrato e Saques */}
      <div className="bg-card border border-border-custom rounded-2xl p-6 shadow-xl">
        <div className="flex border-b border-border-custom/60 pb-3 gap-4 mb-5">
          <button
            onClick={() => setActiveTab('extract')}
            className={`pb-1 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
              activeTab === 'extract'
                ? 'border-accent-custom text-primary'
                : 'border-transparent text-secondary hover:text-primary'
            }`}
          >
            Extrato Financeiro
          </button>
          <button
            onClick={() => setActiveTab('withdrawals')}
            className={`pb-1 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
              activeTab === 'withdrawals'
                ? 'border-accent-custom text-primary'
                : 'border-transparent text-secondary hover:text-primary'
            }`}
          >
            Histórico de Saques
          </button>
        </div>

        {/* Conteúdo Aba 1: Extrato */}
        {activeTab === 'extract' && (
          <div className="space-y-3">
            {localTxList.length === 0 ? (
              <div className="text-center py-8 text-secondary text-xs font-semibold">
                Nenhuma movimentação financeira encontrada.
              </div>
            ) : (
              localTxList.map((tx) => {
                const isPositive = tx.amount > 0;
                return (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-muted/40 border border-border-custom/40 hover:border-border-custom/80 transition-all text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center border shrink-0 ${
                          isPositive
                            ? 'bg-green-500/10 text-green-500 border-green-500/20'
                            : 'bg-red-500/10 text-red-500 border-red-500/20'
                        }`}
                      >
                        {isPositive ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                      </div>
                      <div>
                        <span className="font-extrabold text-primary block">
                          {tx.description}
                        </span>
                        <span className="text-[10px] text-secondary font-bold block mt-0.5">
                          {formatDate(tx.created_at)}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`font-black tracking-wider text-sm ${
                        isPositive ? 'text-green-500' : 'text-primary'
                      }`}
                    >
                      {isPositive ? '+' : ''}
                      {formatCurrency(tx.amount)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Conteúdo Aba 2: Saques */}
        {activeTab === 'withdrawals' && (
          <div className="space-y-3">
            {localWithdrawals.length === 0 ? (
              <div className="text-center py-8 text-secondary text-xs font-semibold">
                Nenhuma solicitação de saque Pix cadastrada.
              </div>
            ) : (
              localWithdrawals.map((w) => {
                const badgeColor =
                  w.status === 'approved'
                    ? 'text-green-500 bg-green-500/10 border-green-500/20'
                    : w.status === 'rejected'
                    ? 'text-red-500 bg-red-500/10 border-red-500/20'
                    : 'text-amber-500 bg-amber-500/10 border-amber-500/20';

                const statusLabel =
                  w.status === 'approved'
                    ? 'Aprovado'
                    : w.status === 'rejected'
                    ? 'Rejeitado'
                    : 'Pendente';

                const statusIcon =
                  w.status === 'approved' ? (
                    <CheckCircle size={12} />
                  ) : w.status === 'rejected' ? (
                    <XCircle size={12} />
                  ) : (
                    <Clock size={12} />
                  );

                return (
                  <div
                    key={w.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl bg-muted/40 border border-border-custom/40 hover:border-border-custom/80 transition-all gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-primary">
                          {formatCurrency(w.amount)}
                        </span>
                        <span className="text-[10px] text-secondary font-black bg-muted px-1.5 py-0.5 rounded uppercase">
                          {w.pix_key_type}
                        </span>
                      </div>
                      <span className="text-[10px] text-secondary font-bold block select-all">
                        Chave: {w.pix_key}
                      </span>
                      <span className="text-[9px] text-secondary block font-medium">
                        Solicitado em {formatDate(w.created_at)}
                      </span>
                    </div>

                    <div className="flex items-center sm:justify-end">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider ${badgeColor}`}
                      >
                        {statusIcon}
                        {statusLabel}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Modal Solicitação de Saque */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-base-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border-custom rounded-2xl max-w-md w-full p-6 shadow-2xl relative animate-scaleUp">
            <h3 className="text-lg font-black text-primary uppercase tracking-wider mb-4 flex items-center gap-2">
              <Bank size={20} className="text-green-500" />
              Solicitar Saque Pix
            </h3>

            {success ? (
              <div className="space-y-4 py-6 text-center">
                <div className="w-12 h-12 bg-green-500/10 text-green-500 border border-green-500/20 rounded-full flex items-center justify-center text-xl mx-auto">
                  ✓
                </div>
                <h4 className="font-extrabold text-primary text-sm uppercase">
                  Solicitação Enviada!
                </h4>
                <p className="text-xs text-secondary">
                  Seu saque foi registrado e será processado pelo administrador em breve.
                </p>
              </div>
            ) : (
              <form onSubmit={handleRequestWithdrawal} className="space-y-4">
                {/* Valor */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-secondary mb-1">
                    Valor do Saque (R$)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 50,00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full min-h-[48px] px-3.5 bg-muted border border-border-custom rounded-xl text-primary text-sm font-semibold focus:outline-none focus:border-accent-custom"
                  />
                  <span className="text-[10px] text-secondary mt-1 block">
                    Saldo disponível: {formatCurrency(balance)}
                  </span>
                </div>

                {/* Tipo de Chave */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-secondary mb-1">
                    Tipo de Chave Pix
                  </label>
                  <select
                    disabled={isFinancialRegistered}
                    value={pixKeyType}
                    onChange={(e) =>
                      setPixKeyType(e.target.value as any)
                    }
                    className="w-full min-h-[48px] px-3.5 bg-muted border border-border-custom rounded-xl text-primary text-sm font-semibold focus:outline-none focus:border-accent-custom disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="CPF">CPF</option>
                    <option value="CNPJ">CNPJ</option>
                    <option value="EMAIL">E-mail</option>
                    <option value="PHONE">Telefone</option>
                    <option value="EVP">Chave Aleatória (EVP)</option>
                  </select>
                </div>

                {/* Chave Pix */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-secondary mb-1">
                    Chave Pix
                  </label>
                  <input
                    type="text"
                    required
                    disabled={isFinancialRegistered}
                    placeholder="Digite sua chave Pix"
                    value={pixKey}
                    onChange={(e) => setPixKey(e.target.value)}
                    className="w-full min-h-[48px] px-3.5 bg-muted border border-border-custom rounded-xl text-primary text-sm font-semibold focus:outline-none focus:border-accent-custom disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  {isFinancialRegistered && (
                    <span className="text-[10px] text-secondary mt-1 block">
                      Utilizando sua chave Pix pré-cadastrada nas configurações de recebimento.
                    </span>
                  )}
                </div>

                {error && (
                  <div className="p-3 bg-red-500/10 text-red-500 border border-red-500/20 text-xs font-semibold rounded-xl">
                    {error}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    disabled={loading}
                    className="flex-1 min-h-[48px] bg-muted hover:bg-border-custom text-primary text-xs font-bold uppercase tracking-wider rounded-xl border border-border-custom transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 min-h-[48px] bg-green-500 hover:bg-green-600 text-slate-950 text-xs font-bold uppercase tracking-wider rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
                  >
                    {loading ? 'Processando...' : 'Confirmar'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <FinancialRegistrationModal
        isOpen={isRegModalOpen}
        onClose={() => setIsRegModalOpen(false)}
        onSuccess={() => {
          router.refresh();
        }}
      />
    </div>
  );
}
