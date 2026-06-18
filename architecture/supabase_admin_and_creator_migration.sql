-- Migration: Adiciona flags de Admin e participação do Criador
-- Execute este script no SQL Editor do seu Supabase (Local e Produção)

-- 1. Adicionar coluna is_admin na tabela de perfis (se não existir)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;

-- 2. Adicionar coluna creator_participates na tabela de salas (se não existir)
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS creator_participates boolean DEFAULT true;

-- 3. Atualizar a trigger handle_new_user para setar is_admin automaticamente para o email do admin
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
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Atualizar o perfil do admin atual (caso ele já tenha sido cadastrado)
UPDATE public.profiles p
SET is_admin = true
FROM auth.users u
WHERE p.id = u.id AND u.email = 'pphenriquelim4@gmail.com';
