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
        if (['match', 'match_immutable_name', 'match_mutable_name'].includes(key)) {
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
        if (Object.keys(mutableCondition).length > 0) {
            query.addCondition(options.assetTable + '.mutable_data @> ' + query.addVariable(JSON.stringify(mutableCondition)) + '::jsonb');
        }

        if (Object.keys(immutableCondition).length > 0) {
            query.addCondition(options.assetTable + '.immutable_data @> ' + query.addVariable(JSON.stringify(immutableCondition)) + '::jsonb');
        }

        if (typeof values.match_immutable_name === 'string' && values.match_immutable_name.length > 0) {
            query.addCondition(
                options.assetTable + '.immutable_data->>\'name\' IS NOT NULL AND ' +
                options.assetTable + '.immutable_data->>\'name\' ILIKE ' +
                query.addVariable('%' + values.match_immutable_name.replace('%', '\\%').replace('_', '\\_') + '%')
            );
        }

        if (typeof values.match_mutable_name === 'string' && values.match_mutable_name.length > 0) {
            query.addCondition(
                options.assetTable + '.mutable_data->>\'name\' IS NOT NULL AND ' +
                options.assetTable + '.mutable_data->>\'name\' ILIKE ' +
                query.addVariable('%' + values.match_mutable_name.replace('%', '\\%').replace('_', '\\_') + '%')
            );
        }
    }

    if (options.templateTable) {
        if (Object.keys(templateCondition).length > 0) {
            query.addCondition(options.templateTable + '.immutable_data @> ' + query.addVariable(JSON.stringify(templateCondition)) + '::jsonb');
        }

        if (typeof values.match === 'string' && values.match.length > 0) {
            query.addCondition(
                options.templateTable + '.immutable_data->>\'name\' IS NOT NULL AND ' +
                options.templateTable + '.immutable_data->>\'name\' ILIKE ' +
                query.addVariable('%' + values.match.replace('%', '\\%').replace('_', '\\_') + '%')
            );
        }

        if (typeof values.search === 'string' && values.search.length > 0) {
            query.addCondition(
                `${options.templateTable}.immutable_data->>'name' IS NOT NULL AND 
                ${query.addVariable(query.addVariable(values.search))} <% (${options.templateTable}.immutable_data->>'name')`
            );
        }
    }
}

const assetFilters: FiltersDefinition = {
    asset_id: {type: 'string', min: 1},
    owner: {type: 'string', min: 1},
    burned: {type: 'bool'},
    template_id: {type: 'string', min: 1},
    collection_name: {type: 'string', min: 1},
    schema_name: {type: 'string', min: 1},
    is_transferable: {type: 'bool'},
    is_burnable: {type: 'bool'},
    minter: {type: 'name[]'}
};

export function buildAssetFilter(
    values: FilterValues, query: QueryBuilder,
    options: { assetTable?: string, templateTable?: string, allowDataFilter?: boolean } = {}
): void {
    options = {allowDataFilter: true, ...options};

    const args = filterQueryArgs(values, assetFilters);

    if (options.allowDataFilter !== false) {
        buildDataConditions(values, query, {assetTable: options.assetTable, templateTable: options.templateTable});
    }

    if (args.asset_id) {
        query.equalMany(options.assetTable + '.asset_id', args.asset_id.split(','));
    }

    if (args.owner) {
        query.equalMany(options.assetTable + '.owner', args.owner.split(','));
    }

    if (args.template_id && args.template_id.toLowerCase() !== 'null') {
        query.equalMany(options.assetTable + '.template_id', args.template_id.split(','));
    }

    if (args.template_id && args.template_id.toLowerCase() === 'null') {
        query.isNull(options.assetTable + '.template_id');
    }

    if (args.collection_name) {
        query.equalMany(options.assetTable + '.collection_name', args.collection_name.split(','));
    }

    if (args.schema_name) {
        query.equalMany(options.assetTable + '.schema_name', args.schema_name.split(','));
    }

    if (args.minter && args.minter.length > 0) {
        query.addCondition(`EXISTS (
            SELECT * FROM atomicassets_mints mint_table 
            WHERE ${options.assetTable}.contract = mint_table.contract AND ${options.assetTable}.asset_id = mint_table.asset_id
                AND mint_table.minter = ANY(${query.addVariable(args.minter)})
        )`);
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

export function buildGreylistFilter(values: FilterValues, query: QueryBuilder, columns: { collectionName?: string, account?: string[] }): void {
    const args = filterQueryArgs(values, {
        collection_blacklist: {type: 'string', min: 1},
        collection_whitelist: {type: 'string', min: 1},
        account_blacklist: {type: 'string', min: 1}
    });

    let collectionBlacklist: string[] = [];
    let collectionWhitelist: string[] = [];

    if (args.collection_blacklist) {
        collectionBlacklist = args.collection_blacklist.split(',');
    }

    if (args.collection_whitelist) {
        collectionWhitelist = args.collection_whitelist.split(',');
    }

    if (columns.collectionName) {
        if (collectionWhitelist.length > 0 && collectionBlacklist.length > 0) {
            query.addCondition(
                'EXISTS (SELECT * FROM UNNEST(' + query.addVariable(collectionWhitelist.filter(row => !collectionBlacklist.includes(row))) + '::text[]) ' +
                'WHERE "unnest" = ' + columns.collectionName + ')'
            );
        } else {
            if (collectionWhitelist.length > 0) {
                query.addCondition(
                    'EXISTS (SELECT * FROM UNNEST(' + query.addVariable(collectionWhitelist) + '::text[]) ' +
                    'WHERE "unnest" = ' + columns.collectionName + ')'
                );
            }

            if (collectionBlacklist.length > 0) {
                query.addCondition(
                    'NOT EXISTS (SELECT * FROM UNNEST(' + query.addVariable(collectionBlacklist) + '::text[]) ' +
                    'WHERE "unnest" = ' + columns.collectionName + ')'
                );
            }
        }
    }

    if (columns.account?.length > 0 && args.account_blacklist) {
        const accounts = args.account_blacklist.split(',');

        if (accounts.length > 0) {
            query.addCondition(
                'AND NOT EXISTS (SELECT * FROM UNNEST(' + query.addVariable(accounts) + '::text[]) ' +
                'WHERE ' + columns.account.map(column => ('"unnest" = ' + column)).join(' OR ') + ') '
            );
        }
    }
}

export function buildHideOffersFilter(values: FilterValues, query: QueryBuilder, assetTable: string): void {
    const args = filterQueryArgs(values, {
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
