import { AssetFiller } from '../atomicassets/filler';
import { formatAsset } from '../atomicassets/format';
import { HTTPServer } from '../../server';
import { buildAssetFillerHook } from './format';

export async function fillAuctions(server: HTTPServer, assetContract: string, auctions: any[]): Promise<any[]> {
    const assetIDs: string[] = [];

    for (const auction of auctions) {
        assetIDs.push(...auction.assets);
    }

    const filler = new AssetFiller(
        server, assetContract, assetIDs, formatAsset, 'atomicassets_assets_master',
        buildAssetFillerHook({fetchPrices: true})
    );

    return await Promise.all(auctions.map(async (auction) => {
        auction.assets = await filler.fill(auction.assets);

        return auction;
    }));
}

export async function fillBuyoffers(server: HTTPServer, assetContract: string, buyoffers: any[]): Promise<any[]> {
    const assetIDs: string[] = [];

    for (const buyoffer of buyoffers) {
        assetIDs.push(...buyoffer.assets);
    }

    const filler = new AssetFiller(
        server, assetContract, assetIDs, formatAsset, 'atomicassets_assets_master',
        buildAssetFillerHook({fetchPrices: true})
    );

    return await Promise.all(buyoffers.map(async (buyoffer) => {
        buyoffer.assets = await filler.fill(buyoffer.assets);

        return buyoffer;
    }));
}

export async function fillSales(server: HTTPServer, assetContract: string, sales: any[]): Promise<any[]> {
    const assetIDs: string[] = [];

    for (const sale of sales) {
        assetIDs.push(...sale.assets);
    }

    const filler = new AssetFiller(
        server, assetContract, assetIDs, formatAsset, 'atomicassets_assets_master',
        buildAssetFillerHook({fetchPrices: true})
    );

    return await Promise.all(sales.map(async (sale) => {
        sale.assets = await filler.fill(sale.assets);

        return sale;
    }));
}
