import * as express from 'express';

import { filterQueryArgs } from '../utils';
import { buildAssetFilter } from '../atomicassets/utils';

export function buildSaleFilter(market_contract: string, req: express.Request, varOffset: number): {str: string, values: any[]} {
    const args = filterQueryArgs(req, {
        show_blacklisted: {type: 'bool', default: false},

        whitelisted_seller_only: {type: 'bool', default: true},
        whitelisted_collections_only: {type: 'bool', default: true},
        whitelisted_only: {type: 'bool', default: true},

        maker_marketplace: {type: 'string', min: 1, max: 12},
        taker_marketplace: {type: 'string', min: 1, max: 12},
        marketplace: {type: 'string', min: 1, max: 12},
        sale_state: {type: 'int', min: 1},
        token_symbol: {type: 'string', min: 1},
        seller: {type: 'string', min: 1}
    });

    const filter = buildAssetFilter(req, varOffset);

    let queryString = filter.str;
    let queryValues: any[] = filter.values;
    let varCounter = varOffset + filter.values.length;

    if (args.whitelisted_only) {

    } else if (args.whitelisted_collections_only) {

    } else if (args.whitelisted_seller_only) {

    } else if (args.show_blacklisted) {

    }

    return {
        values: queryValues,
        str: queryString
    };
}

export function buildAuctionFilter(market_contract: string, req: express.Request, varOffset: number): {str: string, values: any[]} {
    const args = filterQueryArgs(req, {
        show_blacklisted: {type: 'bool', default: false},

        whitelisted_seller_only: {type: 'bool', default: true},
        whitelisted_collections_only: {type: 'bool', default: true},
        whitelisted_only: {type: 'bool', default: true},

        maker_marketplace: {type: 'string', min: 1, max: 12},
        taker_marketplace: {type: 'string', min: 1, max: 12},
        marketplace: {type: 'string', min: 1, max: 12},
        sale_state: {type: 'int', min: 1},
        token_symbol: {type: 'string', min: 1},
        seller: {type: 'string', min: 1}
    });

    const filter = buildAssetFilter(req, varOffset);

    let queryString = filter.str;
    let queryValues: any[] = filter.values;
    let varCounter = varOffset + filter.values.length;

    if (args.whitelisted_only) {

    } else if (args.whitelisted_collections_only) {

    } else if (args.whitelisted_seller_only) {

    } else if (args.show_blacklisted) {

    }

    return {
        values: queryValues,
        str: queryString
    };
}
