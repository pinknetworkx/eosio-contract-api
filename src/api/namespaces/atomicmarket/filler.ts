import { AssetFiller } from '../atomicassets/filler';
import { formatAsset } from '../atomicassets/format';
import { DB } from '../../server';
import { buildAssetFillerHook } from './format';

export async function fillAuctions(db: DB, assetContract: string, auctions: any[]): Promise<any[]> {
    const assetIDs: string[] = [];

    for (const auction of auctions) {
        assetIDs.push(...auction.assets);
    }

    const filler = new AssetFiller(
        db, assetContract, assetIDs, formatAsset, 'atomicassets_assets_master',
        buildAssetFillerHook({fetchPrices: true})
    );

    return await Promise.all(auctions.map(async (auction) => {
        auction.assets = await filler.fill(auction.assets);

        return auction;
    }));
}

export async function fillBuyoffers(db: DB, assetContract: string, buyoffers: any[]): Promise<any[]> {
    const assetIDs: string[] = [];

    for (const buyoffer of buyoffers) {
        assetIDs.push(...buyoffer.assets);
    }

    const filler = new AssetFiller(
        db, assetContract, assetIDs, formatAsset, 'atomicassets_assets_master',
        buildAssetFillerHook({fetchPrices: true})
    );

    return await Promise.all(buyoffers.map(async (buyoffer) => {
        buyoffer.assets = await filler.fill(buyoffer.assets);

        return buyoffer;
    }));
}

export async function fillSales(db: DB, assetContract: string, sales: any[]): Promise<any[]> {
    const assetIDs: string[] = [];

    for (const sale of sales) {
        assetIDs.push(...sale.assets);
    }

    const filler = new AssetFiller(
        db, assetContract, assetIDs, formatAsset, 'atomicassets_assets_master',
        buildAssetFillerHook({fetchPrices: true})
    );

    return await Promise.all(sales.map(async (sale) => {
        sale.assets = await filler.fill(sale.assets);

        return sale;
    }));
}
