import {PoolClient} from 'pg';
import logger from './winston';
import {TemplateBuyofferApiState} from '../api/namespaces/atomicmarket';
import fetch from 'node-fetch';

interface TemplateBuyoffer {
    market_contract: string;
    assets_contract: string;
    buyoffer_id: string;
    seller: string;
    buyer: string;
    price: {
        amount: string;
        token_precision: number;
        token_contract: string;
        token_symbol: string;
    }
    maker_marketplace: string;
    taker_marketplace: string;
    collection: {
        collection_name: string;
        market_fee: number;
    };
    template: {
        template_id: string;
    };
    assets: {
        asset_id: string;
    }[];
    template_mint: string;
    updated_at_block: string;
    updated_at_time: string;
    created_at_block: string;
    created_at_time: string;
    state: number;
}

export async function fixTemplateBuyoffers(client: PoolClient, chainId: string, contract_reader: string): Promise<void> {
    const startBlockByChain: Record<string, number> = {
        'f16b1833c747c43682f4386fca9cbb327929334a762755ebec17f6f23c9b8a12': 248490057,
        '1064487b3cd1a897ce03ae5b6a865651747e2e152090f99c1d19d44e01aea5a4': 283057088,
    };
    const upToDateApiByChain: Record<string, string> = {
        'f16b1833c747c43682f4386fca9cbb327929334a762755ebec17f6f23c9b8a12': 'https://test.wax.api.atomicassets.io',
        '1064487b3cd1a897ce03ae5b6a865651747e2e152090f99c1d19d44e01aea5a4': 'https://wax.api.atomicassets.io',
    };
    const lastProcessedBlock =
        (await client.query<{block_time: string; block_num: string}>('SELECT block_num, block_time FROM contract_readers WHERE "name" = $1', [contract_reader])).rows[0]
    ;
    const lowestBuyofferId = parseInt(
        (await client.query<{buyoffer_id: string}>('SELECT COALESCE(MIN(buyoffer_id), 0) buyoffer_id FROM atomicmarket_template_buyoffers')).rows[0].buyoffer_id
    );
    logger.info(JSON.stringify(lastProcessedBlock) + lowestBuyofferId.toString());
    if (!lastProcessedBlock || parseInt(lastProcessedBlock.block_num) < startBlockByChain[chainId] || lowestBuyofferId === 1) {
        logger.info('Fix is not needed, you may return on main branch');
        return;
    }
    const lastProcessedBlockTime = parseInt(lastProcessedBlock.block_time);

    const updatedSinceBuyoffers = await fetchListedUpdatedAfter(upToDateApiByChain[chainId], lastProcessedBlockTime, lowestBuyofferId);

    const existingBuyoffers = await fetchAllUpdatedBefore(upToDateApiByChain[chainId], lastProcessedBlockTime, lowestBuyofferId);

    if (updatedSinceBuyoffers.length + existingBuyoffers.length > 0) {
        logger.info(`Fix is needed, ${updatedSinceBuyoffers.length + existingBuyoffers.length} template_buyoffers are missing and will be inserted`);

        await client.query('BEGIN');

        const sqlLines = updatedSinceBuyoffers.map((buyoffer) => {
            return `('${buyoffer.market_contract}', ${buyoffer.buyoffer_id}, '${buyoffer.buyer}', NULL, ${buyoffer.price.amount}, '${buyoffer.price.token_symbol}', '${buyoffer.assets_contract}', '${buyoffer.maker_marketplace}', NULL, NULL, '${buyoffer.collection.collection_name}', ${buyoffer.collection.market_fee}, '${buyoffer.template.template_id}', ${TemplateBuyofferApiState.LISTED}, ${buyoffer.created_at_block}, ${buyoffer.created_at_time}, ${buyoffer.created_at_block}, ${buyoffer.created_at_time})`;
        });

        const sqlLines2 = existingBuyoffers.map((buyoffer) => {
            return `('${buyoffer.market_contract}', ${buyoffer.buyoffer_id}, '${buyoffer.buyer}', ${buyoffer.seller ? `'${buyoffer.seller}'` : 'NULL'}, ${buyoffer.price.amount}, '${buyoffer.price.token_symbol}', '${buyoffer.assets_contract}', '${buyoffer.maker_marketplace}', ${buyoffer.taker_marketplace !== null ? `'${buyoffer.taker_marketplace}'` : 'NULL'}, ${buyoffer.template_mint ? `'{${buyoffer.template_mint},${buyoffer.template_mint}}'` : 'NULL'}, '${buyoffer.collection.collection_name}', ${buyoffer.collection.market_fee}, '${buyoffer.template.template_id}', ${buyoffer.state}, ${buyoffer.updated_at_block}, ${buyoffer.updated_at_time}, ${buyoffer.created_at_block}, ${buyoffer.created_at_time})`;
        });
        let buyoffersQuery = 'INSERT INTO atomicmarket_template_buyoffers (market_contract, buyoffer_id, buyer, seller, price, token_symbol, assets_contract, maker_marketplace, taker_marketplace, template_mint, collection_name, collection_fee, template_id, state, updated_at_block, updated_at_time, created_at_block, created_at_time) VALUES ';
        buyoffersQuery += sqlLines.concat(sqlLines2).join(',');

        const buyoffersResult = await client.query(buyoffersQuery);
        logger.info(`Inserted ${buyoffersResult.rowCount} template_buyoffers`);

        if (existingBuyoffers.length > 0) {
            const sqlLinesAssets = existingBuyoffers.filter((buyoffer) => buyoffer.state == TemplateBuyofferApiState.SOLD).map((buyoffer) => {
                return `('${buyoffer.market_contract}', ${buyoffer.buyoffer_id}, '${buyoffer.assets_contract}', 1, ${buyoffer.assets[0].asset_id})`;
            });

            let buyoffersAssetsQuery = 'INSERT INTO atomicmarket_template_buyoffers_assets (market_contract, buyoffer_id, assets_contract, "index", asset_id) VALUES ';
            buyoffersAssetsQuery += sqlLinesAssets.join(',');
            logger.info(buyoffersAssetsQuery);
            const buyoffersAssetsResult = await client.query(buyoffersAssetsQuery);
            logger.info(`Inserted ${buyoffersAssetsResult.rowCount} template_buyoffers_assets`);
        }

        await client.query('COMMIT');
        logger.info('Fix is successfully applied, you may return on main branch');
    }
}

