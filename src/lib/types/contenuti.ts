export type ContenutoTipo = "formazione" | "presentazione";
export type ContenutoMediaTipo = "link_esterno" | "file";

export interface Contenuto {
  id: string;
  tipo: ContenutoTipo;
  titolo: string;
  descrizione: string | null;
  tema: string | null;
  media_tipo: ContenutoMediaTipo;
  url_esterno: string | null;
  file_path: string | null;
  visibile_prospect: boolean;
  creato_da: string;
  created_at: string;
  updated_at: string;
  // aggiunto dall'API (non su DB): url pubblico risolto (storage o url_esterno)
  url: string;
  // aggiunto dall'API (non su DB): aggregati like
  likes_count: number;
  liked_by_me: boolean;
}

export const TIPO_LABELS: Record<ContenutoTipo, string> = {
  formazione: "Formazione",
  presentazione: "Presentazione",
};

export const UPLOAD_LIMIT_MB: Record<ContenutoTipo, number> = {
  formazione: 50,
  presentazione: 15,
};

export interface TemaIcona {
  tema: string;
  icona: string;
}
