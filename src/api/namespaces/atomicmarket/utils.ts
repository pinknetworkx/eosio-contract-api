import * as express from 'express';

import { filterQueryArgs } from '../utils';
import { buildAssetFilter, hasAssetFilter, hasDataFilters } from '../atomicassets/utils';
import { AuctionApiState, BuyofferApiState, SaleApiState } from './index';
import { AuctionState, BuyofferState, SaleState } from '../../../filler/handlers/atomicmarket';
import { OfferState } from '../../../filler/handlers/atomicassets';
import QueryBuilder from '../../builder';

export function buildListingFilter(req: express.Request, query: QueryBuilder): void {
    const args = filterQueryArgs(req, {
        show_seller_contracts: {type: 'bool', default: true},
        contract_whitelist: {type: 'string', min: 1, default: ''},

        seller_blacklist: {type: 'string', min: 1},
        buyer_blacklist: {type: 'string', min: 1},

        maker_marketplace: {type: 'string', min: 1, max: 12},
        taker_marketplace: {type: 'string', min: 1, max: 12},
        marketplace: {type: 'string', min: 1, max: 12},

        seller: {type: 'string', min: 1},
        buyer: {type: 'string', min: 1},

        collection_name: {type: 'string', min: 1},

        min_template_mint: {type: 'int', min: 1},
        max_template_mint: {type: 'int', min: 1}
    });

    if (args.seller) {
        query.equalMany('listing.seller', args.seller.split(','));
    }

    if (args.buyer) {
        query.equalMany('listing.buyer', args.buyer.split(','));
    }

    if (args.collection_name) {
        query.equalMany('listing.collection_name', args.collection_name.split(','));
    }

    if (!args.show_seller_contracts) {
        query.addCondition(
            'NOT EXISTS(' +
            'SELECT * FROM contract_codes code ' +
            'WHERE code.account = listing.seller AND code.account != ALL(' + query.addVariable(args.contract_whitelist.split(',')) + ')' +
            ')'
        );
    }

    if (args.seller_blacklist) {
        query.notMany('listing.seller', args.seller_blacklist.split(','));
    }

    if (args.buyer_blacklist) {
        query.notMany('listing.buyer', args.buyer_blacklist.split(','));
    }

    if (args.marketplace) {
        const varName = query.addVariable(args.marketplace.split(','));
        query.addCondition('AND (listing.maker_marketplace = ANY (' + varName + ') OR listing.taker_marketplace = ANY (' + varName + ')) ');
    } else {
        if (args.maker_marketplace) {
            query.equalMany('listing.maker_marketplace', args.maker_marketplace.split(','));
        }

        if (args.taker_marketplace) {
            query.equalMany('listing.taker_marketplace', args.taker_marketplace.split(','));
        }
    }

    if (args.min_template_mint || args.max_template_mint) {
        if ((args.min_template_mint && args.min_template_mint > 1) || (args.max_template_mint && args.max_template_mint < 1)) {
            query.addCondition('listing.template_mint != \'empty\'');
        }

        query.addCondition(
            'listing.template_mint <@ int4range(' +
            query.addVariable(args.min_template_mint ?? null) + ', ' +
            query.addVariable(args.max_template_mint ?? null) +
            ', \'[]\')'
        );
    }
}

