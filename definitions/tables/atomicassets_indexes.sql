CREATE INDEX atomicassets_assets_immutable_data_rarity ON atomicassets_assets ((immutable_data->'name'));
CREATE INDEX atomicassets_assets_mutable_data_rarity ON atomicassets_assets ((mutable_data->'name'));
CREATE INDEX atomicassets_templates_immutable_data_rarity ON atomicassets_templates ((immutable_data->'name'));

CREATE INDEX atomicassets_assets_immutable_data_rarity ON atomicassets_assets ((immutable_data->'rarity'));
CREATE INDEX atomicassets_assets_mutable_data_rarity ON atomicassets_assets ((mutable_data->'rarity'));
CREATE INDEX atomicassets_templates_immutable_data_rarity ON atomicassets_templates ((immutable_data->'rarity'));

CREATE INDEX atomicassets_assets_immutable_data_cardid ON atomicassets_assets ((immutable_data->'cardid'));
CREATE INDEX atomicassets_assets_mutable_data_cardid ON atomicassets_assets ((mutable_data->'cardid'));
CREATE INDEX atomicassets_templates_immutable_data_cardid ON atomicassets_templates ((immutable_data->'cardid'));

CREATE INDEX atomicassets_assets_immutable_data_quality ON atomicassets_assets ((immutable_data->'quality'));
CREATE INDEX atomicassets_assets_mutable_data_quality ON atomicassets_assets ((mutable_data->'quality'));
CREATE INDEX atomicassets_templates_immutable_data_quality ON atomicassets_templates ((immutable_data->'quality'));

CREATE INDEX atomicassets_assets_immutable_data_variant ON atomicassets_assets ((immutable_data->'variant'));
CREATE INDEX atomicassets_assets_mutable_data_variant ON atomicassets_assets ((mutable_data->'variant'));
CREATE INDEX atomicassets_templates_immutable_data_variant ON atomicassets_templates ((immutable_data->'variant'));
