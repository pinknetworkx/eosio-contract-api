import * as express from 'express';

import { equalMany, filterQueryArgs, mergeRequestData } from '../utils';
import { OfferState } from '../../../filler/handlers/atomicassets';

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

export function buildDataConditions(
    args: any, varCounter: number = 0, options: {assetTable?: string, templateTable?: string}
): {str: string, values: any[]} | null {
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

    const conditions: string[] = [];
    const values: any[] = [];

    const templateCondition = Object.assign({}, buildConditionObject('data'), buildConditionObject('template_data'));
    const mutableCondition = buildConditionObject('mutable_data');
    const immutableCondition = buildConditionObject('immutable_data');

    if (!options.templateTable) {
        Object.assign(immutableCondition, buildConditionObject('data'), immutableCondition);
    }

    if (options.assetTable) {
        if (Object.keys(mutableCondition).length > 0) {
            conditions.push(' ' + options.assetTable + '.mutable_data @> $' + ++varCounter + '::jsonb ');
            values.push(JSON.stringify(mutableCondition));
        }

        if (Object.keys(immutableCondition).length > 0) {
            conditions.push(' ' + options.assetTable + '.immutable_data @> $' + ++varCounter + '::jsonb ');
            values.push(JSON.stringify(immutableCondition));
        }
    }

    if (options.templateTable) {
        if (Object.keys(templateCondition).length > 0) {
            conditions.push(' ' + options.templateTable + '.immutable_data @> $' + ++varCounter + '::jsonb ');
            values.push(JSON.stringify(templateCondition));
        }

        if (args.match && typeof args.match === 'string' && args.match.length > 0) {
            conditions.push(
                options.templateTable + '.immutable_data->>\'name\' IS NOT NULL AND ' +
                options.templateTable + '.immutable_data->>\'name\' ILIKE $' + ++varCounter + ' '
            );
            values.push('%' + args.match.replace('%', '\\%').replace('_', '\\_') + '%');
        }
    }

    if (args.full_match && options.assetTable && options.templateTable) {
        const varNum = ++varCounter;
        conditions.push(
            [
                '(' + options.templateTable + '.immutable_data->>\'name\' IS NOT NULL AND ' + options.templateTable + '.immutable_data->>\'name\' ILIKE $' + varNum + ') ',
                '(' + options.assetTable + '.immutable_data->>\'name\' IS NOT NULL AND ' + options.assetTable + '.immutable_data->>\'name\' ILIKE $' + varNum + ') ',
                '(' + options.assetTable + '.mutable_data->>\'name\' IS NOT NULL AND ' + options.assetTable + '.mutable_data->>\'name\' ILIKE $' + varNum + ') '
            ].join(' OR ')
        );
        values.push('%' + args.full_match.replace('%', '\\%').replace('_', '\\_') + '%');
    }

    if (conditions.length > 0) {
        return {
            str: 'AND ' + conditions.join(' AND ') + ' ', values
        };
    }

    return null;
}

export function buildAssetFilter(
    req: express.Request, varOffset: number,
    options: {assetTable?: string, templateTable?: string, allowDataFilter?: boolean} = {}
): {str: string, values: any[]} {
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

    let queryString = '';
    let queryValues: any[] = [];
    let varCounter = varOffset;

    if (options.allowDataFilter !== false) {
        const dataConditions = buildDataConditions(
            mergeRequestData(req), varCounter,
            {assetTable: options.assetTable, templateTable: options.templateTable}
        );

        if (dataConditions) {
            queryValues = queryValues.concat(dataConditions.values);
            varCounter += dataConditions.values.length;
            queryString += dataConditions.str;
        }
    }

    if (args.asset_id) {
        queryString += 'AND ' + equalMany(options.assetTable + '.asset_id', args.asset_id, queryValues, ++varCounter);
    }

    if (args.owner) {
        queryString += 'AND ' + equalMany(options.assetTable + '.owner', args.owner, queryValues, ++varCounter);
    }

    if (args.template_id) {
        queryString += 'AND ' + equalMany(options.assetTable + '.template_id', args.template_id, queryValues, ++varCounter);
    }

    if (args.collection_name) {
        queryString += 'AND ' + equalMany(options.assetTable + '.collection_name', args.collection_name, queryValues, ++varCounter);
    }

    if (args.schema_name) {
        queryString += 'AND ' + equalMany(options.assetTable + '.schema_name', args.schema_name, queryValues, ++varCounter);
    }

    if (typeof args.burned === 'boolean') {
        if (args.burned) {
            queryString += 'AND ' + options.assetTable + '.owner IS NULL ';
        } else {
            queryString += 'AND ' + options.assetTable + '.owner IS NOT NULL ';
        }
    }

    if (options.templateTable && typeof args.is_transferable === 'boolean') {
        if (args.is_transferable) {
            queryString += 'AND ' + options.templateTable + '.transferable IS DISTINCT FROM FALSE ';
        } else {
            queryString += 'AND ' + options.templateTable + '.transferable = FALSE ';
        }
    }

    if (options.templateTable && typeof args.is_burnable === 'boolean') {
        if (args.is_burnable) {
            queryString += 'AND ' + options.templateTable + '.burnable IS DISTINCT FROM FALSE ';
        } else {
            queryString += 'AND ' + options.templateTable + '.burnable = FALSE ';
        }
    }

    return {
        values: queryValues,
        str: queryString
    };
}

