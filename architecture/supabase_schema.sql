-- SQL Schema para o Bolão Copa do Mundo 2026
-- Este arquivo deve ser executado no SQL Editor do Supabase.

-- Habilitar a extensão pgcrypto para geração de UUID se necessário
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =========================================================================
-- 1. TABELA: profiles
-- Extensão da tabela auth.users gerenciada pelo Supabase Auth.
-- Contém informações públicas dos usuários do bolão.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    name text NOT NULL,
    avatar_url text,
    asaas_customer_id text,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- Habilitar Row Level Security (RLS) para profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para profiles:
-- Qualquer usuário autenticado pode ler os perfis (necessário para listar os nomes de todos no ranking).
-- Apenas o próprio usuário pode inserir ou atualizar seu perfil.
CREATE POLICY "Qualquer usuário autenticado pode ver perfis públicos"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Usuários podem atualizar seu próprio perfil"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Usuários podem inserir seu próprio perfil"
    ON public.profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);


-- Trigger para criar o profile automaticamente após um cadastro no Supabase Auth.
-- Se o usuário fornecer um 'name' no metadata, ele será usado, senão usa a parte antes do '@' no email.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.profiles (id, name, created_at)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
        new.created_at
    );
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Registra a trigger na tabela auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- =========================================================================
-- 2. TABELA: matches
-- Armazena os dados das partidas da Copa do Mundo.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.matches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    home_team text NOT NULL,
    away_team text NOT NULL,
    home_flag text NOT NULL, -- Emoji da bandeira (ex: 🇧🇷)
    away_flag text NOT NULL, -- Emoji da bandeira (ex: 🇦🇷)
    match_time timestamptz NOT NULL, -- Horário de início do jogo
    home_score int, -- Resultado real do time da casa (nulo até o término da partida)
    away_score int, -- Resultado real do time de fora (nulo até o término da partida)
    stage text DEFAULT 'Fase de Grupos' NOT NULL,
    group_name text, -- Ex: 'Grupo A' (nulo se for mata-mata)
    created_at timestamptz DEFAULT now() NOT NULL
);

-- Habilitar Row Level Security (RLS) para matches
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para matches:
-- Leitura pública para todos os usuários (mesmo não autenticados podem ver a tabela de jogos).
-- Modificações permitidas apenas por admins (feitas com service role ou por verificação de email admin).
CREATE POLICY "Jogos são visíveis por todos"
    ON public.matches
    FOR SELECT
    USING (true);

-- Políticas para Admin (identificado pelo email do admin)
CREATE POLICY "Admins podem atualizar partidas"
    ON public.matches
    FOR UPDATE
    TO authenticated
    USING (auth.jwt() ->> 'email' = 'developer.teles@gmail.com')
    WITH CHECK (auth.jwt() ->> 'email' = 'developer.teles@gmail.com');

CREATE POLICY "Admins podem inserir partidas"
    ON public.matches
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.jwt() ->> 'email' = 'developer.teles@gmail.com');

CREATE POLICY "Admins podem deletar partidas"
    ON public.matches
    FOR DELETE
    TO authenticated
    USING (auth.jwt() ->> 'email' = 'developer.teles@gmail.com');



-- =========================================================================
-- 3. TABELA: predictions
-- Armazena os palpites dados pelos usuários.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.predictions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    match_id uuid REFERENCES public.matches(id) ON DELETE CASCADE NOT NULL,
    home_score int NOT NULL, -- Palpite de gols para o time da casa
    away_score int NOT NULL, -- Palpite de gols para o time de fora
    points int, -- Pontuação calculada após o resultado real (nulo até cálculo)
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT unique_user_match UNIQUE(user_id, match_id)
);

-- Habilitar Row Level Security (RLS) para predictions
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para predictions:
-- 1. Leitura: Qualquer usuário autenticado pode ver todos os palpites a qualquer momento.
CREATE POLICY "Leitura de palpites para usuários autenticados"
    ON public.predictions
    FOR SELECT
    TO authenticated
    USING (true);

