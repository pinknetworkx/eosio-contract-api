--
-- PostgreSQL database dump
--

--DROP INDEX public.contract_codes_block_time;
--DROP INDEX public.contract_codes_block_num;
--DROP INDEX public.contract_codes_account;
--DROP INDEX public.contract_abis_block_time;
--DROP INDEX public.contract_abis_block_num;
--DROP INDEX public.contract_abis_account;
--ALTER TABLE ONLY public.contract_readers DROP CONSTRAINT contract_readers_pkey;
--ALTER TABLE ONLY public.contract_codes DROP CONSTRAINT contract_codes_pkey;
--ALTER TABLE ONLY public.contract_abis DROP CONSTRAINT contract_abis_pkey;
--DROP TABLE public.contract_readers;
--DROP TABLE public.contract_codes;
--DROP TABLE public.contract_abis;

--
-- TOC entry 203 (class 1259 OID 16403)
-- Name: contract_abis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contract_abis (
    account bigint NOT NULL,
    abi bytea NOT NULL,
    block_num bigint NOT NULL,
    block_time bigint NOT NULL
);


--
-- TOC entry 204 (class 1259 OID 16411)
-- Name: contract_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contract_codes (
    account bigint NOT NULL,
    block_num bigint NOT NULL,
    block_time bigint NOT NULL
);


--
-- TOC entry 202 (class 1259 OID 16398)
-- Name: contract_readers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contract_readers (
    name character varying(64) NOT NULL,
    block_num bigint NOT NULL,
    block_time bigint NOT NULL,
    updated bigint NOT NULL
);


--
-- TOC entry 2790 (class 2606 OID 16410)
-- Name: contract_abis contract_abis_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_abis
    ADD CONSTRAINT contract_abis_pkey PRIMARY KEY (account, block_num);


--
-- TOC entry 2795 (class 2606 OID 16415)
-- Name: contract_codes contract_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_codes
    ADD CONSTRAINT contract_codes_pkey PRIMARY KEY (account, block_num);


--
-- TOC entry 2785 (class 2606 OID 16402)
-- Name: contract_readers contract_readers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_readers
    ADD CONSTRAINT contract_readers_pkey PRIMARY KEY (name);


--
-- TOC entry 2786 (class 1259 OID 16417)
-- Name: contract_abis_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contract_abis_account ON public.contract_abis USING btree (account);


--
-- TOC entry 2787 (class 1259 OID 16418)
-- Name: contract_abis_block_num; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contract_abis_block_num ON public.contract_abis USING btree (block_num);


--
-- TOC entry 2788 (class 1259 OID 16416)
-- Name: contract_abis_block_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contract_abis_block_time ON public.contract_abis USING btree (block_time);


--
-- TOC entry 2791 (class 1259 OID 16421)
-- Name: contract_codes_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contract_codes_account ON public.contract_codes USING btree (account);


--
-- TOC entry 2792 (class 1259 OID 16419)
-- Name: contract_codes_block_num; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contract_codes_block_num ON public.contract_codes USING btree (block_num);


--
-- TOC entry 2793 (class 1259 OID 16420)
-- Name: contract_codes_block_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contract_codes_block_time ON public.contract_codes USING btree (block_time);

--
-- PostgreSQL database dump complete
--
