-- Kings Collectables - complete database schema
-- Exported from the live application database with pg_dump (schema only, no data).
-- Requires PostgreSQL 13+ (gen_random_uuid is built-in from 13 onwards).
-- Usage: psql "$DATABASE_URL" -f scripts/schema.sql
-- Run ONCE against an EMPTY database. Do not use for migrating an existing database.
-- Tables: products, categories, product_categories, customers, addresses, orders,
--   order_items, payments, credit_transactions, decks, deck_items, wishlists,
--   watchlists, imports, inquiries, price_events, newsletter, store_meta
-- The app seeds 18 sample cards and 4 starter collections automatically on first request.


-- Dumped from database version 15.19 (Debian 15.19-0+deb12u1)
-- Dumped by pg_dump version 15.19 (Debian 15.19-0+deb12u1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.addresses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    label text DEFAULT 'Home'::text NOT NULL,
    recipient_name text NOT NULL,
    line1 text NOT NULL,
    line2 text,
    suburb text NOT NULL,
    state text NOT NULL,
    postcode text NOT NULL,
    phone text,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    color text DEFAULT '#f26b0a'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: credit_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credit_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    order_id uuid,
    amount integer NOT NULL,
    reason text DEFAULT 'Trade-in'::text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    credit_balance integer DEFAULT 0 NOT NULL
);


--
-- Name: deck_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deck_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deck_id uuid NOT NULL,
    card_name text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    section text DEFAULT 'Maindeck'::text NOT NULL,
    set_code text,
    collector_number text
);