-- 2. Inserção: Usuário só insere seu próprio palpite e APENAS se o jogo ainda não começou.
CREATE POLICY "Usuários inserem os próprios palpites antes do jogo começar"
    ON public.predictions
    FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = user_id 
        AND EXISTS (
            SELECT 1 FROM public.matches 
            WHERE matches.id = match_id 
            AND matches.match_time > now()
        )
    );

-- 3. Edição: Usuário só edita seu próprio palpite e APENAS se o jogo ainda não começou.
CREATE POLICY "Usuários editam os próprios palpites antes do jogo começar"
    ON public.predictions
    FOR UPDATE
    TO authenticated
    USING (
        auth.uid() = user_id 
        AND EXISTS (
            SELECT 1 FROM public.matches 
            WHERE matches.id = match_id 
            AND matches.match_time > now()
        )
    )
    WITH CHECK (
        auth.uid() = user_id 
        AND EXISTS (
            SELECT 1 FROM public.matches 
            WHERE matches.id = match_id 
            AND matches.match_time > now()
        )
    );

-- 4. Exclusão: Usuário só deleta seu próprio palpite se o jogo não começou.
CREATE POLICY "Usuários removem os próprios palpites antes do jogo começar"
    ON public.predictions
    FOR DELETE
    TO authenticated
    USING (
        auth.uid() = user_id 
        AND EXISTS (
            SELECT 1 FROM public.matches 
            WHERE matches.id = match_id 
            AND matches.match_time > now()
        )
    );


-- Trigger para atualizar a coluna updated_at automaticamente em predictions
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_predictions_updated_at ON public.predictions;
CREATE TRIGGER update_predictions_updated_at
    BEFORE UPDATE ON public.predictions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();


-- =========================================================================
-- 4. LÓGICA DE NEGÓCIO: Cálculo de Pontos
-- =========================================================================

-- Função para calcular e atualizar a pontuação de todos os palpites de um jogo
CREATE OR REPLACE FUNCTION public.calculate_points(p_match_id uuid)
RETURNS void AS $$
DECLARE
    v_home_score int;
    v_away_score int;
BEGIN
    -- Obter placar real do jogo
    SELECT home_score, away_score
    INTO v_home_score, v_away_score
    FROM public.matches
    WHERE id = p_match_id;

    -- Se o placar não estiver preenchido pelo admin, encerra sem alterar nada
    IF v_home_score IS NULL OR v_away_score IS NULL THEN
        RETURN;
    END IF;

    -- Atualiza os pontos de todas as predictions deste jogo
    UPDATE public.predictions
    SET points = CASE
        -- Placar exato: 3 pontos
        WHEN home_score = v_home_score AND away_score = v_away_score THEN 3

        -- Vencedor + diferença de gols: 2 pontos (somente jogos decididos/não empatados)
        WHEN (v_home_score - v_away_score) = (home_score - away_score) 
             AND (v_home_score - v_away_score) <> 0 
             AND sign(v_home_score - v_away_score) = sign(home_score - away_score) THEN 2

        -- Apenas o vencedor ou o empate não-exato: 1 ponto
        WHEN sign(v_home_score - v_away_score) = sign(home_score - away_score) THEN 1

        -- Erro / Sem acerto: 0 pontos
        ELSE 0
    END
    WHERE match_id = p_match_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Trigger para recalcular pontos automaticamente quando o placar real de uma partida for salvo/atualizado
