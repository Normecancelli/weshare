// Shared TypeScript types for the orders module

export interface Product {
  id: string;
  codice_amway: string;
  descrizione: string;
  categoria: string | null;
  contenuto: string | null;
  prezzo_cliente: number;
  prezzo_partner: number;
  provvigione: number;
  prezzo_unita: string | null;
  punti_vp: number;
  volume_vv: number;
  attivo: boolean;
  image_url?: string | null;
}

export interface Customer {
  id: string;
  partner_id: string;
  nome: string;
  cognome: string | null;
  telefono: string | null;
  email: string | null;
  indirizzo: string | null;
  citta: string | null;
  note: string | null;
  created_at: string;
  is_interno: boolean;
}

export interface CustomerDate {
  id: string;
  customer_id: string;
  data: string;
  descrizione: string;
  created_at: string;
}

export type OrderStatus = "bozza" | "confermato" | "in_gruppo" | "completato" | "annullato";
export type OrderChannel = "whatsapp" | "presenza" | "telefono";
export type CartType = "personale" | "non_registrato" | "programmato";
export type ItemSource = "amway" | "magazzino";
export type DestinazioneUso = "magazzino" | "personale";
export type GroupStatus = "aperto" | "caricato" | "confermato";

export interface ClientOrder {
  id: string;
  partner_id: string;
  customer_id: string;
  stato: OrderStatus;
  canale: OrderChannel | null;
  note: string | null;
  totale_cliente: number;
  totale_partner: number;
  totale_vp: number;
  totale_provvigione: number;
  group_id: string | null;
  numero_ricevuta: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  customer?: Customer;
  items?: OrderItem[];
  receipt_log?: ReceiptEmailLogEntry[];
}

export interface ReceiptEmailLogEntry {
  id: string;
  order_id: string;
  to_email: string;
  sent_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantita: number;
  prezzo_unitario_cliente: number;
  prezzo_unitario_partner: number;
  punti_vp: number;
  provvigione: number;
  fonte: ItemSource;
  destinazione_uso: DestinazioneUso | null;
  magazzino_movimentato: boolean;
  note: string | null;
  // Joined fields
  product?: Product;
}

export interface OrderGroup {
  id: string;
  partner_id: string;
  nome: string;
  stato: GroupStatus;
  data_caricamento: string | null;
  ordini_programmati_count: number;
  note: string | null;
  created_at: string;
  // Joined fields
  orders?: ClientOrder[];
  group_items?: GroupItem[];
}

export interface GroupItem {
  id: string;
  group_id: string;
  order_item_id: string;
  carrello: CartType;
  confermato: boolean;
  // Joined fields
  order_item?: OrderItem;
}
