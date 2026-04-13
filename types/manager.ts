export interface Manager {
  id: string;
  name: string;
  cpf?: string;
  email?: string;
  photo_url?: string;
}

export interface ChampionshipManager {
  id: string;
  manager_id: string;
  championship_id: string;
  inspirational_phrase?: string;
  team_id?: string | null;
  initial_balance: number;
  current_balance: number;
  draft_sort_order?: number | null;
}

export interface ChampionshipManagerWithRelations extends ChampionshipManager {
  manager: Manager;
}

export type ChampionshipManagerWithManager = {
  id: string;
  inspirational_phrase: string | null;
  team_id: string | null;
  manager: {
    id: string;
    name: string;
    email: string | null;
    cpf: string | null;
    photo_url: string | null;
  };
};

export type ChampionshipManagerRelation = {
  championship: {
    id: string;
    name: string;
  };
};

export type ManagerListItem = {
  manager: Manager;
  id: string | null; // id do vínculo (championship_managers)
  inspirational_phrase: string | null;
  linked: boolean;
};
