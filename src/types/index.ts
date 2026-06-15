export interface Profile {
  id: string;
  name: string;
  created_at: string;
}

export interface Match {
  id: string;
  home_team: string;
  away_team: string;
  home_flag: string;
  away_flag: string;
  match_time: string;
  home_score: number | null;
  away_score: number | null;
  stage: string;
  group_name: string | null;
  created_at: string;
}

export interface Prediction {
  id: string;
  user_id: string;
  match_id: string;
  home_score: number;
  away_score: number;
  points: number | null;
  created_at: string;
  updated_at: string;
}

export interface RankingEntry {
  user_id: string;
  name: string;
  avatar_url: string | null;
  total_points: number;
  predictions_count: number;
  acertos_count: number;
  aproveitamento: number;
  rank_position?: number;
}
