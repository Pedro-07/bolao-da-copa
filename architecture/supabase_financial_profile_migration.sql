-- Estender public.profiles com colunas para o Cadastro Financeiro
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS full_name text,
ADD COLUMN IF NOT EXISTS cpf_cnpj text,
ADD COLUMN IF NOT EXISTS birth_date date,
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS pix_key_type text CHECK (pix_key_type IN ('CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP')),
ADD COLUMN IF NOT EXISTS pix_key text,
ADD COLUMN IF NOT EXISTS is_financial_registered boolean DEFAULT false NOT NULL;

-- Criar índice único parcial para garantir que um CPF/CNPJ não seja cadastrado em múltiplas contas
CREATE UNIQUE INDEX IF NOT EXISTS profiles_cpf_cnpj_unique_idx ON public.profiles (cpf_cnpj) WHERE cpf_cnpj IS NOT NULL;
