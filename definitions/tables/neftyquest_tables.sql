CREATE TABLE neftyquest_config
(
    contract                character varying(13)  NOT NULL,
    collection_name         character varying(13)  NOT NULL,
    template_id             bigint,
    balance_attribute_name  character varying(255) NOT NULL,
    quest_duration          bigint                 NOT NULL,
    points_per_asset        bigint                 NOT NULL,
    min_asset_value         bigint                 NOT NULL,
    min_asset_value_symbol  character varying(12)  NOT NULL,
    points_per_volume       bigint                 NOT NULL,
    volume_threshold        bigint                 NOT NULL,
    volume_threshold_symbol character varying(12)  NOT NULL,
    minimum_volume          bigint                 NOT NULL,
    minimum_volume_symbol   character varying(12)  NOT NULL,
    CONSTRAINT neftyquest_config_pkey PRIMARY KEY (contract)
);

CREATE TABLE neftyquest_quests
(
    contract                character varying(13) NOT NULL,
    quest_id                bigint                NOT NULL,
    start_time              bigint                NOT NULL,
    end_time                bigint                NOT NULL,
    points_per_asset        bigint                NOT NULL,
    min_asset_value         bigint                NOT NULL,
    min_asset_value_symbol  character varying(12) NOT NULL,
    points_per_volume       bigint                NOT NULL,
    volume_threshold        bigint                NOT NULL,
    volume_threshold_symbol character varying(12) NOT NULL,
    minimum_volume          bigint                NOT NULL,
    minimum_volume_symbol   character varying(12) NOT NULL,
    bonus                   jsonb,
    prizes                  jsonb,
    completion_multiplier   bigint                NOT NULL,
    CONSTRAINT neftyquest_quests_pkey PRIMARY KEY (contract, quest_id)
);

-- Indexes
CREATE
    INDEX neftyquest_quests_start_time ON neftyquest_quests USING btree (start_time);
CREATE
    INDEX neftyquest_quests_end_time ON neftyquest_quests USING btree (end_time);