CREATE OR REPLACE FUNCTION public.trigger_recalculate_points()
RETURNS trigger AS $$
BEGIN
    -- Só dispara se o placar real mudou e agora está preenchido
    IF (NEW.home_score IS DISTINCT FROM OLD.home_score OR NEW.away_score IS DISTINCT FROM OLD.away_score)
       AND NEW.home_score IS NOT NULL 
       AND NEW.away_score IS NOT NULL THEN
        PERFORM public.calculate_points(NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_match_score_update ON public.matches;
CREATE TRIGGER on_match_score_update
    AFTER UPDATE ON public.matches
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_recalculate_points();


-- =========================================================================
-- 5. POPULAR DADOS INICIAIS (10 Jogos da Copa do Mundo 2026)
-- Agendados a partir de 11/06/2026 (após o horário atual da inicialização)
-- =========================================================================

-- =========================================================================
-- 5. POPULAR DADOS INICIAIS (104 Jogos Reais da Copa do Mundo 2026)
-- Fase de grupos com times reais e mata-mata como "A confirmar"
-- =========================================================================

TRUNCATE TABLE public.matches CASCADE;

INSERT INTO public.matches (home_team, away_team, home_flag, away_flag, match_time, stage, group_name)
VALUES
    -- Grupo A
    ('México', 'África do Sul', '🇲🇽', '🇿🇦', '2026-06-11T16:00:00-03', 'Fase de Grupos', 'Grupo A'),
    ('Coreia do Sul', 'Tchéquia', '🇰🇷', '🇨🇿', '2026-06-11T23:00:00-03', 'Fase de Grupos', 'Grupo A'),
    ('México', 'Coreia do Sul', '🇲🇽', '🇰🇷', '2026-06-18T22:00:00-03', 'Fase de Grupos', 'Grupo A'),
    ('África do Sul', 'Tchéquia', '🇿🇦', '🇨🇿', '2026-06-18T13:00:00-03', 'Fase de Grupos', 'Grupo A'),
    ('México', 'Tchéquia', '🇲🇽', '🇨🇿', '2026-06-24T22:00:00-03', 'Fase de Grupos', 'Grupo A'),
    ('África do Sul', 'Coreia do Sul', '🇿🇦', '🇰🇷', '2026-06-24T22:00:00-03', 'Fase de Grupos', 'Grupo A'),

    -- Grupo B
    ('Canadá', 'Bósnia', '🇨🇦', '🇧🇦', '2026-06-12T16:00:00-03', 'Fase de Grupos', 'Grupo B'),
    ('Catar', 'Suíça', '🇶🇦', '🇨🇭', '2026-06-13T16:00:00-03', 'Fase de Grupos', 'Grupo B'),
    ('Canadá', 'Catar', '🇨🇦', '🇶🇦', '2026-06-18T19:00:00-03', 'Fase de Grupos', 'Grupo B'),
    ('Bósnia', 'Suíça', '🇧🇦', '🇨🇭', '2026-06-18T16:00:00-03', 'Fase de Grupos', 'Grupo B'),
    ('Canadá', 'Suíça', '🇨🇦', '🇨🇭', '2026-06-24T16:00:00-03', 'Fase de Grupos', 'Grupo B'),
    ('Bósnia', 'Catar', '🇧🇦', '🇶🇦', '2026-06-24T16:00:00-03', 'Fase de Grupos', 'Grupo B'),

    -- Grupo C
    ('Brasil', 'Haiti', '🇧🇷', '🇭🇹', '2026-06-19T21:30:00-03', 'Fase de Grupos', 'Grupo C'),
    ('Marrocos', 'Escócia', '🇲🇦', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', '2026-06-19T19:00:00-03', 'Fase de Grupos', 'Grupo C'),
    ('Brasil', 'Marrocos', '🇧🇷', '🇲🇦', '2026-06-13T19:00:00-03', 'Fase de Grupos', 'Grupo C'),
    ('Haiti', 'Escócia', '🇭🇹', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', '2026-06-13T22:00:00-03', 'Fase de Grupos', 'Grupo C'),
    ('Brasil', 'Escócia', '🇧🇷', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', '2026-06-24T19:00:00-03', 'Fase de Grupos', 'Grupo C'),
    ('Haiti', 'Marrocos', '🇭🇹', '🇲🇦', '2026-06-24T19:00:00-03', 'Fase de Grupos', 'Grupo C'),

    -- Grupo D
    ('EUA', 'Paraguai', '🇺🇸', '🇵🇾', '2026-06-12T22:00:00-03', 'Fase de Grupos', 'Grupo D'),
    ('Austrália', 'Turquia', '🇦🇺', '🇹🇷', '2026-06-14T01:00:00-03', 'Fase de Grupos', 'Grupo D'),
    ('EUA', 'Austrália', '🇺🇸', '🇦🇺', '2026-06-19T16:00:00-03', 'Fase de Grupos', 'Grupo D'),
    ('Paraguai', 'Turquia', '🇵🇾', '🇹🇷', '2026-06-20T00:00:00-03', 'Fase de Grupos', 'Grupo D'),
    ('EUA', 'Turquia', '🇺🇸', '🇹🇷', '2026-06-25T23:00:00-03', 'Fase de Grupos', 'Grupo D'),
    ('Paraguai', 'Austrália', '🇵🇾', '🇦🇺', '2026-06-25T23:00:00-03', 'Fase de Grupos', 'Grupo D'),

    -- Grupo E
    ('Alemanha', 'Curaçao', '🇩🇪', '🇨🇼', '2026-06-14T14:00:00-03', 'Fase de Grupos', 'Grupo E'),
    ('Costa do Marfim', 'Equador', '🇨🇮', '🇪🇨', '2026-06-14T20:00:00-03', 'Fase de Grupos', 'Grupo E'),
    ('Alemanha', 'Costa do Marfim', '🇩🇪', '🇨🇮', '2026-06-20T17:00:00-03', 'Fase de Grupos', 'Grupo E'),
    ('Curaçao', 'Equador', '🇨🇼', '🇪🇨', '2026-06-20T21:00:00-03', 'Fase de Grupos', 'Grupo E'),
    ('Alemanha', 'Equador', '🇩🇪', '🇪🇨', '2026-06-25T17:00:00-03', 'Fase de Grupos', 'Grupo E'),
    ('Curaçao', 'Costa do Marfim', '🇨🇼', '🇨🇮', '2026-06-25T17:00:00-03', 'Fase de Grupos', 'Grupo E'),

    -- Grupo F
    ('Japão', 'Holanda', '🇯🇵', '🇳🇱', '2026-06-14T17:00:00-03', 'Fase de Grupos', 'Grupo F'),
    ('Suécia', 'Tunísia', '🇸🇪', '🇹🇳', '2026-06-14T23:00:00-03', 'Fase de Grupos', 'Grupo F'),
    ('Japão', 'Suécia', '🇯🇵', '🇸🇪', '2026-06-25T20:00:00-03', 'Fase de Grupos', 'Grupo F'),
    ('Holanda', 'Tunísia', '🇳🇱', '🇹🇳', '2026-06-25T20:00:00-03', 'Fase de Grupos', 'Grupo F'),
    ('Japão', 'Tunísia', '🇯🇵', '🇹🇳', '2026-06-21T01:00:00-03', 'Fase de Grupos', 'Grupo F'),
    ('Holanda', 'Suécia', '🇳🇱', '🇸🇪', '2026-06-20T14:00:00-03', 'Fase de Grupos', 'Grupo F'),

    -- Grupo G
    ('Bélgica', 'Egito', '🇧🇪', '🇪🇬', '2026-06-15T16:00:00-03', 'Fase de Grupos', 'Grupo G'),
    ('Irã', 'Nova Zelândia', '🇮🇷', '🇳🇿', '2026-06-15T22:00:00-03', 'Fase de Grupos', 'Grupo G'),
    ('Bélgica', 'Irã', '🇧🇪', '🇮🇷', '2026-06-21T16:00:00-03', 'Fase de Grupos', 'Grupo G'),
    ('Egito', 'Nova Zelândia', '🇪🇬', '🇳🇿', '2026-06-21T22:00:00-03', 'Fase de Grupos', 'Grupo G'),
    ('Bélgica', 'Nova Zelândia', '🇧🇪', '🇳🇿', '2026-06-27T00:00:00-03', 'Fase de Grupos', 'Grupo G'),
    ('Egito', 'Irã', '🇪🇬', '🇮🇷', '2026-06-27T00:00:00-03', 'Fase de Grupos', 'Grupo G'),

    -- Grupo H
    ('Espanha', 'Cabo Verde', '🇪🇸', '🇨🇻', '2026-06-15T13:00:00-03', 'Fase de Grupos', 'Grupo H'),
    ('Arábia Saudita', 'Uruguai', '🇸🇦', '🇺🇾', '2026-06-15T19:00:00-03', 'Fase de Grupos', 'Grupo H'),
    ('Espanha', 'Arábia Saudita', '🇪🇸', '🇸🇦', '2026-06-21T13:00:00-03', 'Fase de Grupos', 'Grupo H'),
    ('Cabo Verde', 'Uruguai', '🇨🇻', '🇺🇾', '2026-06-21T19:00:00-03', 'Fase de Grupos', 'Grupo H'),
    ('Espanha', 'Uruguai', '🇪🇸', '🇺🇾', '2026-06-26T21:00:00-03', 'Fase de Grupos', 'Grupo H'),
    ('Cabo Verde', 'Arábia Saudita', '🇨🇻', '🇸🇦', '2026-06-26T21:00:00-03', 'Fase de Grupos', 'Grupo H'),

    -- Grupo I
    ('França', 'Senegal', '🇫🇷', '🇸🇳', '2026-06-16T16:00:00-03', 'Fase de Grupos', 'Grupo I'),
    ('Iraque', 'Noruega', '🇮🇶', '🇳🇴', '2026-06-16T19:00:00-03', 'Fase de Grupos', 'Grupo I'),
    ('França', 'Iraque', '🇫🇷', '🇮🇶', '2026-06-22T18:00:00-03', 'Fase de Grupos', 'Grupo I'),
    ('Senegal', 'Noruega', '🇸🇳', '🇳🇴', '2026-06-22T21:00:00-03', 'Fase de Grupos', 'Grupo I'),
    ('França', 'Noruega', '🇫🇷', '🇳🇴', '2026-06-26T16:00:00-03', 'Fase de Grupos', 'Grupo I'),
    ('Senegal', 'Iraque', '🇸🇳', '🇮🇶', '2026-06-26T16:00:00-03', 'Fase de Grupos', 'Grupo I'),

    -- Grupo J
    ('Argentina', 'Argélia', '🇦🇷', '🇩🇿', '2026-06-16T22:00:00-03', 'Fase de Grupos', 'Grupo J'),
    ('Áustria', 'Jordânia', '🇦🇹', '🇯🇴', '2026-06-17T01:00:00-03', 'Fase de Grupos', 'Grupo J'),
    ('Argentina', 'Áustria', '🇦🇷', '🇦🇹', '2026-06-22T14:00:00-03', 'Fase de Grupos', 'Grupo J'),
    ('Argélia', 'Jordânia', '🇩🇿', '🇯🇴', '2026-06-23T00:00:00-03', 'Fase de Grupos', 'Grupo J'),
    ('Argentina', 'Jordânia', '🇦🇷', '🇯🇴', '2026-06-27T23:00:00-03', 'Fase de Grupos', 'Grupo J'),
    ('Argélia', 'Áustria', '🇩🇿', '🇦🇹', '2026-06-27T23:00:00-03', 'Fase de Grupos', 'Grupo J'),

    -- Grupo K
    ('Portugal', 'RD Congo', '🇵🇹', '🇨🇩', '2026-06-17T14:00:00-03', 'Fase de Grupos', 'Grupo K'),
    ('Uzbequistão', 'Colômbia', '🇺🇿', '🇨🇴', '2026-06-17T23:00:00-03', 'Fase de Grupos', 'Grupo K'),
    ('Portugal', 'Uzbequistão', '🇵🇹', '🇺🇿', '2026-06-23T14:00:00-03', 'Fase de Grupos', 'Grupo K'),
    ('RD Congo', 'Colômbia', '🇨🇩', '🇨🇴', '2026-06-23T23:00:00-03', 'Fase de Grupos', 'Grupo K'),
    ('Portugal', 'Colômbia', '🇵🇹', '🇨🇴', '2026-06-27T20:30:00-03', 'Fase de Grupos', 'Grupo K'),
    ('RD Congo', 'Uzbequistão', '🇨🇩', '🇺🇿', '2026-06-27T20:30:00-03', 'Fase de Grupos', 'Grupo K'),

    -- Grupo L
    ('Inglaterra', 'Croácia', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', '🇭🇷', '2026-06-17T17:00:00-03', 'Fase de Grupos', 'Grupo L'),
    ('Gana', 'Panamá', '🇬🇭', '🇵🇦', '2026-06-17T20:00:00-03', 'Fase de Grupos', 'Grupo L'),
    ('Inglaterra', 'Gana', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', '🇬🇭', '2026-06-23T17:00:00-03', 'Fase de Grupos', 'Grupo L'),
    ('Croácia', 'Panamá', '🇭🇷', '🇵🇦', '2026-06-23T20:00:00-03', 'Fase de Grupos', 'Grupo L'),
    ('Inglaterra', 'Panamá', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', '🇵🇦', '2026-06-27T18:00:00-03', 'Fase de Grupos', 'Grupo L'),
    ('Croácia', 'Gana', '🇭🇷', '🇬🇭', '2026-06-27T18:00:00-03', 'Fase de Grupos', 'Grupo L'),

    -- Round of 32 (Trinta-e-dois-avos)
    ('A confirmar', 'A confirmar', '🏳️', '🏳️', '2026-06-28T16:00:00-03', 'Fase de 32', NULL),
    ('A confirmar', 'A confirmar', '🏳️', '🏳️', '2026-06-29T14:00:00-03', 'Fase de 32', NULL),
    ('A confirmar', 'A confirmar', '🏳️', '🏳️', '2026-06-29T17:30:00-03', 'Fase de 32', NULL),
    ('A confirmar', 'A confirmar', '🏳️', '🏳️', '2026-06-29T22:00:00-03', 'Fase de 32', NULL),
    ('A confirmar', 'A confirmar', '🏳️', '🏳️', '2026-06-30T14:00:00-03', 'Fase de 32', NULL),
    ('A confirmar', 'A confirmar', '🏳️', '🏳️', '2026-06-30T18:00:00-03', 'Fase de 32', NULL),
    ('A confirmar', 'A confirmar', '🏳️', '🏳️', '2026-06-30T22:00:00-03', 'Fase de 32', NULL),
    ('A confirmar', 'A confirmar', '🏳️', '🏳️', '2026-07-01T17:00:00-03', 'Fase de 32', NULL),
    ('A confirmar', 'A confirmar', '🏳️', '🏳️', '2026-07-02T16:00:00-03', 'Fase de 32', NULL),
    ('A confirmar', 'A confirmar', '🏳️', '🏳️', '2026-07-02T20:00:00-03', 'Fase de 32', NULL),
    ('A confirmar', 'A confirmar', '🏳️', '🏳️', '2026-07-01T13:00:00-03', 'Fase de 32', NULL),
    ('A confirmar', 'A confirmar', '🏳️', '🏳️', '2026-07-01T21:00:00-03', 'Fase de 32', NULL),

    -- Oitavas de Final
    ('A confirmar', 'A confirmar', '🏳️', '🏳️', '2026-07-04T14:00:00-03', 'Oitavas de Final', NULL),
    ('A confirmar', 'A confirmar', '🏳️', '🏳️', '2026-07-04T18:00:00-03', 'Oitavas de Final', NULL),
    ('A confirmar', 'A confirmar', '🏳️', '🏳️', '2026-07-05T17:00:00-03', 'Oitavas de Final', NULL),
    ('A confirmar', 'A confirmar', '🏳️', '🏳️', '2026-07-05T21:00:00-03', 'Oitavas de Final', NULL),
    ('A confirmar', 'A confirmar', '🏳️', '🏳️', '2026-07-06T16:00:00-03', 'Oitavas de Final', NULL),
    ('A confirmar', 'A confirmar', '🏳️', '🏳️', '2026-07-06T21:00:00-03', 'Oitavas de Final', NULL),
    ('A confirmar', 'A confirmar', '🏳️', '🏳️', '2026-07-07T13:00:00-03', 'Oitavas de Final', NULL),
    ('A confirmar', 'A confirmar', '🏳️', '🏳️', '2026-07-07T17:00:00-03', 'Oitavas de Final', NULL),

    -- Quartas de Final
    ('A confirmar', 'A confirmar', '🏳️', '🏳️', '2026-07-09T17:00:00-03', 'Quartas de Final', NULL),
    ('A confirmar', 'A confirmar', '🏳️', '🏳️', '2026-07-10T16:00:00-03', 'Quartas de Final', NULL),
    ('A confirmar', 'A confirmar', '🏳️', '🏳️', '2026-07-11T18:00:00-03', 'Quartas de Final', NULL),
    ('A confirmar', 'A confirmar', '🏳️', '🏳️', '2026-07-11T22:00:00-03', 'Quartas de Final', NULL),

    -- Semifinal
    ('A confirmar', 'A confirmar', '🏳️', '🏳️', '2026-07-14T16:00:00-03', 'Semifinal', NULL),
    ('A confirmar', 'A confirmar', '🏳️', '🏳️', '2026-07-15T16:00:00-03', 'Semifinal', NULL),

    -- Disputa Terceiro Lugar
    ('A confirmar', 'A confirmar', '🏳️', '🏳️', '2026-07-18T18:00:00-03', 'Decisão do 3º Lugar', NULL),

    -- Final
    ('A confirmar', 'A confirmar', '🏳️', '🏳️', '2026-07-19T16:00:00-03', 'Final', NULL)
ON CONFLICT DO NOTHING;


-- =========================================================================
-- 6. FUNÇÃO: Obter Contagem de Palpites por Jogo (Ignorando RLS)
-- Permite que o painel mostre a quantidade total de palpites mesmo antes do início.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_predictions_count()
RETURNS TABLE (match_id uuid, count bigint) AS $$
BEGIN
    RETURN QUERY
    SELECT p.match_id, COUNT(p.id) AS count
    FROM public.predictions p
    GROUP BY p.match_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Dar permissão de execução para usuários autenticados e anônimos
GRANT EXECUTE ON FUNCTION public.get_predictions_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_predictions_count() TO anon;


-- =========================================================================
-- 7. TABELAS DE SALAS PRIVADAS E APONTAMENTOS DE PIX
-- Permite que usuários organizem bolões fechados com taxa de entrada.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.rooms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    entry_fee numeric(10, 2) DEFAULT 0.00 NOT NULL,
    created_by uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.room_matches (
    room_id uuid REFERENCES public.rooms(id) ON DELETE CASCADE NOT NULL,
    match_id uuid REFERENCES public.matches(id) ON DELETE CASCADE NOT NULL,
    PRIMARY KEY (room_id, match_id)
);

CREATE TABLE IF NOT EXISTS public.room_participants (
    room_id uuid REFERENCES public.rooms(id) ON DELETE CASCADE NOT NULL,
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    payment_status text DEFAULT 'paid' NOT NULL,
    asaas_payment_id text,
    pix_qr_code text,
    pix_copia_e_cola text,
    created_at timestamptz DEFAULT now() NOT NULL,
    PRIMARY KEY (room_id, user_id),
    CONSTRAINT chk_payment_status CHECK (payment_status IN ('pending', 'paid'))
);

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view rooms they are members of"
    ON public.rooms
    FOR SELECT
    TO authenticated
    USING (
        id IN (
            SELECT room_id 
            FROM public.room_participants 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Creators can view their rooms"
    ON public.rooms
    FOR SELECT
    TO authenticated
    USING (auth.uid() = created_by);

CREATE POLICY "Authenticated users can create rooms"
    ON public.rooms
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Room creators can update their rooms"
    ON public.rooms
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = created_by)
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can see room participants"
    ON public.room_participants
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can join rooms"
    ON public.room_participants
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave rooms or creators can remove members"
    ON public.room_participants
    FOR DELETE
    TO authenticated
    USING (
        auth.uid() = user_id 
        OR auth.uid() = (SELECT created_by FROM public.rooms WHERE id = room_id)
    );

CREATE POLICY "Users can update their own status or creator can update it"
    ON public.room_participants
    FOR UPDATE
    TO authenticated
    USING (
        auth.uid() = user_id
        OR auth.uid() = (SELECT created_by FROM public.rooms WHERE id = room_id)
    )
    WITH CHECK (
        auth.uid() = user_id
        OR auth.uid() = (SELECT created_by FROM public.rooms WHERE id = room_id)
    );

CREATE POLICY "Authenticated users can see room matches"
    ON public.room_matches
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Room creators can link matches to rooms"
    ON public.room_matches
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.rooms 
            WHERE id = room_id 
            AND created_by = auth.uid()
        )
    );

