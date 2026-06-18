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
 * Busca todas as partidas da Copa do Mundo de 2026.
 * Tenta primeiramente a API do OpenFootball (via GitHub Raw) que possui 100% de uptime,
 * e usa a API do worldcup26.ir como fallback caso a primeira falhe.
 */
export async function fetchFinishedFixtures(): Promise<FootballApiFixture[]> {
  try {
    const openFootballUrl = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';
    console.log(`[Football API] Tentando buscar partidas no OpenFootball: ${openFootballUrl}`);
    
    const res = await fetch(openFootballUrl, {
      method: 'GET',
      next: { revalidate: 60 } // Cache de 1 minuto
    });

    if (res.ok) {
      const body = await res.json();
      const matchesList = body.matches || [];
      console.log(`[Football API] ${matchesList.length} partidas carregadas com sucesso do OpenFootball.`);

      return matchesList.map((item: any, index: number) => {
        const hasScore = item.score && item.score.ft !== undefined && item.score.ft !== null;
        const homeGoals = hasScore ? parseInt(item.score.ft[0], 10) : null;
        const awayGoals = hasScore ? parseInt(item.score.ft[1], 10) : null;

        // Converter date "YYYY-MM-DD" e time "HH:mm UTC-X" para ISOString
        let formattedDate = '';
        try {
          if (item.date && item.time) {
            const timeClean = item.time.split(' ')[0];
            const tzPart = item.time.split(' ')[1] || 'UTC';
            let offset = 'Z';
            if (tzPart.startsWith('UTC')) {
              const offsetVal = tzPart.substring(3);
              if (offsetVal) {
                const sign = offsetVal.startsWith('-') ? '-' : '+';
                const num = parseInt(offsetVal.replace(/[-+]/g, ''), 10);
                offset = `${sign}${String(num).padStart(2, '0')}:00`;
              }
            }
            formattedDate = new Date(`${item.date}T${timeClean}:00${offset}`).toISOString();
          } else if (item.date) {
            formattedDate = new Date(`${item.date}T00:00:00Z`).toISOString();
          }
        } catch (e) {
          formattedDate = item.date || '';
        }

        return {
          id: index + 1,
          date: formattedDate,
          status: {
            short: hasScore ? 'FT' : 'NS',
          },
          teams: {
            home: {
              name: item.team1 || '',
            },
            away: {
              name: item.team2 || '',
            }
          },
          goals: {
            home: isNaN(homeGoals as number) ? null : homeGoals,
            away: isNaN(awayGoals as number) ? null : awayGoals,
          }
        };
      });
    }
    
    console.warn(`[Football API] Falha ao conectar com OpenFootball (Status ${res.status}). Tentando fallback para worldcup26.ir...`);
  } catch (err: any) {
    console.warn('[Football API] Erro ao conectar com OpenFootball. Tentando fallback para worldcup26.ir...', err.message);
  }

  // Fallback para worldcup26.ir
  const url = 'https://worldcup26.ir/get/games';
  console.log(`[Football API] Buscando partidas via fallback na URL: ${url}`);

  const res = await fetch(url, {
    method: 'GET',
    next: { revalidate: 60 }
  });

  if (!res.ok) {
    console.error(`[Football API] Erro no fallback: Status ${res.status}`);
    throw new Error(`Erro ao conectar com as APIs de Futebol externas (OpenFootball e WorldCup26).`);
  }

  const body = await res.json();
  const gamesList = body.games || [];
  
  return gamesList.map((item: any) => {
    const homeGoals = (item.home_score !== undefined && item.home_score !== null && item.home_score !== 'null') 
      ? parseInt(item.home_score, 10) 
      : null;
      
    const awayGoals = (item.away_score !== undefined && item.away_score !== null && item.away_score !== 'null') 
      ? parseInt(item.away_score, 10) 
      : null;

    let formattedDate = '';
    try {
      if (item.local_date) {
        const [datePart, timePart] = item.local_date.split(' ');
        const [month, day, year] = datePart.split('/');
        formattedDate = new Date(`${year}-${month}-${day}T${timePart}:00`).toISOString();
      }
    } catch (e) {
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
        home: isNaN(homeGoals as number) ? null : homeGoals,
        away: isNaN(awayGoals as number) ? null : awayGoals,
      }
    };
  });
}
