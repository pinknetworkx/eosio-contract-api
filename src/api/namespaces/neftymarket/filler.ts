import { AssetFiller } from '../atomicassets/filler';
import { formatAsset } from '../atomicassets/format';
import { DB } from '../../server';
import { buildAssetFillerHook } from '../atomicmarket/format';

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