--
-- Name: decks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.decks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    name text NOT NULL,
    format text DEFAULT ' Casual'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: imports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.imports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    filename text NOT NULL,
    status text DEFAULT 'preview'::text NOT NULL,
    imported integer DEFAULT 0 NOT NULL,
    skipped integer DEFAULT 0 NOT NULL,
    payload jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: inquiries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inquiries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    message text NOT NULL,
    read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: newsletter; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.newsletter (
    email text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    product_id uuid,
    card_name text NOT NULL,
    variant text NOT NULL,
    quantity integer NOT NULL,
    unit_price integer NOT NULL
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_number text NOT NULL,
    customer_name text NOT NULL,
    email text NOT NULL,
    shipping_address text NOT NULL,
    status text DEFAULT 'Awaiting payment'::text NOT NULL,
    subtotal integer NOT NULL,
    shipping integer NOT NULL,
    total integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    customer_id uuid,
    payment_method text,
    payment_receipt text,
    paid_at timestamp with time zone,
    channel text DEFAULT 'web'::text NOT NULL,
    discount integer DEFAULT 0 NOT NULL,
    note text,
    refunded_amount integer DEFAULT 0 NOT NULL,
    refunded_at timestamp with time zone,
    refund_reason text,
    address_id uuid,
    recipient_phone text
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    method text NOT NULL,
    provider_reference text,
    amount integer NOT NULL,
    currency text DEFAULT 'aud'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    client_secret text,
    failure_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: price_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.price_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    old_price integer NOT NULL,
    new_price integer NOT NULL,
    usd_price integer NOT NULL,
    rate integer NOT NULL,
    source text DEFAULT 'daily'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: product_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_categories (
    product_id uuid NOT NULL,
    category_id uuid NOT NULL
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scryfall_id text NOT NULL,
    name text NOT NULL,
    set_name text NOT NULL,
    set_code text NOT NULL,
    collector_number text NOT NULL,
    image_url text NOT NULL,
    art_url text NOT NULL,
    rarity text NOT NULL,
    colors jsonb DEFAULT '[]'::jsonb NOT NULL,
    type_line text NOT NULL,
    mana_cost text DEFAULT ''::text NOT NULL,
    oracle_text text DEFAULT ''::text NOT NULL,
    condition text DEFAULT 'Near mint'::text NOT NULL,
    finish text DEFAULT 'Non-foil'::text NOT NULL,
    price integer NOT NULL,
    quantity integer DEFAULT 0 NOT NULL,
    featured boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    price_mode text DEFAULT 'manual'::text NOT NULL,
    usd_price integer,
    price_updated_at timestamp with time zone
);


--
-- Name: store_meta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_meta (
    key text NOT NULL,
    value text NOT NULL
);


--
-- Name: watchlists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.watchlists (
    customer_id uuid NOT NULL,
    product_id uuid NOT NULL,
    last_seen_quantity integer DEFAULT 0 NOT NULL,
    last_seen_price integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: wishlists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wishlists (
    customer_id uuid NOT NULL,
    product_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: addresses addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.addresses
    ADD CONSTRAINT addresses_pkey PRIMARY KEY (id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: categories categories_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_slug_unique UNIQUE (slug);


--
-- Name: credit_transactions credit_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_transactions
    ADD CONSTRAINT credit_transactions_pkey PRIMARY KEY (id);


--
-- Name: customers customers_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_email_unique UNIQUE (email);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: deck_items deck_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_items
    ADD CONSTRAINT deck_items_pkey PRIMARY KEY (id);


--
-- Name: decks decks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decks
    ADD CONSTRAINT decks_pkey PRIMARY KEY (id);


--
-- Name: imports imports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imports
    ADD CONSTRAINT imports_pkey PRIMARY KEY (id);


--
-- Name: inquiries inquiries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inquiries
    ADD CONSTRAINT inquiries_pkey PRIMARY KEY (id);


--
-- Name: newsletter newsletter_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletter
    ADD CONSTRAINT newsletter_pkey PRIMARY KEY (email);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_order_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_order_number_unique UNIQUE (order_number);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: price_events price_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_events
    ADD CONSTRAINT price_events_pkey PRIMARY KEY (id);


--
-- Name: product_categories product_categories_product_id_category_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_categories
    ADD CONSTRAINT product_categories_product_id_category_id_pk PRIMARY KEY (product_id, category_id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: store_meta store_meta_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_meta
    ADD CONSTRAINT store_meta_pkey PRIMARY KEY (key);


--
-- Name: watchlists watchlists_customer_id_product_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watchlists
    ADD CONSTRAINT watchlists_customer_id_product_id_pk PRIMARY KEY (customer_id, product_id);


--
-- Name: wishlists wishlists_customer_id_product_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wishlists
    ADD CONSTRAINT wishlists_customer_id_product_id_pk PRIMARY KEY (customer_id, product_id);


--
-- Name: deck_customer_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX deck_customer_name ON public.decks USING btree (customer_id, name);


--
-- Name: deck_item_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX deck_item_unique ON public.deck_items USING btree (deck_id, card_name, section);


--
-- Name: product_printing_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX product_printing_variant ON public.products USING btree (scryfall_id, condition, finish);


--
-- Name: addresses addresses_customer_id_customers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.addresses
    ADD CONSTRAINT addresses_customer_id_customers_id_fk FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: credit_transactions credit_transactions_customer_id_customers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_transactions
    ADD CONSTRAINT credit_transactions_customer_id_customers_id_fk FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: credit_transactions credit_transactions_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_transactions
    ADD CONSTRAINT credit_transactions_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: deck_items deck_items_deck_id_decks_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deck_items
    ADD CONSTRAINT deck_items_deck_id_decks_id_fk FOREIGN KEY (deck_id) REFERENCES public.decks(id) ON DELETE CASCADE;


--
-- Name: decks decks_customer_id_customers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decks
    ADD CONSTRAINT decks_customer_id_customers_id_fk FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_product_id_products_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_products_id_fk FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: orders orders_address_id_addresses_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_address_id_addresses_id_fk FOREIGN KEY (address_id) REFERENCES public.addresses(id) ON DELETE SET NULL;


--
-- Name: orders orders_customer_id_customers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_customer_id_customers_id_fk FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: payments payments_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: price_events price_events_product_id_products_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_events
    ADD CONSTRAINT price_events_product_id_products_id_fk FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_categories product_categories_category_id_categories_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_categories
    ADD CONSTRAINT product_categories_category_id_categories_id_fk FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;


--
-- Name: product_categories product_categories_product_id_products_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_categories
    ADD CONSTRAINT product_categories_product_id_products_id_fk FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: watchlists watchlists_customer_id_customers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watchlists
    ADD CONSTRAINT watchlists_customer_id_customers_id_fk FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: watchlists watchlists_product_id_products_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watchlists
    ADD CONSTRAINT watchlists_product_id_products_id_fk FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: wishlists wishlists_customer_id_customers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wishlists
    ADD CONSTRAINT wishlists_customer_id_customers_id_fk FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: wishlists wishlists_product_id_products_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wishlists
    ADD CONSTRAINT wishlists_product_id_products_id_fk FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--


