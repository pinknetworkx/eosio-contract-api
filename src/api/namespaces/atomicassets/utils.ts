import * as express from 'express';

import { filterQueryArgs, mergeRequestData } from '../utils';
import { OfferState } from '../../../filler/handlers/atomicassets';
import { SaleState } from '../../../filler/handlers/atomicmarket';

export function buildDataConditions(
    args: any, varCounter: number = 0, column: string
): {str: string, values: any[]} | null {
    const keys = Object.keys(args);

    const conditions: string[] = [];
    const values: any[] = [];

    const query: {[key: string]: string | number | boolean} = {};
    for (const key of keys) {
        if (key.startsWith('data:text.')) {
            query[key.substr('data:text.'.length)] = String(args[key]);
        } else if (key.startsWith('data:number.')) {
            query[key.substr('data:number.'.length)] = parseFloat(args[key]);
        } else if (key.startsWith('data:bool.')) {
            query[key.substr('data:bool.'.length)] = (args[key] === 'true' || args[key] === '1') ? 1 : 0;
        } else if (key.startsWith('data.')) {
            query[key.substr('data.'.length)] = args[key];
        }
    }

    if (Object.keys(query).length > 0) {
        conditions.push(' ' + column + ' @> $' + ++varCounter + '::jsonb ');
        values.push(JSON.stringify(query));
    }

    if (args.match && typeof args.match === 'string' && args.match.length > 0) {
        conditions.push(
            column + '->>\'name\' IS NOT NULL AND ' +
            'POSITION($' + ++varCounter + ' IN LOWER(' + column + '->>\'name\')) > 0'
        );
        values.push(args.match.toLowerCase());
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
            mergeRequestData(req), varCounter, '"data_table".data'
        );

        if (dataConditions) {
            queryValues = queryValues.concat(dataConditions.values);
            varCounter += dataConditions.values.length;

            queryString += 'AND EXISTS (' +
                'SELECT * FROM atomicassets_asset_data "data_table" ' +
                'WHERE "data_table".contract = ' + options.assetTable + '.contract AND ' +
                '"data_table".asset_id = ' + options.assetTable + '.asset_id ' + dataConditions.str +
                ') ';
        }
    }

    if (args.owner) {
        queryString += 'AND ' + options.assetTable + '.owner = ANY($' + ++varCounter + ') ';
        queryValues.push(args.owner.split(','));
    }

    if (args.template_id) {
        queryString += 'AND ' + options.assetTable + '.template_id = ANY($' + ++varCounter + ') ';
        queryValues.push(args.template_id.split(','));
    }

    if (args.collection_name) {
        queryString += 'AND ' + options.assetTable + '.collection_name = ANY ($' + ++varCounter + ') ';
        queryValues.push(args.collection_name.split(','));
    }

    if (args.schema_name) {
        queryString += 'AND ' + options.assetTable + '.schema_name = ANY($' + ++varCounter + ') ';
        queryValues.push(args.schema_name.split(','));
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
            queryString += 'AND (' + options.templateTable + '.transferable IS NULL OR  ' + options.templateTable + '.transferable = TRUE) ';
        } else {
            queryString += 'AND ' + options.templateTable + '.transferable = FALSE ';
        }
    }

    if (options.templateTable && typeof args.is_burnable === 'boolean') {
        if (args.is_burnable) {
            queryString += 'AND (' + options.templateTable + '.burnable IS NULL OR  ' + options.templateTable + '.burnable = TRUE) ';
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

    let collectionBlacklist: string[] = [];
    let collectionWhitelist: string[] = [];

    if (args.collection_blacklist) {
        collectionBlacklist = args.collection_blacklist.replace(/[^\w\s,.]/g, '').split(',');
    }

    if (args.collection_whitelist) {
        collectionWhitelist = args.collection_whitelist.replace(/[^\w\s,.]/g, '').split(',');
    }

    if (collectionWhitelist.length > 0) {
        collectionWhitelist = collectionWhitelist.filter(name => collectionBlacklist.indexOf(name) === -1);
    }

    function buildTemporaryTable(values: string[], table: string, column: string): string {
        return ' (VALUES ' + values.map(row => ('(\'' + row + '\')')).join(', ') + ') ' + table + ' (' + column + ') ';
    }

    if (collectionColumn) {
        if (collectionWhitelist.length > 0) {
            queryString += 'AND EXISTS (SELECT * FROM ' + buildTemporaryTable(collectionWhitelist, 'clist', 'name') + ' ' +
                'WHERE clist.name = ' + collectionColumn + ') ';
        } else if (collectionBlacklist.length > 0) {
            queryString += 'AND NOT EXISTS (SELECT * FROM ' + buildTemporaryTable(collectionBlacklist, 'clist', 'name') + ' ' +
                'WHERE clist.name = ' + collectionColumn + ') ';
        }
    }

    if (accountColumns.length > 0 && args.account_blacklist) {
        const accounts = args.account_blacklist.replace(/[^\w\s,.]/g, '').split(',');

        if (accounts.length > 0) {
            queryString += 'AND NOT EXISTS (SELECT * FROM ' + buildTemporaryTable(accounts, 'alist', 'name') + ' ' +
                'WHERE ' + accountColumns.map(column => (column + ' = alist.name')).join(' OR ') + ') ';
        }
    }

    return {
        values: [],
        str: queryString
    };
}

export function hideOfferAssets(req: express.Request): string {
    const args = filterQueryArgs(req, {
        hide_offers: {type: 'bool', default: false},
        hide_sales: {type: 'bool', default: false}
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

    if (args.hide_sales) {
        queryString += 'AND NOT EXISTS (' +
            'SELECT * FROM atomicmarket_sales sale, atomicassets_offers offer, atomicassets_offers_assets asset_o ' +
            'WHERE asset_o.contract = asset.contract AND asset_o.asset_id = asset.asset_id AND ' +
            'offer.contract = asset_o.contract AND offer.offer_id = asset_o.offer_id AND ' +
            'offer.state = ' + OfferState.PENDING.valueOf() + ' AND ' +
            'sale.assets_contract = offer.contract AND sale.offer_id = offer.offer_id AND ' +
            'sale.state = ' + SaleState.LISTED.valueOf() + ' ' +
            ') ';
    }

    return queryString;
}
