export const TEAM_TRANSLATIONS: Record<string, string> = {
  "México": "Mexico",
  "África do Sul": "South Africa",
  "Coreia do Sul": "South Korea",
  "Tchéquia": "Czech Republic",
  "Canadá": "Canada",
  "Bósnia": "Bosnia and Herzegovina",
  "Paraguai": "Paraguay",
  "Catar": "Qatar",
  "Suíça": "Switzerland",
  "Austrália": "Australia",
  "Turquia": "Turkey",
  "Brasil": "Brazil",
  "Haiti": "Haiti",
  "Marrocos": "Morocco",
  "Escócia": "Scotland",
  "Alemanha": "Germany",
  "Curaçao": "Curaçao",
  "Japão": "Japan",
  "Holanda": "Netherlands",
  "Costa do Marfim": "Ivory Coast",
  "Equador": "Ecuador",
  "Suécia": "Sweden",
  "Tunísia": "Tunisia",
  "Bélgica": "Belgium",
  "Egito": "Egypt",
  "Espanha": "Spain",
  "Cabo Verde": "Cape Verde",
  "Irã": "Iran",
  "Nova Zelândia": "New Zealand",
  "Arábia Saudita": "Saudi Arabia",
  "Uruguai": "Uruguay",
  "França": "France",
  "Senegal": "Senegal",
  "Argentina": "Argentina",
  "Argélia": "Algeria",
  "EUA": "United States",
  "Iraque": "Iraq",
  "Noruega": "Norway",
  "Áustria": "Austria",
  "Jordânia": "Jordan",
  "Portugal": "Portugal",
  "RD Congo": "Democratic Republic of the Congo",
  "Inglaterra": "England",
  "Croácia": "Croatia",
  "Uzbequistão": "Uzbekistan",
  "Colômbia": "Colombia",
  "Gana": "Ghana",
  "Panamá": "Panama"
};

// Mapeamento reverso para facilitar a identificação do time local vindo da API
export const REVERSE_TEAM_TRANSLATIONS: Record<string, string> = Object.entries(TEAM_TRANSLATIONS).reduce((acc, [pt, en]) => {
  acc[en.toLowerCase()] = pt;
  return acc;
}, {} as Record<string, string>);

export interface FootballApiFixture {
  id: number;
  date: string;
  status: {
    short: string; // "FT" indica fim do jogo, "NS" indica não iniciado
  };
  teams: {
    home: {
      name: string;
    };
    away: {
      name: string;
    };
  };
  goals: {
    home: number | null;
    away: number | null;
  };
}

/**
 * Busca todas as partidas finalizadas da Copa do Mundo de 2026 usando a API gratuita worldcup26.ir.
 */
export async function fetchFinishedFixtures(): Promise<FootballApiFixture[]> {
  const url = 'https://worldcup26.ir/get/games';

  console.log(`[WorldCup26 API] Buscando partidas na URL: ${url}`);

  const res = await fetch(url, {
    method: 'GET',
    next: { revalidate: 60 } // Cache simples de 1 minuto
  });

  if (!res.ok) {
    console.error(`[WorldCup26 API] Erro na requisição: Status ${res.status}`);
    throw new Error(`Erro ao conectar com WorldCup26 API: ${res.statusText}`);
  }

  const body = await res.json();
  const gamesList = body.games || [];
  
  return gamesList.map((item: any) => {
    // Conversão segura dos gols para número ou nulo
    const homeGoals = (item.home_score !== undefined && item.home_score !== null && item.home_score !== 'null') 
      ? parseInt(item.home_score, 10) 
      : null;
      
    const awayGoals = (item.away_score !== undefined && item.away_score !== null && item.away_score !== 'null') 
      ? parseInt(item.away_score, 10) 
      : null;

    // Converter local_date "MM/DD/YYYY HH:mm" para ISOString
    let formattedDate = '';
    try {
      if (item.local_date) {
        const [datePart, timePart] = item.local_date.split(' ');
        const [month, day, year] = datePart.split('/');
        formattedDate = new Date(`${year}-${month}-${day}T${timePart}:00`).toISOString();
      }
    } catch (e) {
      console.warn(`[WorldCup26 API] Erro ao converter data: ${item.local_date}`);
      formattedDate = item.local_date || '';
    }

    return {
      id: parseInt(item.id || '0', 10),
      date: formattedDate,
      status: {
        short: item.finished === 'TRUE' ? 'FT' : 'NS',
      },
      teams: {
        home: {
          name: item.home_team_name_en || '',
        },
        away: {
          name: item.away_team_name_en || '',
        }
      },
      goals: {
        home: homeGoals,
        away: awayGoals,
      }
    };
  });
}
