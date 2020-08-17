import ConnectionManager from '../../../connections/manager';
import { AssetFiller } from '../atomicassets/filler';
import { formatAsset } from '../atomicassets/format';

export async function fillAuctions(connection: ConnectionManager, assetContract: string, auctions: any[]): Promise<any[]> {
    const assetIDs: string[] = [];

    for (const auction of auctions) {
        assetIDs.push(...auction.assets);
    }

    const filler = new AssetFiller(connection, assetContract, assetIDs, formatAsset, 'atomicassets_assets_master');

    return await Promise.all(auctions.map(async (auction) => {
        auction.assets = await filler.fill(auction.assets);

        return auction;
    }));
}

export async function fillSales(connection: ConnectionManager, assetContract: string, sales: any[]): Promise<any[]> {
    const assetIDs: string[] = [];

    for (const sale of sales) {
        assetIDs.push(...sale.assets);
    }

    const filler = new AssetFiller(connection, assetContract, assetIDs, formatAsset, 'atomicassets_assets_master');

    return await Promise.all(sales.map(async (sale) => {
        sale.assets = await filler.fill(sale.assets);

        return sale;
    }));
}
