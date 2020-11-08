import * as express from 'express';

import { filterQueryArgs, mergeRequestData } from '../utils';
import { buildAssetFilter, buildDataConditions } from '../atomicassets/utils';
import { AuctionApiState, SaleApiState } from './index';
import { AuctionState, SaleState } from '../../../filler/handlers/atomicmarket';
import { OfferState } from '../../../filler/handlers/atomicassets';

function hasAssetFilter(req: express.Request): boolean {
    const keys = Object.keys(mergeRequestData(req));

    for (const key of keys) {
        if (['template_id', 'schema_name', 'owner', 'is_transferable', 'is_burnable'].indexOf(key) >= 0) {
            return true;
        }
    }

    return false;
}

function hasDataFilters(req: express.Request): boolean {
    const keys = Object.keys(mergeRequestData(req));

    for (const key of keys) {
        if (['match'].indexOf(key) >= 0) {
            return true;
        }

        if (key.startsWith('data.') || key.startsWith('data:')) {
            return true;
        }
    }

    return false;
}

export function buildListingFilter(
    req: express.Request, varOffset: number
): {str: string, values: any[], counter: number} {
    const args = filterQueryArgs(req, {
        show_seller_contracts: {type: 'bool', default: true},
        contract_whitelist: {type: 'string', min: 1, default: ''},
        seller_blacklist: {type: 'string', min: 1},

        maker_marketplace: {type: 'string', min: 1, max: 12},
        taker_marketplace: {type: 'string', min: 1, max: 12},
        marketplace: {type: 'string', min: 1, max: 12},

        seller: {type: 'string', min: 1},
        buyer: {type: 'string', min: 1},

        collection_name: {type: 'string', min: 1},

        min_template_mint: {type: 'int', min: 1},
        max_template_mint: {type: 'int', min: 1},
        min_schema_mint: {type: 'int', min: 1},
        max_schema_mint: {type: 'int', min: 1},
        min_collection_mint: {type: 'int', min: 1},
        max_collection_mint: {type: 'int', min: 1}
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
        queryString += 'AND listing.collection_name = ANY ($' + ++varCounter + ') ';
        queryValues.push(args.collection_name.split(','));
    }

    if (!args.show_seller_contracts) {
        queryString += 'AND (' +
            'NOT EXISTS(SELECT * FROM contract_codes code WHERE code.account = listing.seller) OR ' +
            'listing.seller = ANY ($' + ++varCounter + ')' +
            ') ';
        queryValues.push(args.contract_whitelist.split(','));
    }

    if (args.seller_blacklist) {
        queryString += 'AND NOT (listing.seller = ANY ($' + ++varCounter + ')) ';
        queryValues.push(args.seller_blacklist.split(','));
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

    if (args.min_template_mint) {
        queryString += 'AND mint.max_template_mint >= $' + ++varCounter + ' ';
        queryValues.push(args.min_template_mint);
    }

    if (args.max_template_mint) {
        queryString += 'AND mint.min_template_mint <= $' + ++varCounter + ' ';
        queryValues.push(args.max_template_mint);
    }

    if (args.min_schema_mint) {
        queryString += 'AND mint.max_schema_mint >= $' + ++varCounter + ' ';
        queryValues.push(args.min_schema_mint);
    }

    if (args.max_schema_mint) {
        queryString += 'AND mint.min_schema_mint <= $' + ++varCounter + ' ';
        queryValues.push(args.max_schema_mint);
    }

    if (args.min_collection_mint) {
        queryString += 'AND mint.max_collection_mint >= $' + ++varCounter + ' ';
        queryValues.push(args.min_collection_mint);
    }

    if (args.max_collection_mint) {
        queryString += 'AND mint.min_collection_mint <= $' + ++varCounter + ' ';
        queryValues.push(args.max_collection_mint);
    }

    return {
        values: queryValues,
        str: queryString,
        counter: varCounter
    };
}

export function buildSaleFilter(
    req: express.Request, varOffset: number
): {str: string, values: any[], counter: number} {
    const args = filterQueryArgs(req, {
        state: {type: 'string', min: 0},
        asset_id: {type: 'int', min: 1},

        max_assets: {type: 'int', min: 1},
        min_assets: {type: 'int', min: 1},

        symbol: {type: 'string', min: 1},
        min_price: {type: 'float', min: 0},
        max_price: {type: 'float', min: 0}
    });

    let varCounter = varOffset;
    const queryValues: any[] = [];
    let queryString = '';

    const listingFilter = buildListingFilter(req, varOffset);

    queryString += listingFilter.str;
    queryValues.push(...listingFilter.values);
    varCounter += listingFilter.values.length;

    if (hasAssetFilter(req)) {
        const filter = buildAssetFilter(req, varCounter, {assetTable: '"asset"', allowDataFilter: false});

        queryString += 'AND EXISTS(' +
                'SELECT * ' +
                'FROM atomicassets_offers_assets offer_asset, atomicassets_assets asset ' +
                'WHERE ' +
                    'asset.contract = offer_asset.contract AND asset.asset_id = offer_asset.asset_id AND ' +
                    'offer_asset.offer_id = listing.offer_id AND offer_asset.contract = listing.assets_contract ' + filter.str + ' ' +
            ') ';

        queryValues.push(...filter.values);
        varCounter += filter.values.length;
    }

    if (hasDataFilters(req)) {
        const dataConditions = buildDataConditions(mergeRequestData(req), varCounter, '"asset_data"."data"');

        if (dataConditions) {
            queryString += 'AND EXISTS(' +
                'SELECT * ' +
                'FROM atomicassets_offers_assets offer_asset, atomicassets_asset_data asset_data ' +
                'WHERE ' +
                'asset_data.contract = offer_asset.contract AND asset_data.asset_id = offer_asset.asset_id AND ' +
                'offer_asset.offer_id = listing.offer_id AND offer_asset.contract = listing.assets_contract ' + dataConditions.str + ' ' +
                ') ';

            queryValues.push(...dataConditions.values);
            varCounter += dataConditions.values.length;
        }
    }

    if (args.max_assets) {
        queryString += `AND (
            SELECT COUNT(*) FROM atomicassets_offers_assets asset 
            WHERE asset.contract = listing.assets_contract AND asset.offer_id = listing.offer_id
        ) <= ${args.max_assets} `;
    }

    if (args.min_assets) {
        queryString += `AND (
            SELECT COUNT(*) FROM atomicassets_offers_assets asset 
            WHERE asset.contract = listing.assets_contract AND asset.offer_id = listing.offer_id
        ) >= ${args.min_assets} `;
    }

    if (args.asset_id) {
        queryString += 'AND EXISTS(' +
            'SELECT * FROM atomicassets_offers_assets asset ' +
            'WHERE asset.contract = listing.assets_contract AND ' +
            'asset.offer_id = listing.offer_id AND ' +
            'asset.asset_id = $' + ++varCounter + ' ' +
            ') ';
        queryValues.push(args.asset_id);
    }

    if (args.symbol) {
        queryString += ' AND listing.settlement_symbol = $' + ++varCounter + ' ';
        queryValues.push(args.symbol);

        if (args.min_price) {
            queryString += 'AND price.price >= 1.0 * $' + ++varCounter + ' * POWER(10, price.settlement_precision) ';
            queryValues.push(args.min_price);
        }

        if (args.max_price) {
            queryString += 'AND price.price <= 1.0 * $' + ++varCounter + ' * POWER(10, price.settlement_precision) ';
            queryValues.push(args.max_price);
        }
    }

    if (args.state) {
        const stateFilters: string[] = [];

        if (args.state.split(',').indexOf(String(SaleApiState.WAITING.valueOf())) >= 0) {
            stateFilters.push(`(listing.state = ${SaleState.WAITING.valueOf()})`);
        }

        if (args.state.split(',').indexOf(String(SaleApiState.LISTED.valueOf())) >= 0) {
            stateFilters.push(`(listing.state = ${SaleState.LISTED.valueOf()} AND offer.state = ${OfferState.PENDING.valueOf()})`);
        }

        if (args.state.split(',').indexOf(String(SaleApiState.CANCELED.valueOf())) >= 0) {
            stateFilters.push(`(listing.state = ${SaleState.CANCELED.valueOf()})`);
        }

        if (args.state.split(',').indexOf(String(SaleApiState.SOLD.valueOf())) >= 0) {
            stateFilters.push(`(listing.state = ${SaleState.SOLD.valueOf()})`);
        }

        if (args.state.split(',').indexOf(String(SaleApiState.INVALID.valueOf())) >= 0) {
            stateFilters.push(`(offer.state != ${OfferState.PENDING.valueOf()} AND listing.state = ${SaleState.LISTED.valueOf()})`);
        }

        queryString += 'AND (' + stateFilters.join(' OR ') + ') ';
    }

    return {
        values: queryValues,
        str: queryString,
        counter: varCounter
    };
}

export function buildAuctionFilter(
    req: express.Request, varOffset: number
): {str: string, values: any[], counter: number} {
    const args = filterQueryArgs(req, {
        state: {type: 'string', min: 0},
        asset_id: {type: 'int', min: 1},

        min_assets: {type: 'int', min: 1},
        max_assets: {type: 'int', min: 1},

        symbol: {type: 'string', min: 1},
        min_price: {type: 'float', min: 0},
        max_price: {type: 'float', min: 0}
    });

    let varCounter = varOffset;
    const queryValues: any[] = [];
    let queryString = '';

    const listingFilter = buildListingFilter(req, varCounter);

    queryString += listingFilter.str;
    queryValues.push(...listingFilter.values);
    varCounter += listingFilter.values.length;

    if (hasAssetFilter(req)) {
        const filter = buildAssetFilter(req, varCounter, {assetTable: '"asset"', allowDataFilter: false});

        queryString += 'AND EXISTS(' +
                'SELECT * ' +
                'FROM atomicassets_assets asset, atomicmarket_auctions_assets auction_asset ' +
                'WHERE ' +
                    'asset.contract = auction_asset.assets_contract AND asset.asset_id = auction_asset.asset_id AND ' +
                    'auction_asset.auction_id = listing.auction_id AND ' +
                    'auction_asset.market_contract = listing.market_contract ' + filter.str + ' ' +
            ') ';

        queryValues.push(...filter.values);
        varCounter += filter.values.length;
    }

    if (hasDataFilters(req)) {
        const dataConditions = buildDataConditions(mergeRequestData(req), varCounter, '"asset_data"."data"');

        if (dataConditions) {
            queryString += 'AND EXISTS(' +
                'SELECT * ' +
                'FROM atomicmarket_auctions_assets auction_asset, atomicassets_asset_data asset_data ' +
                'WHERE ' +
                'asset_data.contract = auction_asset.assets_contract AND asset_data.asset_id = auction_asset.asset_id AND ' +
                'auction_asset.auction_id = listing.auction_id AND ' +
                'auction_asset.market_contract = listing.market_contract ' + dataConditions.str + ' ' +
                ') ';

            queryValues.push(...dataConditions.values);
            varCounter += dataConditions.values.length;
        }
    }

    if (args.max_assets) {
        queryString += `AND (
            SELECT COUNT(*) FROM atomicmarket_auctions_assets asset 
            WHERE asset.market_contract = listing.market_contract AND asset.auction_id = listing.auction_id
        ) <= ${args.max_assets} `;
    }

    if (args.min_assets) {
        queryString += `AND (
            SELECT COUNT(*) FROM atomicmarket_auctions_assets asset 
            WHERE asset.market_contract = listing.market_contract AND asset.auction_id = listing.auction_id
        ) >= ${args.min_assets} `;
    }

    if (args.asset_id) {
        queryString += 'AND EXISTS(' +
            'SELECT * FROM atomicmarket_auctions_assets asset ' +
            'WHERE asset.market_contract = listing.market_contract AND ' +
            'listing.auction_id = listing.auction_id AND ' +
            'asset.asset_id = $' + ++varCounter + ' ' +
            ') ';
        queryValues.push(args.asset_id);
    }

    if (args.symbol) {
        queryString += ' AND listing.token_symbol = $' + ++varCounter + ' ';
        queryValues.push(args.symbol);

        if (args.min_price) {
            queryString += 'AND listing.price >= 1.0 * $' + ++varCounter + ' * POWER(10, "token".token_precision) ';
            queryValues.push(args.min_price);
        }

        if (args.max_price) {
            queryString += 'AND listing.price <= 1.0 * $' + ++varCounter + ' * POWER(10, "token".token_precision) ';
            queryValues.push(args.max_price);
        }
    }

    if (args.state) {
        const stateConditions: string[] = [];

        if (args.state.split(',').indexOf(String(AuctionApiState.WAITING.valueOf())) >= 0) {
            stateConditions.push(`(listing.state = ${AuctionState.WAITING.valueOf()})`);
        }

        if (args.state.split(',').indexOf(String(AuctionApiState.LISTED.valueOf())) >= 0) {
            stateConditions.push(`(listing.state = ${AuctionState.LISTED.valueOf()} AND listing.end_time > ${Date.now() / 1000})`);
        }

        if (args.state.split(',').indexOf(String(AuctionApiState.CANCELED.valueOf())) >= 0) {
            stateConditions.push(`(listing.state = ${AuctionState.CANCELED.valueOf()})`);
        }

        if (args.state.split(',').indexOf(String(AuctionApiState.SOLD.valueOf())) >= 0) {
            stateConditions.push(`(listing.state = ${AuctionState.LISTED.valueOf()} AND listing.end_time <= ${Date.now() / 1000} AND listing.buyer IS NOT NULL)`);
        }

        if (args.state.split(',').indexOf(String(AuctionApiState.INVALID.valueOf())) >= 0) {
            stateConditions.push(`(listing.state = ${AuctionState.LISTED.valueOf()} AND listing.end_time <= ${Date.now() / 1000} AND listing.buyer IS NULL)`);
        }

        queryString += 'AND (' + stateConditions.join(' OR ') + ') ';
    }

    return {
        values: queryValues,
        str: queryString,
        counter: varCounter
    };
}
