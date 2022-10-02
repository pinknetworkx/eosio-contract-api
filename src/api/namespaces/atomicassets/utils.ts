import {OfferState} from '../../../filler/handlers/atomicassets';
import QueryBuilder from '../../builder';
import {filterQueryArgs, FiltersDefinition, FilterValues} from '../validation';

export function hasAssetFilter(values: FilterValues, blacklist: string[] = []): boolean {
    return Object.keys(values)
        .filter(key => !blacklist.includes(key))
        .some(key => assetFilters[key]);
}

export function hasDataFilters(values: FilterValues): boolean {
    const keys = Object.keys(values);

    for (const key of keys) {
        if (['match', 'match_immutable_name', 'match_mutable_name', 'search'].includes(key)) {
            return true;
        }

        if (key.startsWith('data.') || key.startsWith('data:')) {
            return true;
        }

        if (key.startsWith('template_data.') || key.startsWith('template_data:')) {
            return true;
        }

        if (key.startsWith('immutable_data.') || key.startsWith('immutable_data:')) {
            return true;
        }

        if (key.startsWith('mutable_data.') || key.startsWith('mutable_data:')) {
            return true;
        }
    }

    return false;
}

export function buildDataConditions(values: FilterValues, query: QueryBuilder, options: { assetTable?: string, templateTable?: string }): void {
    const keys = Object.keys(values);

    function buildConditionObject(name: string): { [key: string]: string | number | boolean } {
        const searchObject: { [key: string]: string | number } = {};

        for (const key of keys) {
            if (key.startsWith(name + ':text.')) {
                searchObject[key.substr((name + ':text.').length)] = String(values[key]);
            } else if (key.startsWith(name + ':number.')) {
                searchObject[key.substr((name + ':number.').length)] = parseFloat(values[key]);
            } else if (key.startsWith(name + ':bool.')) {
                searchObject[key.substr((name + ':bool.').length)] = (values[key] === 'true' || values[key] === '1') ? 1 : 0;
            } else if (key.startsWith(name + '.')) {
                searchObject[key.substr((name + '.').length)] = values[key];
            }
        }

        return searchObject;
    }

    const templateCondition = {...buildConditionObject('data'), ...buildConditionObject('template_data')};
    const mutableCondition = buildConditionObject('mutable_data');
    const immutableCondition = buildConditionObject('immutable_data');

    if (!options.templateTable) {
        Object.assign(immutableCondition, buildConditionObject('data'), immutableCondition);
    }

    if (options.assetTable) {
        const assetDataCondition = {
            ...mutableCondition,
            ...immutableCondition,
        };

        if (Object.keys(assetDataCondition).length > 0) {
            // use combined index
            query.addCondition(`(${options.assetTable}.mutable_data || ${options.assetTable}.immutable_data) @> ${query.addVariable(JSON.stringify(mutableCondition))}::jsonb`);
            query.addCondition(`(${options.assetTable}.mutable_data || ${options.assetTable}.immutable_data) != '{}'`);
        }

        if (Object.keys(mutableCondition).length > 0) {
            query.addCondition(options.assetTable + '.mutable_data @> ' + query.addVariable(JSON.stringify(mutableCondition)) + '::jsonb');
        }

        if (Object.keys(immutableCondition).length > 0) {
            query.addCondition(options.assetTable + '.immutable_data @> ' + query.addVariable(JSON.stringify(immutableCondition)) + '::jsonb');
        }

        if (typeof values.match_immutable_name === 'string' && values.match_immutable_name.length > 0) {
            query.addCondition(
                options.assetTable + '.immutable_data->>\'name\' ILIKE ' +
                query.addVariable('%' + query.escapeLikeVariable(values.match_immutable_name) + '%')
            );
        }

        if (typeof values.match_mutable_name === 'string' && values.match_mutable_name.length > 0) {
            query.addCondition(
                options.assetTable + '.mutable_data->>\'name\' ILIKE ' +
                query.addVariable('%' + query.escapeLikeVariable(values.match_mutable_name) + '%')
            );
        }
    }

    if (options.templateTable) {
        if (Object.keys(templateCondition).length > 0) {
            query.addCondition(options.templateTable + '.immutable_data @> ' + query.addVariable(JSON.stringify(templateCondition)) + '::jsonb');
        }

        if (typeof values.match === 'string' && values.match.length > 0) {
            query.addCondition(
                options.templateTable + '.immutable_data->>\'name\' ILIKE ' +
                query.addVariable('%' + query.escapeLikeVariable(values.match) + '%')
            );
        }

        if (typeof values.search === 'string' && values.search.length > 0) {
            query.addCondition(
                `${query.addVariable(values.search)} <% (${options.templateTable}.immutable_data->>'name')`
            );
        }
    }
}

const assetFilters: FiltersDefinition = {
    asset_id: {type: 'list[id]'},
    owner: {type: 'list[name]'},
    burned: {type: 'bool'},
    template_id: {type: 'list[id]'},
    collection_name: {type: 'list[name]'},
    schema_name: {type: 'list[name]'},
    is_transferable: {type: 'bool'},
    is_burnable: {type: 'bool'},
    minter: {type: 'list[name]'},
    initial_receiver: {type: 'list[name]'},
    burner: {type: 'list[name]'},
};