export function buildSaleFilter(req: express.Request, query: QueryBuilder): void {
    const args = filterQueryArgs(req, {
        state: {type: 'string', min: 0},

        max_assets: {type: 'int', min: 1},
        min_assets: {type: 'int', min: 1},

        symbol: {type: 'string', min: 1},
        min_price: {type: 'float', min: 0},
        max_price: {type: 'float', min: 0}
    });

    buildListingFilter(req, query);

    if (hasAssetFilter(req, ['collection_name']) || hasDataFilters(req)) {
        const assetQuery = new QueryBuilder(
            'SELECT * FROM atomicassets_offers_assets offer_asset, ' +
            'atomicassets_assets asset LEFT JOIN atomicassets_templates "template" ON ("asset".contract = "template".contract AND "asset".template_id = "template".template_id)',
            query.buildValues()
        );

        assetQuery.join('asset', 'offer_asset', ['contract', 'asset_id']);
        assetQuery.addCondition(  'offer_asset.offer_id = listing.offer_id AND offer_asset.contract = listing.assets_contract');

        buildAssetFilter(req, assetQuery, {assetTable: '"asset"', templateTable: '"template"', allowDataFilter: true});

        query.addCondition('EXISTS(' + assetQuery.buildString() + ')');
        query.setVars(assetQuery.buildValues());
    }

    if (args.max_assets) {
        query.addCondition(
            `(
                SELECT COUNT(*) FROM (
                    SELECT FROM atomicassets_offers_assets asset
                    WHERE asset.contract = listing.assets_contract AND asset.offer_id = listing.offer_id LIMIT ${args.max_assets + 1}
                ) ct        
            ) <= ${args.max_assets} `
        );
    }

    if (args.min_assets) {
        query.addCondition(
            `(
                SELECT COUNT(*) FROM (
                    SELECT FROM atomicassets_offers_assets asset
                    WHERE asset.contract = listing.assets_contract AND asset.offer_id = listing.offer_id LIMIT ${args.min_assets}
                ) ct        
            ) >= ${args.min_assets} `
        );
    }

    if (args.symbol) {
        query.equal('listing.settlement_symbol', args.symbol);

        if (args.min_price) {
            query.addCondition('price.price >= 1.0 * ' + query.addVariable(args.min_price) + ' * POWER(10, price.settlement_precision)');
        }

        if (args.max_price) {
            query.addCondition('price.price <= 1.0 * ' + query.addVariable(args.max_price) + ' * POWER(10, price.settlement_precision)');
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

        query.addCondition('(' + stateFilters.join(' OR ') + ')');
    }
}

export function buildAuctionFilter(req: express.Request, query: QueryBuilder): void {
    const args = filterQueryArgs(req, {
        state: {type: 'string', min: 0},

        min_assets: {type: 'int', min: 1},
        max_assets: {type: 'int', min: 1},

        symbol: {type: 'string', min: 1},
        min_price: {type: 'float', min: 0},
        max_price: {type: 'float', min: 0},

        participant: {type: 'string', min: 1},
        bidder: {type: 'string', min: 1},
    });

    buildListingFilter(req, query);

    if (hasAssetFilter(req, ['collection_name']) || hasDataFilters(req)) {
        const assetQuery = new QueryBuilder(
            'SELECT * FROM atomicmarket_auctions_assets auction_asset, ' +
            'atomicassets_assets asset LEFT JOIN atomicassets_templates "template" ON ("asset".contract = "template".contract AND "asset".template_id = "template".template_id)',
            query.buildValues()
        );

        assetQuery.addCondition('asset.contract = auction_asset.assets_contract AND asset.asset_id = auction_asset.asset_id');
        assetQuery.join('auction_asset', 'listing', ['market_contract', 'auction_id']);

        buildAssetFilter(req, assetQuery, {assetTable: '"asset"', templateTable: '"template"', allowDataFilter: true});

        query.addCondition('EXISTS(' + assetQuery.buildString() + ')');
        query.setVars(assetQuery.buildValues());
    }

    if (args.participant) {
        const varName = query.addVariable(args.participant);

        query.addCondition(
            `(
                (listing.seller = ${varName} AND listing.claimed_by_seller IS FALSE and listing.state = ${AuctionState.LISTED.valueOf()} AND listing.end_time <= ${Math.floor(Date.now() / 1000)}::BIGINT)
                OR (listing.buyer = ${varName} AND listing.claimed_by_buyer IS FALSE and listing.state = ${AuctionState.LISTED.valueOf()} AND listing.end_time <= ${Math.floor(Date.now() / 1000)}::BIGINT)
                OR (listing.seller = ${varName} and listing.state = ${AuctionState.LISTED.valueOf()} AND listing.end_time > ${Math.floor(Date.now() / 1000)}::BIGINT)
                OR (listing.state = ${AuctionState.LISTED.valueOf()} AND listing.end_time > ${Math.floor(Date.now() / 1000)}::BIGINT AND EXISTS(
                    SELECT * FROM atomicmarket_auctions_bids bid WHERE bid.market_contract = listing.market_contract AND bid.auction_id = listing.auction_id AND bid.account = ${varName}
                ))
            )`
        );
    }

    if (args.max_assets) {
        query.addCondition(
            `(
                SELECT COUNT(*) FROM atomicmarket_auctions_assets asset 
                WHERE asset.market_contract = listing.market_contract AND asset.auction_id = listing.auction_id
            ) <= ${args.max_assets} `
        );
    }

    if (args.min_assets) {
        query.addCondition(
            `(
                SELECT COUNT(*) FROM atomicmarket_auctions_assets asset 
                WHERE asset.market_contract = listing.market_contract AND asset.auction_id = listing.auction_id
            ) >= ${args.min_assets} `
        );
    }

    if (args.bidder) {
        query.addCondition('EXISTS(SELECT * FROM atomicmarket_auctions_bids bid ' +
            'WHERE bid.market_contract = listing.market_contract AND bid.auction_id = listing.auction_id AND ' +
            'bid.account = ANY(' + query.addVariable(args.bidder.split(',')) + ') )');
    }

    if (args.symbol) {
        query.equal('listing.token_symbol', args.symbol);

        if (args.min_price) {
            query.addCondition('listing.price >= 1.0 * ' + query.addVariable(args.min_price) + ' * POWER(10, "token".token_precision)');
        }

        if (args.max_price) {
            query.addCondition('listing.price <= 1.0 * ' + query.addVariable(args.max_price) + ' * POWER(10, "token".token_precision)');
        }
    }

    if (args.state) {
        const stateConditions: string[] = [];

        if (args.state.split(',').indexOf(String(AuctionApiState.WAITING.valueOf())) >= 0) {
            stateConditions.push(`(listing.state = ${AuctionState.WAITING.valueOf()})`);
        }

        if (args.state.split(',').indexOf(String(AuctionApiState.LISTED.valueOf())) >= 0) {
            stateConditions.push(`(listing.state = ${AuctionState.LISTED.valueOf()} AND listing.end_time > ${Math.floor(Date.now() / 1000)}::BIGINT)`);
        }

        if (args.state.split(',').indexOf(String(AuctionApiState.CANCELED.valueOf())) >= 0) {
            stateConditions.push(`(listing.state = ${AuctionState.CANCELED.valueOf()})`);
        }

        if (args.state.split(',').indexOf(String(AuctionApiState.SOLD.valueOf())) >= 0) {
            stateConditions.push(`(listing.state = ${AuctionState.LISTED.valueOf()} AND listing.end_time <= ${Math.floor(Date.now() / 1000)}::BIGINT AND listing.buyer IS NOT NULL)`);
        }

        if (args.state.split(',').indexOf(String(AuctionApiState.INVALID.valueOf())) >= 0) {
            stateConditions.push(`(listing.state = ${AuctionState.LISTED.valueOf()} AND listing.end_time <= ${Math.floor(Date.now() / 1000)}::BIGINT AND listing.buyer IS NULL)`);
        }

        query.addCondition('(' + stateConditions.join(' OR ') + ')');
    }
}

export function buildBuyofferFilter(req: express.Request, query: QueryBuilder): void {
    const args = filterQueryArgs(req, {
        state: {type: 'string', min: 0},

        min_assets: {type: 'int', min: 1},
        max_assets: {type: 'int', min: 1},

        symbol: {type: 'string', min: 1},
        min_price: {type: 'float', min: 0},
        max_price: {type: 'float', min: 0}
    });

    buildListingFilter(req, query);

    if (hasAssetFilter(req, ['collection_name']) || hasDataFilters(req)) {
        const assetQuery = new QueryBuilder(
            'SELECT * FROM atomicmarket_buyoffers_assets buyoffer_asset, ' +
            'atomicassets_assets asset LEFT JOIN atomicassets_templates "template" ON ("asset".contract = "template".contract AND "asset".template_id = "template".template_id)',
            query.buildValues()
        );

        assetQuery.addCondition('asset.contract = buyoffer_asset.assets_contract AND asset.asset_id = buyoffer_asset.asset_id');
        assetQuery.join('buyoffer_asset', 'listing', ['market_contract', 'buyoffer_id']);

        buildAssetFilter(req, assetQuery, {assetTable: '"asset"', templateTable: '"template"', allowDataFilter: true});

        query.addCondition('EXISTS(' + assetQuery.buildString() + ')');
        query.setVars(assetQuery.buildValues());
    }

    if (args.max_assets) {
        query.addCondition(
            `(
                SELECT COUNT(*) FROM atomicmarket_buyoffers_assets asset 
                WHERE asset.market_contract = listing.market_contract AND asset.buyoffer_id = listing.buyoffer_id
            ) <= ${args.max_assets}`
        );
    }

    if (args.min_assets) {
        query.addCondition(
            `(
                SELECT COUNT(*) FROM atomicmarket_buyoffers_assets asset 
                WHERE asset.market_contract = listing.market_contract AND asset.buyoffer_id = listing.buyoffer_id
            ) >= ${args.min_assets}`
        );
    }

    if (args.symbol) {
        query.equal('listing.token_symbol', args.symbol);

        if (args.min_price) {
            query.addCondition('listing.price >= 1.0 * ' + query.addVariable(args.min_price) + ' * POWER(10, "token".token_precision)');
        }

        if (args.max_price) {
            query.addCondition('listing.price <= 1.0 * ' + query.addVariable(args.max_price) + ' * POWER(10, "token".token_precision)');
        }
    }

    if (args.state) {
        const stateConditions: string[] = [];

        if (args.state.split(',').indexOf(String(BuyofferApiState.PENDING.valueOf())) >= 0) {
            stateConditions.push(
                `(listing.state = ${BuyofferState.PENDING.valueOf()} AND 
                    NOT EXISTS(
                        SELECT * FROM atomicmarket_buyoffer_assets buyoffer_asset, atomicassets_assets asset) 
                        WHERE asset.contract = buyoffer_asset.assets_contract AND asset.asset_id = buyoffer_asset.asset_id AND
                            buyoffer_asset.market_contract = listing.market_contract AND buyoffer_asset.buyoffer_id = listing.buyoffer_id AND
                            asset.owner != listing.seller
                    )
                `);
        }

        if (args.state.split(',').indexOf(String(BuyofferApiState.DECLINED.valueOf())) >= 0) {
            stateConditions.push(`(listing.state = ${BuyofferState.DECLINED.valueOf()})`);
        }

        if (args.state.split(',').indexOf(String(BuyofferApiState.CANCELED.valueOf())) >= 0) {
            stateConditions.push(`(listing.state = ${BuyofferState.CANCELED.valueOf()})`);
        }

        if (args.state.split(',').indexOf(String(BuyofferApiState.ACCEPTED.valueOf())) >= 0) {
            stateConditions.push(`(listing.state = ${BuyofferState.ACCEPTED.valueOf()})`);
        }

        if (args.state.split(',').indexOf(String(BuyofferApiState.INVALID.valueOf())) >= 0) {
            stateConditions.push(
                `(listing.state = ${BuyofferState.PENDING.valueOf()} AND 
                    EXISTS(
                        SELECT * FROM atomicmarket_buyoffer_assets buyoffer_asset, atomicassets_assets asset) 
                        WHERE asset.contract = buyoffer_asset.assets_contract AND asset.asset_id = buyoffer_asset.asset_id AND
                            buyoffer_asset.market_contract = listing.market_contract AND buyoffer_asset.buyoffer_id = listing.buyoffer_id AND
                            asset.owner != listing.seller
                    )
                `);
        }

        query.addCondition('(' + stateConditions.join(' OR ') + ')');
    }
}