export function buildGreylistFilter(
    req: express.Request, varOffset: number, collectionColumn: string = 'collection_name', accountColumns: string[] = []
): {str: string, values: any[]} {
    const args = filterQueryArgs(req, {
        collection_blacklist: {type: 'string', min: 1},
        collection_whitelist: {type: 'string', min: 1},
        account_blacklist: {type: 'string', min: 1}
    });

    let queryString = '';
    const queryValues: any[] = [];
    let varCounter = varOffset;

    let collectionBlacklist: string[] = [];
    let collectionWhitelist: string[] = [];

    if (args.collection_blacklist) {
        collectionBlacklist = args.collection_blacklist.split(',');
    }

    if (args.collection_whitelist) {
        collectionWhitelist = args.collection_whitelist.split(',');
    }

    if (collectionColumn) {
        if (collectionWhitelist.length > 0 && collectionBlacklist.length > 0) {
            queryString += 'AND EXISTS (SELECT * FROM UNNEST($' + ++varCounter + '::text[]) ' +
                'WHERE "unnest" = ' + collectionColumn + ') ';
            queryValues.push(collectionWhitelist.filter(row => collectionBlacklist.indexOf(row) === -1));
        } else {
            if (collectionWhitelist.length > 0) {
                queryString += 'AND EXISTS (SELECT * FROM UNNEST($' + ++varCounter + '::text[]) ' +
                    'WHERE "unnest" = ' + collectionColumn + ') ';
                queryValues.push(collectionWhitelist);
            }

            if (collectionBlacklist.length > 0) {
                queryString += 'AND NOT EXISTS (SELECT * FROM UNNEST($' + ++varCounter + '::text[]) ' +
                    'WHERE "unnest" = ' + collectionColumn + ') ';
                queryValues.push(collectionBlacklist);
            }
        }
    }

    if (accountColumns.length > 0 && args.account_blacklist) {
        const accounts = args.account_blacklist.split(',');

        if (accounts.length > 0) {
            queryString += 'AND NOT EXISTS (SELECT * FROM UNNEST($' + ++varCounter + '::text[]) ' +
                'WHERE ' + accountColumns.map(column => ('"unnest" = ' + column)).join(' OR ') + ') ';
            queryValues.push(accounts);
        }
    }

    return {
        values: queryValues,
        str: queryString
    };
}

export function hideOfferAssets(req: express.Request): string {
    const args = filterQueryArgs(req, {
        hide_offers: {type: 'bool', default: false}
    });

    let queryString = '';

    if (args.hide_offers) {
        queryString += 'AND NOT EXISTS (' +
            'SELECT * FROM atomicassets_offers offer, atomicassets_offers_assets asset_o ' +
            'WHERE asset_o.contract = asset.contract AND asset_o.asset_id = asset.asset_id AND ' +
                'offer.contract = asset_o.contract AND offer.offer_id = asset_o.offer_id AND ' +
                'offer.state = ' + OfferState.PENDING.valueOf() + ' ' +
        ') ';
    }

    return queryString;
}
