import type { Product } from "@/lib/types/orders";

export interface MagazzinoItem {
  id: string;
  partner_id: string;
  product_id: string;
  quantita: number;
  updated_at: string;
  product?: Product;
}
