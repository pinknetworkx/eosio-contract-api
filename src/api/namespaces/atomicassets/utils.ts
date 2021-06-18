import * as express from 'express';

import { filterQueryArgs, mergeRequestData } from '../utils';
import { OfferState } from '../../../filler/handlers/atomicassets';
import QueryBuilder from '../../builder';

export function hasAssetFilter(req: express.Request, blacklist: string[] = []): boolean {
    const keys = Object.keys(mergeRequestData(req));

    for (const key of keys) {
        if (
            ['asset_id', 'collection_name', 'template_id', 'schema_name','owner', 'is_transferable', 'is_burnable'].indexOf(key) >= 0 &&
            blacklist.indexOf(key) === -1
        ) {
            return true;
        }
    }

    return false;
}

export function hasDataFilters(req: express.Request): boolean {
    const keys = Object.keys(mergeRequestData(req));

    for (const key of keys) {
        if (['match', 'full_match'].indexOf(key) >= 0) {
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

export function buildDataConditions(req: express.Request, query: QueryBuilder, options: {assetTable?: string, templateTable?: string}): void {
    const args = mergeRequestData(req);
    const keys = Object.keys(args);

    function buildConditionObject(name: string): {[key: string]: string | number | boolean} {
        const query: {[key: string]: string | number | boolean} = {};

        for (const key of keys) {
            if (key.startsWith(name + ':text.')) {
                query[key.substr((name + ':text.').length)] = String(args[key]);
            } else if (key.startsWith(name + ':number.')) {
                query[key.substr((name + ':number.').length)] = parseFloat(args[key]);
            } else if (key.startsWith(name + ':bool.')) {
                query[key.substr((name + ':bool.').length)] = (args[key] === 'true' || args[key] === '1') ? 1 : 0;
            } else if (key.startsWith(name + '.')) {
                query[key.substr((name + '.').length)] = args[key];
            }
        }

        return query;
    }

    const templateCondition = Object.assign({}, buildConditionObject('data'), buildConditionObject('template_data'));
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
    }

    if (options.templateTable) {
        if (Object.keys(templateCondition).length > 0) {
            query.addCondition(options.templateTable + '.immutable_data @> ' + query.addVariable(JSON.stringify(templateCondition)) + '::jsonb');
        }

        if (args.match && typeof args.match === 'string' && args.match.length > 0) {
            query.addCondition(
                options.templateTable + '.immutable_data->>\'name\' IS NOT NULL AND ' +
                options.templateTable + '.immutable_data->>\'name\' ILIKE ' +
                query.addVariable('%' + args.match.replace('%', '\\%').replace('_', '\\_') + '%')
            );
        }
    }
}

export function buildAssetFilter(
    req: express.Request, query: QueryBuilder,
    options: {assetTable?: string, templateTable?: string, allowDataFilter?: boolean} = {}
): void {
    options = Object.assign({allowDataFilter: true}, options);

    const args = filterQueryArgs(req, {
        asset_id: {type: 'string', min: 1},
        owner: {type: 'string', min: 1, max: 12},
        burned: {type: 'bool'},
        template_id: {type: 'string', min: 1},
        collection_name: {type: 'string', min: 1},
        schema_name: {type: 'string', min: 1},
        is_transferable: {type: 'bool'},
        is_burnable: {type: 'bool'}
    });

    if (options.allowDataFilter !== false) {
        buildDataConditions(req, query, {assetTable: options.assetTable, templateTable: options.templateTable});
    }

    if (args.asset_id) {
        query.equalMany(options.assetTable + '.asset_id', args.asset_id.split(','));
    }

    if (args.owner) {
        query.equalMany(options.assetTable + '.owner', args.owner.split(','));
    }

    if (args.template_id) {
        query.equalMany(options.assetTable + '.template_id', args.template_id.split(','));
    }

    if (args.collection_name) {
        query.equalMany(options.assetTable + '.collection_name', args.collection_name.split(','));
    }

    if (args.schema_name) {
        query.equalMany(options.assetTable + '.schema_name', args.schema_name.split(','));
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

export function buildGreylistFilter(req: express.Request, query: QueryBuilder, columns: {collectionName?: string, account?: string[]}): void {
    const args = filterQueryArgs(req, {
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
                'EXISTS (SELECT * FROM UNNEST(' + query.addVariable(collectionWhitelist.filter(row => collectionBlacklist.indexOf(row) === -1)) + '::text[]) ' +
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

    if (columns.account && columns.account.length > 0 && args.account_blacklist) {
        const accounts = args.account_blacklist.split(',');

        if (accounts.length > 0) {
            query.addCondition(
                'AND NOT EXISTS (SELECT * FROM UNNEST(' + query.addVariable(accounts) + '::text[]) ' +
                'WHERE ' + columns.account.map(column => ('"unnest" = ' + column)).join(' OR ') + ') '
            );
        }
    }
}

export function buildHideOffersFilter(req: express.Request, query: QueryBuilder, assetTable: string): void {
    const args = filterQueryArgs(req, {
        hide_offers: {type: 'bool', default: false}
    });

    if (args.hide_offers) {
        query.addCondition(
            'NOT EXISTS (' +
            'SELECT * FROM atomicassets_offers offer, atomicassets_offers_assets offer_asset ' +
            'WHERE offer_asset.contract = ' + assetTable + '.contract AND offer_asset.asset_id = ' + assetTable + '.asset_id AND ' +
            'offer.contract = offer_asset.contract AND offer.offer_id = offer_asset.offer_id AND ' +
            'offer.state = ' + OfferState.PENDING.valueOf() + ' ' +
            ')'
        );
    }
}