export async function buildAssetFilter(
    values: FilterValues, query: QueryBuilder,
    options: { assetTable?: string, templateTable?: string, allowDataFilter?: boolean } = {}
): Promise<void> {
    options = {allowDataFilter: true, ...options};

    const args = await filterQueryArgs(values, assetFilters);

    if (options.allowDataFilter !== false) {
        buildDataConditions(values, query, {assetTable: options.assetTable, templateTable: options.templateTable});
    }

    if (args.asset_id.length) {
        query.equalMany(options.assetTable + '.asset_id', args.asset_id);
    }

    if (args.owner.length) {
        query.equalMany(options.assetTable + '.owner', args.owner);
    }

    if (args.template_id.length) {
        if ((args.template_id.length === 1) && (args.template_id[0] === 'null')) {
            query.isNull(options.assetTable + '.template_id');
        } else {
            query.equalMany(options.assetTable + '.template_id', args.template_id);
        }
    }

    if (args.collection_name.length) {
        query.equalMany(options.assetTable + '.collection_name', args.collection_name);
    }

    if (args.schema_name.length) {
        query.equalMany(options.assetTable + '.schema_name', args.schema_name);
    }

    if (args.minter.length) {
        query.addCondition(`EXISTS (
            SELECT * FROM atomicassets_mints mint_table 
            WHERE ${options.assetTable}.contract = mint_table.contract AND ${options.assetTable}.asset_id = mint_table.asset_id
                AND mint_table.minter = ANY(${query.addVariable(args.minter)})
        )`);
    }

    if (args.initial_receiver.length) {
        query.addCondition(`EXISTS (
            SELECT * FROM atomicassets_mints mint_table 
            WHERE ${options.assetTable}.contract = mint_table.contract AND ${options.assetTable}.asset_id = mint_table.asset_id
                AND mint_table.receiver = ANY(${query.addVariable(args.initial_receiver)})
        )`);
    }

    if (args.burner.length) {
        query.equalMany(options.assetTable + '.burned_by_account', args.burner);
    }

    if (typeof args.burned === 'boolean') {
        if (args.burned) {
            query.isNull(options.assetTable + '.owner');
        } else {
            query.notNull(options.assetTable + '.owner');
        }
    }

    if (options.templateTable && typeof args.is_transferable === 'boolean') {
        if (args.is_transferable) {
            query.addCondition(options.templateTable + '.transferable IS DISTINCT FROM FALSE');
        } else {
            query.addCondition(options.templateTable + '.transferable = FALSE');
        }
    }

    if (options.templateTable && typeof args.is_burnable === 'boolean') {
        if (args.is_burnable) {
            query.addCondition(options.templateTable + '.burnable IS DISTINCT FROM FALSE');
        } else {
            query.addCondition(options.templateTable + '.burnable = FALSE');
        }
    }
}

export async function buildGreylistFilter(values: FilterValues, query: QueryBuilder, columns: { collectionName?: string, account?: string[] }): Promise<void> {
    const args = await filterQueryArgs(values, {
        collection_blacklist: {type: 'list[name]'},
        collection_whitelist: {type: 'list[name]'},
        account_blacklist: {type: 'list[name]'},
    });

    const collectionBlacklist: string[] = args.collection_blacklist;
    const collectionWhitelist: string[] = args.collection_whitelist;

    if (columns.collectionName) {
        if (collectionWhitelist.length > 0 && collectionBlacklist.length > 0) {
            query.equalMany(columns.collectionName, collectionWhitelist.filter(row => !collectionBlacklist.includes(row)));
        } else {
            if (collectionWhitelist.length > 0) {
                query.equalMany(columns.collectionName, collectionWhitelist);
            }

            if (collectionBlacklist.length > 0) {
                query.notMany(columns.collectionName, collectionBlacklist);
            }
        }
    }

    if (columns.account?.length && args.account_blacklist.length) {
        query.addCondition(
            'AND NOT EXISTS (SELECT * FROM UNNEST(' + query.addVariable(args.account_blacklist) + '::text[]) ' +
            'WHERE ' + columns.account.map(column => ('"unnest" = ' + column)).join(' OR ') + ') '
        );
    }
}

export async function buildHideOffersFilter(values: FilterValues, query: QueryBuilder, assetTable: string): Promise<void> {
    const args = await filterQueryArgs(values, {
        hide_offers: {type: 'bool', default: false}
    });

    if (args.hide_offers) {
        query.addCondition(
            'NOT EXISTS (' +
            'SELECT * FROM atomicassets_offers offer, atomicassets_offers_assets offer_asset ' +
            'WHERE offer_asset.contract = ' + assetTable + '.contract AND offer_asset.asset_id = ' + assetTable + '.asset_id AND ' +
            'offer.contract = offer_asset.contract AND offer.offer_id = offer_asset.offer_id AND ' +
            'offer.state = ' + OfferState.PENDING + ' ' +
            ')'
        );
    }
}
