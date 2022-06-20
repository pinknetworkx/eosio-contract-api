import { AuctionState } from '../../../filler/handlers/neftymarket';
import { AuctionApiState } from './index';
import {formatAsset} from '../atomicassets/format';
import {FillerHook} from '../atomicassets/filler';
import {DB} from '../../server';

export function formatAuction(row: any): any {
    const data = {...row};

    data.price.amount = row.raw_price;

    if (row.auction_state === AuctionState.LISTED.valueOf() && row.start_time > Date.now()) {
        data.state = AuctionApiState.WAITING.valueOf();
    } else if (row.auction_state === AuctionState.LISTED.valueOf() && row.end_time > Date.now()) {
        data.state = AuctionApiState.LISTED.valueOf();
    } else if (row.auction_state === AuctionState.CANCELED.valueOf()) {
        data.state = AuctionApiState.CANCELED.valueOf();
    } else if (row.auction_state === AuctionState.LISTED.valueOf() && row.end_time <= Date.now() && row.buyer !== null) {
        data.state = AuctionApiState.SOLD.valueOf();
    } else if (row.auction_state === AuctionState.SOLD.valueOf()) {
        data.state = AuctionApiState.SOLD.valueOf();
    } else {
        data.state = AuctionApiState.INVALID.valueOf();
    }

    data.start_time = String(data.start_time);
    data.end_time = String(data.end_time);

    delete data.raw_price;
    delete data.raw_token_symbol;
    delete data.raw_token_precision;
    delete data.collection_name;
    delete data.auction_state;

    return data;
}

export function formatListingAsset(row: any): any {
    return formatAsset(row);
}

export function buildAssetFillerHook(
    options: {fetchPrices?: boolean, fetchNeftyAuctions?: boolean}
): FillerHook {
    return async (db: DB, contract: string, rows: any[]): Promise<any[]> => {
        const assetIDs = rows.map(asset => asset.asset_id);

        const queries = await Promise.all([
            options.fetchPrices && db.query(
                'SELECT DISTINCT ON (price.market_contract, price.collection_name, price.template_id, price.symbol) ' +
                'price.market_contract, asset.collection_name, asset.template_id, ' +
                'token.token_symbol, token.token_precision, token.token_contract, ' +
                'price.median, price.average, price.suggested_median, price.suggested_average, price.min, price.max, price.sales ' +
                'FROM atomicassets_assets asset, neftymarket_template_prices price, neftymarket_tokens token ' +
                'WHERE asset.contract = price.assets_contract AND asset.collection_name = price.collection_name AND ' +
                'asset.template_id = price.template_id AND asset.template_id IS NOT NULL AND ' +
                'price.market_contract = token.market_contract AND price.symbol = token.token_symbol AND ' +
                'asset.contract = $1 AND asset.asset_id = ANY($2)',
                [contract, assetIDs]
            ),
            options.fetchNeftyAuctions && db.query(
                'SELECT auction.market_contract, auction.auction_id, auction_asset.asset_id ' +
                'FROM neftymarket_auctions auction, neftymarket_auctions_assets auction_asset ' +
                'WHERE auction.market_contract = auction_asset.market_contract AND auction.auction_id = auction_asset.auction_id AND ' +
                'auction_asset.assets_contract = $1 AND auction_asset.asset_id = ANY($2) AND ' +
                'auction.state = ' + AuctionState.LISTED.valueOf() + ' AND auction.end_time > ' + Date.now() + '::BIGINT ',
                [contract, assetIDs]
            ),
        ]);

        const assetData: {[key: string]: {sales: any[], auctions: any[]}} = {};
        const templateData: {[key: string]: {prices: any[]}} = {};

        for (const row of rows) {
            assetData[row.asset_id] = {sales: [], auctions: []};
        }

        for (const row of rows) {
            if (!row.template) {
                continue;
            }

            templateData[row.template.template_id] = {prices: []};
        }

        if (queries[0]) {
            for (const row of queries[0].rows) {
                templateData[row.template_id].prices.push({
                    market_contract: row.market_contract,
                    token: {
                        token_symbol: row.token_symbol,
                        token_precision: row.token_precision,
                        token_contract: row.token_contract,
                    },
                    median: row.median,
                    average: row.average,
                    suggested_median: row.suggested_median,
                    suggested_average: row.suggested_average,
                    min: row.min,
                    max: row.max,
                    sales: row.sales,
                });
            }
        }

        if (queries[1]) {
            for (const row of queries[0].rows) {
                assetData[row.asset_id].auctions.push({market_contract: row.market_contract, auction_id: row.auction_id});
            }
        }

        return rows.map(row => {
            const data = row.template ? templateData[row.template_id] : {};

            return {...row, ...assetData[row.asset_id], ...data};
        });
    };
}
