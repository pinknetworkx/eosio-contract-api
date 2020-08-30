CREATE INDEX atomicassets_assets_immutable_data_name ON atomicassets_assets USING btree ((immutable_data->>'name'));
CREATE INDEX atomicassets_assets_mutable_data_name ON atomicassets_assets USING btree ((mutable_data->>'name'));
CREATE INDEX atomicassets_templates_immutable_data_name ON atomicassets_templates USING btree ((immutable_data->>'name'));

CREATE INDEX atomicassets_assets_immutable_data_rarity ON atomicassets_assets USING hash ((immutable_data->>'rarity')) WHERE immutable_data->>'rarity' IS NOT NULL;
CREATE INDEX atomicassets_assets_mutable_data_rarity ON atomicassets_assets USING hash ((mutable_data->>'rarity')) WHERE immutable_data->>'rarity' IS NOT NULL;
CREATE INDEX atomicassets_templates_immutable_data_rarity ON atomicassets_templates USING hash ((immutable_data->>'rarity')) WHERE immutable_data->>'rarity' IS NOT NULL;

CREATE INDEX atomicassets_assets_immutable_data_cardid ON atomicassets_assets USING btree ((immutable_data->>'cardid')) WHERE immutable_data->>'cardid' IS NOT NULL;
CREATE INDEX atomicassets_assets_mutable_data_cardid ON atomicassets_assets USING btree ((mutable_data->>'cardid')) WHERE mutable_data->>'cardid' IS NOT NULL;
CREATE INDEX atomicassets_templates_immutable_data_cardid ON atomicassets_templates USING btree ((immutable_data->>'cardid')) WHERE immutable_data->>'cardid' IS NOT NULL;

CREATE INDEX atomicassets_assets_immutable_data_quality ON atomicassets_assets USING hash ((immutable_data->>'quality')) WHERE immutable_data->>'quality' IS NOT NULL;
CREATE INDEX atomicassets_assets_mutable_data_quality ON atomicassets_assets USING hash ((mutable_data->>'quality')) WHERE mutable_data->>'quality' IS NOT NULL;
CREATE INDEX atomicassets_templates_immutable_data_quality ON atomicassets_templates USING hash ((immutable_data->>'quality')) WHERE immutable_data->>'quality' IS NOT NULL;

CREATE INDEX atomicassets_assets_immutable_data_variant ON atomicassets_assets USING hash ((immutable_data->>'variant')) WHERE immutable_data->>'variant' IS NOT NULL;
CREATE INDEX atomicassets_assets_mutable_data_variant ON atomicassets_assets USING hash ((mutable_data->>'variant')) WHERE mutable_data->>'variant' IS NOT NULL;
CREATE INDEX atomicassets_templates_immutable_data_variant ON atomicassets_templates USING hash ((immutable_data->>'variant')) WHERE immutable_data->>'variant' IS NOT NULL;
