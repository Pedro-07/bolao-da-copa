-- Script de Correção Consolidada: Permissões de RLS Dinâmicas e Trigger de Novo Usuário
-- Execute este script no SQL Editor do seu Supabase para aplicar as correções.

-- 1. Criar a coluna is_admin se ela não existir
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;

-- 2. Criar função auxiliar para checar se um usuário é administrador de forma segura
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = p_user_id AND is_admin = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Dar permissão de execução
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO anon;

-- 3. Consolidar a trigger de novo usuário para definir admin e recalcular ranking
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.profiles (id, name, is_admin, created_at)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
        (new.email = 'pphenriquelim4@gmail.com'),
        new.created_at
    );
    -- Recalcula posições após a inserção do novo participante
    PERFORM public.recalculate_ranking();
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Garante que o usuário admin atual tenha a flag de admin (caso já esteja registrado)
UPDATE public.profiles p
SET is_admin = true
FROM auth.users u
WHERE p.id = u.id AND u.email = 'pphenriquelim4@gmail.com';

-- 4. Refatorar as políticas de RLS para a tabela MATCHES (Substituindo email hardcodado)
DROP POLICY IF EXISTS "Admins podem atualizar partidas" ON public.matches;
CREATE POLICY "Admins podem atualizar partidas"
    ON public.matches
    FOR UPDATE
    TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins podem inserir partidas" ON public.matches;
CREATE POLICY "Admins podem inserir partidas"
    ON public.matches
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins podem deletar partidas" ON public.matches;
CREATE POLICY "Admins podem deletar partidas"
    ON public.matches
    FOR DELETE
    TO authenticated
    USING (public.is_admin(auth.uid()));

-- 5. Refatorar as políticas de RLS para a tabela WITHDRAWALS (Substituindo emails hardcodados)
DROP POLICY IF EXISTS "Admins can view all withdrawals" ON public.withdrawals;
CREATE POLICY "Admins can view all withdrawals"
    ON public.withdrawals
    FOR SELECT
    TO authenticated
    USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update all withdrawals" ON public.withdrawals;
CREATE POLICY "Admins can update all withdrawals"
    ON public.withdrawals
    FOR UPDATE
    TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));

-- 6. Refatorar as políticas de RLS para a tabela TRANSACTIONS (Substituindo emails hardcodados)
DROP POLICY IF EXISTS "Admins can view all transactions" ON public.transactions;
CREATE POLICY "Admins can view all transactions"
    ON public.transactions
    FOR SELECT
    TO authenticated
    USING (public.is_admin(auth.uid()));

-- 7. Criar função RPC para decrementar saldo de forma atômica (Evita Race Condition no saque)
CREATE OR REPLACE FUNCTION public.decrement_balance(p_user_id uuid, p_amount numeric)
RETURNS boolean AS $$
DECLARE
    v_updated_rows int;
BEGIN
    UPDATE public.profiles
    SET balance = balance - p_amount
    WHERE id = p_user_id AND balance >= p_amount;
    
    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
    RETURN v_updated_rows > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.decrement_balance(uuid, numeric) TO authenticated;

-- 8. Criar função RPC para incrementar saldo de forma atômica
CREATE OR REPLACE FUNCTION public.increment_balance(p_user_id uuid, p_amount numeric)
RETURNS void AS $$
BEGIN
    UPDATE public.profiles
    SET balance = balance + p_amount
    WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.increment_balance(uuid, numeric) TO authenticated;

-- 9. Adicionar coluna api_fixture_id na tabela matches para mapeamento exato
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS api_fixture_id int;
