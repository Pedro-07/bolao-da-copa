-- Script de Migração: Infraestrutura Financeira (Saldo, Comissões e Saques)

-- 1. Estender public.profiles com coluna de saldo
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS balance numeric(10, 2) DEFAULT 0.00 NOT NULL;

-- 2. Estender public.rooms com colunas de taxas e finalização
ALTER TABLE public.rooms 
ADD COLUMN IF NOT EXISTS creator_commission_percent numeric(5, 2) DEFAULT 10.00 NOT NULL,
ADD COLUMN IF NOT EXISTS platform_fee_percent numeric(5, 2) DEFAULT 5.00 NOT NULL,
ADD COLUMN IF NOT EXISTS finalized boolean DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS finalized_at timestamptz;

-- 3. Criar tabela public.withdrawals para solicitação de saques
CREATE TABLE IF NOT EXISTS public.withdrawals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    amount numeric(10, 2) NOT NULL CHECK (amount > 0),
    pix_key_type text NOT NULL CHECK (pix_key_type IN ('CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP')),
    pix_key text NOT NULL,
    status text DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- 4. Criar tabela public.transactions para extrato financeiro (auditabilidade)
CREATE TABLE IF NOT EXISTS public.transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    amount numeric(10, 2) NOT NULL,
    type text NOT NULL CHECK (type IN ('commission', 'prize_win', 'withdrawal', 'refund', 'admin_adjustment')),
    description text NOT NULL,
    reference_id uuid,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- Habilitar RLS nas novas tabelas
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- 5. Políticas de RLS para public.withdrawals
DROP POLICY IF EXISTS "Users can view their own withdrawals" ON public.withdrawals;
CREATE POLICY "Users can view their own withdrawals"
    ON public.withdrawals
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can request their own withdrawals" ON public.withdrawals;
CREATE POLICY "Users can request their own withdrawals"
    ON public.withdrawals
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all withdrawals" ON public.withdrawals;
CREATE POLICY "Admins can view all withdrawals"
    ON public.withdrawals
    FOR SELECT
    TO authenticated
    USING (auth.jwt() ->> 'email' = 'pphenriquelim4@gmail.com' OR auth.jwt() ->> 'email' = 'developer.teles@gmail.com');

DROP POLICY IF EXISTS "Admins can update all withdrawals" ON public.withdrawals;
CREATE POLICY "Admins can update all withdrawals"
    ON public.withdrawals
    FOR UPDATE
    TO authenticated
    USING (auth.jwt() ->> 'email' = 'pphenriquelim4@gmail.com' OR auth.jwt() ->> 'email' = 'developer.teles@gmail.com')
    WITH CHECK (auth.jwt() ->> 'email' = 'pphenriquelim4@gmail.com' OR auth.jwt() ->> 'email' = 'developer.teles@gmail.com');

-- 6. Políticas de RLS para public.transactions
DROP POLICY IF EXISTS "Users can view their own transactions" ON public.transactions;
CREATE POLICY "Users can view their own transactions"
    ON public.transactions
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all transactions" ON public.transactions;
CREATE POLICY "Admins can view all transactions"
    ON public.transactions
    FOR SELECT
    TO authenticated
    USING (auth.jwt() ->> 'email' = 'pphenriquelim4@gmail.com' OR auth.jwt() ->> 'email' = 'developer.teles@gmail.com');
