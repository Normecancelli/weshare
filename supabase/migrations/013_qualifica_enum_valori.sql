-- 013_qualifica_enum_valori.sql
-- Estende l'enum Postgres `qualifica_amway` con i livelli percentuali (3%-18%)
-- prima di Silver, e Rubino/Zaffiro tra Platino e Smeraldo.
--
-- IMPORTANTE: va eseguita in una transazione/esecuzione SEPARATA dalla
-- migration 014_qualifica_rls.sql (Postgres non permette di usare un nuovo
-- valore enum nella stessa transazione in cui viene aggiunto con ADD VALUE).
-- Valori attuali verificati (pg_enum, 2026-07-16): nessuna(1), silver(2),
-- gold(3), platino(4), smeraldo(5), diamante(6).

ALTER TYPE qualifica_amway ADD VALUE IF NOT EXISTS '3%' AFTER 'nessuna';
ALTER TYPE qualifica_amway ADD VALUE IF NOT EXISTS '6%' AFTER '3%';
ALTER TYPE qualifica_amway ADD VALUE IF NOT EXISTS '9%' AFTER '6%';
ALTER TYPE qualifica_amway ADD VALUE IF NOT EXISTS '12%' AFTER '9%';
ALTER TYPE qualifica_amway ADD VALUE IF NOT EXISTS '15%' AFTER '12%';
ALTER TYPE qualifica_amway ADD VALUE IF NOT EXISTS '18%' AFTER '15%';
ALTER TYPE qualifica_amway ADD VALUE IF NOT EXISTS 'rubino' AFTER 'platino';
ALTER TYPE qualifica_amway ADD VALUE IF NOT EXISTS 'zaffiro' AFTER 'rubino';