async function fetchListedUpdatedAfter(endpoint: string, lastBlockTime: number, minBuyofferId: number): Promise<TemplateBuyoffer[]> {
    let page = 1;
    let moreResults = true;
    let buyoffers: TemplateBuyoffer[] = [];
    while(moreResults) {
        const result = await fetch(`${endpoint}/atomicmarket/v1/template_buyoffers?sort=updated&after=${lastBlockTime}&limit=100&page=${page}`);
        const jsonResult = await result.json();
        buyoffers = buyoffers.concat(jsonResult.data as TemplateBuyoffer[]);
        if (jsonResult.data.length < 100) {
            moreResults = false;
        }
        page++;
    }
    buyoffers = buyoffers.filter((buyoffer) => {
        return parseInt(buyoffer.created_at_time) <= lastBlockTime && (minBuyofferId === 0 || parseInt(buyoffer.buyoffer_id) < minBuyofferId);
    });
    return buyoffers;
}

async function fetchAllUpdatedBefore(endpoint: string, lastBlockTime: number, minBuyofferId: number): Promise<TemplateBuyoffer[]> {
    let page = 1;
    let moreResults = true;
    let buyoffers: TemplateBuyoffer[] = [];
    while(moreResults) {
        const result = await fetch(`${endpoint}/atomicmarket/v1/template_buyoffers?sort=updated&before=${lastBlockTime}&limit=100&page=${page}`);
        const jsonResult = await result.json();
        buyoffers = buyoffers.concat(jsonResult.data as TemplateBuyoffer[]);
        if (jsonResult.data.length < 100) {
            moreResults = false;
        }
        page++;
    }
    buyoffers = buyoffers.filter((buyoffer) => {
        return minBuyofferId === 0 || parseInt(buyoffer.buyoffer_id) < minBuyofferId;
    });
    return buyoffers;
}
