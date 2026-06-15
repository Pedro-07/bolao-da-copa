'use client';

import React, { useState, useEffect } from 'react';
import { saveFinancialProfile } from '@/app/actions';
import { Bank, Warning, CheckCircle, ShieldCheck, Spinner } from '@phosphor-icons/react';

interface FinancialRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function FinancialRegistrationModal({
  isOpen,
  onClose,
  onSuccess,
}: FinancialRegistrationModalProps) {
  const [fullName, setFullName] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [phone, setPhone] = useState('');
  const [pixKeyType, setPixKeyType] = useState<'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP'>('CPF');
  const [pixKey, setPixKey] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Auto-fill Pix Key if type matches Document/Phone to save time for user
  useEffect(() => {
    if (pixKeyType === 'CPF' || pixKeyType === 'CNPJ') {
      setPixKey(cpfCnpj);
    } else if (pixKeyType === 'PHONE') {
      setPixKey(phone);
    } else {
      setPixKey('');
    }
  }, [pixKeyType, cpfCnpj, phone]);

  if (!isOpen) return null;

  // Mask Formatters
  const formatCpfCnpj = (value: string) => {
    const clean = value.replace(/\D/g, '');
    if (clean.length <= 11) {
      // CPF Mask: 000.000.000-00
      return clean
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    } else {
      // CNPJ Mask: 00.000.000/0000-00
      return clean
        .substring(0, 14)
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
    }
  };

  const formatPhone = (value: string) => {
    const clean = value.replace(/\D/g, '').substring(0, 11);
    if (clean.length <= 10) {
      // (00) 0000-0000
      return clean
        .replace(/^(\d{2})(\d)/g, '($1) $2')
        .replace(/(\d{4})(\d)/g, '$1-$2');
    } else {
      // (00) 00000-0000
      return clean
        .replace(/^(\d{2})(\d)/g, '($1) $2')
        .replace(/(\d{5})(\d)/g, '$1-$2');
    }
  };

  const handleCpfCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCpfCnpj(formatCpfCnpj(e.target.value));
  };

  const handleFullNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Permite apenas letras (incluindo acentuadas) e espaços
    const filtered = e.target.value.replace(/[^a-zA-ZÀ-ÿ\s]/g, '');
    setFullName(filtered);
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhone(e.target.value));
  };

  const handlePixKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    if (pixKeyType === 'PHONE') {
      val = formatPhone(val);
    }
    setPixKey(val);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await saveFinancialProfile({
        fullName,
        cpfCnpj,
        birthDate,
        phone,
        pixKeyType,
        pixKey,
      });

      if (res.success) {
        setSuccess(true);
        setTimeout(() => {
          if (onSuccess) onSuccess();
          onClose();
        }, 2000);
      } else {
        setError(res.error || 'Erro ao salvar cadastro.');
      }
    } catch (err: any) {
      setError(err.message || 'Erro inesperado.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-card border border-border-custom rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-accent-custom/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center gap-3 border-b border-border-custom/40 pb-4 mb-4 select-none">
          <div className="w-10 h-10 rounded-xl bg-accent-custom/10 text-accent-custom border border-accent-custom/20 flex items-center justify-center">
            <ShieldCheck size={24} />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-black text-primary uppercase tracking-wider">
              Cadastro de Recebimento
            </h3>
            <p className="text-[10px] sm:text-xs text-secondary font-semibold">
              Obrigatório para criação de salas e recebimento de prêmios/comissões.
            </p>
          </div>
        </div>

        {success ? (
          <div className="space-y-4 py-8 text-center select-none animate-scaleUp">
            <div className="w-14 h-14 bg-green-500/10 text-green-500 border border-green-500/20 rounded-full flex items-center justify-center text-2xl mx-auto shadow-inner">
              ✓
            </div>
            <h4 className="font-extrabold text-primary text-sm uppercase tracking-wider">
              Cadastro Concluído com Sucesso!
            </h4>
            <p className="text-xs text-secondary font-semibold">
              Suas informações foram validadas e registradas. Liberando acesso...
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {/* Nome Completo */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-secondary">
                Nome Completo (Conforme Receita Federal)
              </label>
              <input
                type="text"
                required
                disabled={loading}
                placeholder="Ex: João Silva de Souza"
                value={fullName}
                onChange={handleFullNameChange}
                className="w-full h-11 px-3 bg-muted border border-border-custom rounded-xl text-primary font-semibold focus:outline-none focus:border-accent-custom transition-all"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* CPF / CNPJ */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-secondary">
                  CPF ou CNPJ
                </label>
                <input
                  type="text"
                  required
                  disabled={loading}
                  inputMode="numeric"
                  placeholder="Ex: 000.000.000-00"
                  value={cpfCnpj}
                  onChange={handleCpfCnpjChange}
                  className="w-full h-11 px-3 bg-muted border border-border-custom rounded-xl text-primary font-semibold focus:outline-none focus:border-accent-custom transition-all"
                />
              </div>

              {/* Data de Nascimento */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-secondary">
                  Data de Nascimento (18+ Anos)
                </label>
                <input
                  type="date"
                  required
                  disabled={loading}
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="w-full h-11 px-3 bg-muted border border-border-custom rounded-xl text-primary font-semibold focus:outline-none focus:border-accent-custom transition-all"
                />
              </div>
            </div>

            {/* Telefone */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-secondary">
                Telefone Celular (com DDD)
              </label>
              <input
                type="text"
                required
                disabled={loading}
                inputMode="numeric"
                placeholder="Ex: (11) 99999-9999"
                value={phone}
                onChange={handlePhoneChange}
                className="w-full h-11 px-3 bg-muted border border-border-custom rounded-xl text-primary font-semibold focus:outline-none focus:border-accent-custom transition-all"
              />
            </div>

            <div className="border-t border-border-custom/40 pt-4 mt-4 space-y-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-secondary block">
                Dados da Chave Pix para Recebimento
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Tipo de Chave */}
                <div className="sm:col-span-1 space-y-1.5">
                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-secondary">
                    Tipo de Chave
                  </label>
                  <select
                    value={pixKeyType}
                    onChange={(e) => setPixKeyType(e.target.value as any)}
                    className="w-full h-11 px-2 bg-muted border border-border-custom rounded-xl text-primary font-semibold focus:outline-none focus:border-accent-custom cursor-pointer"
                  >
                    <option value="CPF">CPF</option>
                    <option value="CNPJ">CNPJ</option>
                    <option value="EMAIL">E-mail</option>
                    <option value="PHONE">Telefone</option>
                    <option value="EVP">Chave Aleatória</option>
                  </select>
                </div>

                {/* Chave Pix */}
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-secondary">
                    Chave Pix
                  </label>
                  <input
                    type="text"
                    required
                    disabled={loading || pixKeyType === 'CPF' || pixKeyType === 'CNPJ'}
                    inputMode={pixKeyType === 'PHONE' ? 'numeric' : 'text'}
                    placeholder={
                      pixKeyType === 'EMAIL'
                        ? 'Ex: seuemail@provedor.com'
                        : pixKeyType === 'PHONE'
                        ? 'Ex: (11) 99999-9999'
                        : pixKeyType === 'EVP'
                        ? 'Ex: 123e4567-e89b-12d3-a456-426614174000'
                        : 'Preenchido automaticamente'
                    }
                    value={pixKey}
                    onChange={handlePixKeyChange}
                    className="w-full h-11 px-3 bg-muted border border-border-custom rounded-xl text-primary font-semibold focus:outline-none focus:border-accent-custom transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 text-red-500 border border-red-500/20 text-xs font-bold rounded-xl flex items-center gap-2 select-none animate-fadeIn">
                <Warning size={16} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex gap-3 pt-3">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="flex-1 h-11 bg-muted hover:bg-border-custom/40 text-primary text-xs font-bold uppercase tracking-wider rounded-xl border border-border-custom transition-all cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 h-11 bg-accent-custom hover:bg-accent-hover text-slate-950 text-xs font-black uppercase tracking-wider rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {loading ? <Spinner size={16} className="animate-spin" /> : 'Salvar Cadastro'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
