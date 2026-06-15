-- Script de Migração: Otimização de Ranking no Banco de Dados

-- 1. Adicionar colunas de estatísticas na tabela profiles se não existirem
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS avatar_url text,
ADD COLUMN IF NOT EXISTS total_points int DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS predictions_count int DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS acertos_count int DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS aproveitamento int DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS rank_position int DEFAULT 0 NOT NULL;

-- 2. Criar a função de recálculo de ranking
CREATE OR REPLACE FUNCTION public.recalculate_ranking()
RETURNS void AS $$
BEGIN
    WITH ranked_users AS (
        SELECT 
            p.id AS user_id,
            COALESCE(SUM(pred.points), 0) AS total_points,
            COUNT(pred.id) AS predictions_count,
            COUNT(CASE WHEN pred.points > 0 THEN 1 END) AS acertos_count,
            CASE 
                WHEN COUNT(pred.id) > 0 THEN ROUND((COUNT(CASE WHEN pred.points > 0 THEN 1 END)::numeric / COUNT(pred.id)) * 100)
                ELSE 0
            END AS aproveitamento,
            ROW_NUMBER() OVER (
                ORDER BY 
                    COALESCE(SUM(pred.points), 0) DESC, 
                    COUNT(pred.id) DESC, 
                    p.name ASC
            ) AS computed_rank
        FROM 
            public.profiles p
        LEFT JOIN 
            public.predictions pred ON p.id = pred.user_id AND pred.points IS NOT NULL
        GROUP BY 
            p.id, p.name
    )
    UPDATE public.profiles p
    SET 
        total_points = ru.total_points,
        predictions_count = ru.predictions_count,
        acertos_count = ru.acertos_count,
        aproveitamento = ru.aproveitamento,
        rank_position = ru.computed_rank
    FROM 
        ranked_users ru
    WHERE 
        p.id = ru.user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Atualizar o trigger de partidas para recalcular o ranking automaticamente
CREATE OR REPLACE FUNCTION public.trigger_recalculate_points()
RETURNS trigger AS $$
BEGIN
    -- Só dispara se o placar real mudou e agora está preenchido
    IF (NEW.home_score IS DISTINCT FROM OLD.home_score OR NEW.away_score IS DISTINCT FROM OLD.away_score)
       AND NEW.home_score IS NOT NULL 
       AND NEW.away_score IS NOT NULL THEN
        -- Calcula os pontos dos palpites para este jogo específico
        PERFORM public.calculate_points(NEW.id);
        -- Recalcula o ranking de todos os participantes no banco
        PERFORM public.recalculate_ranking();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Atualizar o trigger de criação de novo usuário para rodar o ranking inicial
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.profiles (id, name, created_at)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
        new.created_at
    );
    -- Recalcula posições após a inserção do novo participante
    PERFORM public.recalculate_ranking();
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Executar o recálculo inicial para preencher as colunas dos usuários existentes
SELECT public.recalculate_ranking();
