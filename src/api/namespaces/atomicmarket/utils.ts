import * as express from 'express';

import { filterQueryArgs } from '../utils';
import { buildAssetFilter } from '../atomicassets/utils';
import { SaleApiState } from './index';
import { SaleState } from '../../../filler/handlers/atomicmarket';
import { OfferState } from '../../../filler/handlers/atomicassets';

function hasAssetFilter(req: express.Request): boolean {
    const keys = Object.keys(req.query);

    for (const key of keys) {
        if (['template_id', 'schema_name', 'owner', 'match'].indexOf(key) >= 0) {
            return true;
        }

        if (key.startsWith('data.')) {
            return true;
        }
    }

    return false;
}

export function buildListingFilter(req: express.Request, varOffset: number): {str: string, values: any[], counter: number} {
    const args = filterQueryArgs(req, {
        show_blacklisted: {type: 'bool', default: false},
        whitelisted_seller_only: {type: 'bool', default: true},
        whitelisted_collections_only: {type: 'bool', default: true},
        whitelisted_only: {type: 'bool', default: true},

        maker_marketplace: {type: 'string', min: 1, max: 12},
        taker_marketplace: {type: 'string', min: 1, max: 12},
        marketplace: {type: 'string', min: 1, max: 12},
        symbol: {type: 'string', min: 1},

        seller: {type: 'string', min: 1},
        buyer: {type: 'string', min: 1},

        collection_name: {type: 'string', min: 1, max: 12},

        min_price: {type: 'float', min: 0},
        max_price: {type: 'float', min: 0}
    });

    let varCounter = varOffset;
    const queryValues: any[] = [];
    let queryString = '';

    if (args.seller) {
        queryString += 'AND listing.seller = ANY ($' + ++varCounter + ') ';
        queryValues.push(args.seller.split(','));
    }

    if (args.buyer) {
        queryString += 'AND listing.buyer = ANY ($' + ++varCounter + ') ';
        queryValues.push(args.buyer.split(','));
    }

    if (args.collection_name) {
        queryString += 'AND listing.collection_name = $' + ++varCounter + ' ';
        queryValues.push(args.collection_name);
    }

    if (args.whitelisted_only) {
        queryString += 'AND (listing.seller_whitelisted = true OR listing.collection_whitelisted = true) ';
    } else if (args.whitelisted_collections_only) {
        queryString += 'AND listing.collection_whitelisted = true ';
    } else if (args.whitelisted_seller_only) {
        queryString += 'AND listing.seller_whitelisted = true ';
    } else if (!args.show_blacklisted) {
        queryString += 'AND (listing.seller_blacklisted = false OR listing.seller_whitelisted = true) AND collection_blacklisted = false ';
    }

    if (args.marketplace) {
        queryString += 'AND (listing.maker_marketplace = ANY ($' + ++varCounter + ') OR listing.taker_marketplace = ANY ($' + varCounter + ')) ';
        queryValues.push(args.marketplace.split(','));
    } else {
        if (args.maker_marketplace) {
            queryString += 'AND listing.maker_marketplace = ANY ($' + ++varCounter + ') ';
            queryValues.push(args.maker_marketplace.split(','));
        }

        if (args.taker_marketplace) {
            queryString += 'AND listing.taker_marketplace = ANY ($' + ++varCounter + ') ';
            queryValues.push(args.taker_marketplace.split(','));
        }
    }

    if (args.symbol) {
        queryString += ' AND listing.raw_token_symbol = $' + ++varCounter + ' ';
        queryValues.push(args.symbol);

        if (args.min_price) {
            queryString += 'AND listing.raw_price >= 1.0 * $' + ++varCounter + ' / listing.raw_token_precision ';
            queryValues.push(args.min_price);
        }

        if (args.max_price) {
            queryString += 'AND listing.raw_price <= 1.0 * $' + ++varCounter + ' / listing.raw_token_precision ';
            queryValues.push(args.max_price);
        }
    }

    return {
        values: queryValues,
        str: queryString,
        counter: varCounter
    };
}

