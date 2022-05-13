import {buildAssetFilter, hasAssetFilter, hasDataFilters} from '../atomicassets/utils';
import {AuctionApiState, AuctionType} from './index';
import {AuctionState} from '../../../filler/handlers/neftymarket';
import QueryBuilder from '../../builder';
import {ApiError} from '../../error';
import {filterQueryArgs, FilterValues} from '../validation';

export function hasListingFilter(values: FilterValues, blacklist: string[] = []): boolean {
    const keys = Object.keys(values);

    for (const key of keys) {
        if (
            ['account', 'seller', 'buyer'].includes(key) &&
            !blacklist.includes(key)
        ) {
            return true;
        }
    }

    return false;
}

export function buildListingFilter(values: FilterValues, query: QueryBuilder): void {
    const args = filterQueryArgs(values, {
        show_seller_contracts: {type: 'bool', default: true},
        contract_whitelist: {type: 'string', min: 1, default: ''},

        seller_blacklist: {type: 'string', min: 1},
        buyer_blacklist: {type: 'string', min: 1},

        account: {type: 'string', min: 1},
        seller: {type: 'string', min: 1},
        buyer: {type: 'string', min: 1},

        collection_name: {type: 'string', min: 1},

        min_template_mint: {type: 'int', min: 1},
        max_template_mint: {type: 'int', min: 1}
    });

    if (args.account) {
        const varName = query.addVariable(args.account.split(','));

        query.addCondition('(listing.buyer = ANY (' + varName + ') OR listing.seller = ANY (' + varName + '))');
    }

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
        // TODO this excludes listings without a buyer, is that expected?
        query.notMany('listing.buyer', args.buyer_blacklist.split(','));
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



export function buildAuctionFilter(values: FilterValues, query: QueryBuilder): void {
    const args = filterQueryArgs(values, {
        state: {type: 'string', min: 1},
        type: {type: 'string', min: 1},

        min_assets: {type: 'int', min: 1},
        max_assets: {type: 'int', min: 1},

        symbol: {type: 'string', min: 1},
        min_price: {type: 'float', min: 0},
        max_price: {type: 'float', min: 0},
        min_buy_now_price: {type: 'float', min: 0},
        max_buy_now_price: {type: 'float', min: 0},

        participant: {type: 'string', min: 1},
        bidder: {type: 'string', min: 1},

        show_buy_now_only: {type: 'bool'},
        hide_empty_auctions: {type: 'bool'},
        template_blacklist: {type: 'int[]', min: 1},
    });

    buildListingFilter(values, query);

    if (args.template_blacklist.length || hasAssetFilter(values, ['collection_name']) || hasDataFilters(values)) {
        const assetQuery = new QueryBuilder(
            'SELECT * FROM neftymarket_auctions_assets auction_asset, ' +
            'atomicassets_assets asset LEFT JOIN atomicassets_templates "template" ON ("asset".contract = "template".contract AND "asset".template_id = "template".template_id)',
            query.buildValues()
        );

        assetQuery.addCondition('asset.contract = auction_asset.assets_contract AND asset.asset_id = auction_asset.asset_id');
        assetQuery.join('auction_asset', 'listing', ['market_contract', 'auction_id']);

        if (args.template_blacklist.length) {
            assetQuery.notMany('"asset"."template_id"', args.template_blacklist, true);
        }

        buildAssetFilter(values, assetQuery, {
            assetTable: '"asset"',
            templateTable: '"template"',
            allowDataFilter: true
        });

        query.addCondition('EXISTS(' + assetQuery.buildString() + ')');
        query.setVars(assetQuery.buildValues());
    }

    if (args.participant) {
        const varName = query.addVariable(args.participant);

        query.addCondition(
            `(
                (listing.seller = ${varName} AND listing.claimed_by_seller IS FALSE and listing.state = ${AuctionState.LISTED.valueOf()} AND listing.end_time <= ${Date.now()}::BIGINT)
                OR (listing.buyer = ${varName} AND listing.claimed_by_buyer IS FALSE and listing.state = ${AuctionState.LISTED.valueOf()} AND listing.end_time <= ${Date.now()}::BIGINT)
                OR (listing.seller = ${varName} and listing.state = ${AuctionState.LISTED.valueOf()} AND listing.end_time > ${Date.now()}::BIGINT)
                OR (listing.state = ${AuctionState.LISTED.valueOf()} AND listing.end_time > ${Date.now()}::BIGINT AND EXISTS(
                    SELECT * FROM neftymarket_auctions_bids bid WHERE bid.market_contract = listing.market_contract AND bid.auction_id = listing.auction_id AND bid.account = ${varName}
                ))
            )`
        );
    }

    if (args.hide_empty_auctions) {
        query.addCondition('EXISTS(SELECT * FROM neftymarket_auctions_bids bid ' +
            'WHERE bid.market_contract = listing.market_contract AND bid.auction_id = listing.auction_id)');
    }

    if (args.max_assets) {
        query.addCondition(
            `(
                SELECT COUNT(*) FROM neftymarket_auctions_assets asset 
                WHERE asset.market_contract = listing.market_contract AND asset.auction_id = listing.auction_id
            ) <= ${args.max_assets} `
        );
    }

    if (args.min_assets) {
        query.addCondition(
            `(
                SELECT COUNT(*) FROM neftymarket_auctions_assets asset 
                WHERE asset.market_contract = listing.market_contract AND asset.auction_id = listing.auction_id
            ) >= ${args.min_assets} `
        );
    }

    if (args.bidder) {
        query.addCondition('EXISTS(SELECT * FROM neftymarket_auctions_bids bid ' +
            'WHERE bid.market_contract = listing.market_contract AND bid.auction_id = listing.auction_id AND ' +
            'bid.account = ANY(' + query.addVariable(args.bidder.split(',')) + ') )');
    }

    if (args.show_buy_now_only) {
        query.addCondition('listing.buy_now_price > 0');
    }

    if (args.symbol) {
        query.equal('listing.token_symbol', args.symbol);

        if (args.min_price) {
            query.addCondition('listing.price >= 1.0 * ' + query.addVariable(args.min_price) + ' * POWER(10, "token".token_precision)');
        }

        if (args.max_price) {
            query.addCondition('listing.price <= 1.0 * ' + query.addVariable(args.max_price) + ' * POWER(10, "token".token_precision)');
        }

        if (args.min_buy_now_price) {
            query.addCondition('listing.buy_now_price >= 1.0 * ' + query.addVariable(args.min_buy_now_price) + ' * POWER(10, "token".token_precision)');
        }

        if (args.max_buy_now_price) {
            query.addCondition('listing.buy_now_price <= 1.0 * ' + query.addVariable(args.max_buy_now_price) + ' * POWER(10, "token".token_precision)');
        }
    } else if (args.min_price || args.max_price) {
        throw new ApiError('Price range filters require the "symbol" filter');
    }

    if (args.type) {
        const typeConditions: string[] = [];

        if (args.type.split(',').indexOf(String(AuctionType.ENGLISH.valueOf())) >= 0) {
            typeConditions.push(`listing.auction_type = ${AuctionType.ENGLISH.valueOf()}`);
        }

        if (args.type.split(',').indexOf(String(AuctionType.DUTCH.valueOf())) >= 0) {
            typeConditions.push(`listing.auction_type = ${AuctionType.DUTCH.valueOf()}`);
        }

        query.addCondition('(' + typeConditions.join(' OR ') + ')');
    }

    if (args.state) {
        const stateConditions: string[] = [];

        if (args.state.split(',').indexOf(String(AuctionApiState.WAITING.valueOf())) >= 0) {
            stateConditions.push(`(listing.state = ${AuctionState.LISTED.valueOf()} AND listing.start_time > ${Date.now()}::BIGINT)`);
        }

        if (args.state.split(',').indexOf(String(AuctionApiState.LISTED.valueOf())) >= 0) {
            stateConditions.push(`(listing.state = ${AuctionState.LISTED.valueOf()} AND listing.start_time < ${Date.now()}::BIGINT AND listing.end_time > ${Date.now()}::BIGINT)`);
        }

        if (args.state.split(',').indexOf(String(AuctionApiState.CANCELED.valueOf())) >= 0) {
            stateConditions.push(`(listing.state = ${AuctionState.CANCELED.valueOf()})`);
        }

        if (args.state.split(',').indexOf(String(AuctionApiState.SOLD.valueOf())) >= 0) {
            stateConditions.push(`(listing.state = ${AuctionState.LISTED.valueOf()} AND listing.end_time <= ${Date.now()}::BIGINT AND listing.buyer IS NOT NULL)`);
        }

        if (args.state.split(',').indexOf(String(AuctionApiState.INVALID.valueOf())) >= 0) {
            stateConditions.push(`(listing.state = ${AuctionState.LISTED.valueOf()} AND listing.end_time <= ${Date.now()}::BIGINT AND listing.buyer IS NULL)`);
        }

        query.addCondition('(' + stateConditions.join(' OR ') + ')');
    }
}
