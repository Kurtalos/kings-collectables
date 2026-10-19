-- Optional on managed PostgreSQL: ask the DBA to enable pg_trgm if extension privileges are restricted.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- Run outside a transaction; production tables remain writable during index construction.
CREATE INDEX CONCURRENTLY IF NOT EXISTS inventory_name_trgm ON products USING gin (name gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS inventory_set_name_trgm ON products USING gin (set_name gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS inventory_collector_number ON products(collector_number);
CREATE INDEX CONCURRENTLY IF NOT EXISTS inventory_browse ON products(name,set_code,collector_number,condition,finish,id);