export function buildSaleFilter(req: express.Request, varOffset: number): {str: string, values: any[], counter: number} {
    const args = filterQueryArgs(req, {
        state: {type: 'string', min: 0},
        max_assets: {type: 'int', min: 1}
    });

    let varCounter = varOffset;
    const queryValues: any[] = [];
    let queryString = '';

    const listingFilter = buildListingFilter(req, varOffset);

    queryString += listingFilter.str;
    queryValues.push(...listingFilter.values);
    varCounter += listingFilter.values.length;

    if (hasAssetFilter(req)) {
        const filter = buildAssetFilter(req, varCounter, 'template.readable_name', 'asset.readable_name');

        queryString += 'AND EXISTS(' +
                'SELECT asset.asset_id ' +
                'FROM atomicassets_assets asset LEFT JOIN atomicassets_templates template ON ( ' +
                    'template.contract = asset.contract AND template.template_id = asset.template_id ' +
                '), atomicassets_offers_assets asset_o ' +
                'WHERE ' +
                    'asset.contract = asset_o.contract AND asset.asset_id = asset_o.asset_id AND ' +
                    'asset_o.offer_id = listing.offer_id AND asset_o.contract = listing.asset_contract ' + filter.str + ' ' +
            ') ';

        queryValues.push(...filter.values);
        varCounter += filter.values.length;
    }

    if (args.max_assets) {
        queryString += `COUNT(
            SELECT * FROM atomicassets_offers_assets asset 
            WHERE asset.contract = listing.asset_contract AND asset.offer_id = listing.offer_id
        ) <= ${args.max_assets}`;
    }

    if (args.state) {
        const stateConditions: string[] = [];

        if (args.state.split(',').indexOf(String(SaleApiState.LISTED.valueOf())) >= 0) {
            stateConditions.push(`(sale_state = ${SaleState.LISTED.valueOf()} AND listing.offer_state = ${OfferState.PENDING.valueOf()})`);
        }

        if (args.state.split(',').indexOf(String(SaleApiState.INVALID.valueOf())) >= 0) {
            stateConditions.push(`(offer_state != ${OfferState.PENDING.valueOf()} AND listing.sale_state != ${SaleState.SOLD.valueOf()})`);
        }

        if (args.state.split(',').indexOf(String(SaleApiState.SOLD.valueOf())) >= 0) {
            stateConditions.push(`(sale_state = ${SaleState.SOLD.valueOf()})`);
        }

        if (args.state.split(',').indexOf(String(SaleApiState.WAITING.valueOf())) >= 0) {
            stateConditions.push(`(sale_state = ${SaleState.WAITING.valueOf()})`);
        }

        queryString += 'AND ' + stateConditions.join(' OR ') + ' ';
    }

    return {
        values: queryValues,
        str: queryString,
        counter: varCounter
    };
}

export function buildAuctionFilter(req: express.Request, varOffset: number): {str: string, values: any[], counter: number} {
    const args = filterQueryArgs(req, {
        state: {type: 'string', min: 0},
        max_assets: {type: 'int', min: 1}
    });

    let varCounter = varOffset;
    const queryValues: any[] = [];
    let queryString = '';

    const listingFilter = buildListingFilter(req, varCounter);

    queryString += listingFilter.str;
    queryValues.push(...listingFilter.values);
    varCounter += listingFilter.values.length;

    if (hasAssetFilter(req)) {
        const filter = buildAssetFilter(req, varCounter, 'template.readable_name', 'asset.readable_name');

        queryString += 'AND EXISTS(' +
                'SELECT asset.asset_id ' +
                'FROM atomicassets_assets asset LEFT JOIN atomicassets_templates template ON ( ' +
                    'template.contract = asset.contract AND template.template_id = asset.template_id ' +
                '), atomicmarket_auctions_assets asset_a ' +
                'WHERE ' +
                    'asset.contract = asset_a.asset_contract AND asset.asset_id = asset_a.asset_id AND ' +
                    'asset_a.auction_id = listing.auction_id AND asset_a.market_contract = listing.market_contract ' + filter.str + ' ' +
            ') ';

        queryValues.push(...filter.values);
        varCounter += filter.values.length;
    }

    if (args.max_assets) {
        queryString += `COUNT(
            SELECT * FROM atomicmarket_auctions_assets asset 
            WHERE asset.market_contract = listing.market_contract AND asset.auction_id = listing.auction_id
        ) <= ${args.max_assets}`;
    }

    if (args.state) {
        queryString += 'AND auction_state = ANY ($' + ++varCounter + ') ';
        queryValues.push(args.state.split(','));
    }

    return {
        values: queryValues,
        str: queryString,
        counter: varCounter
    };
}
