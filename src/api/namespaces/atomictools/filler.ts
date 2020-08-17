import ConnectionManager from '../../../connections/manager';
import { AssetFiller } from '../atomicassets/filler';
import { formatAsset } from '../atomicassets/format';

export async function fillLinks(connection: ConnectionManager, assetContract: string, links: any[]): Promise<any[]> {
    const assetIDs: string[] = [];

    for (const link of links) {
        assetIDs.push(...link.assets);
    }

    const filler = new AssetFiller(connection, assetContract, assetIDs, formatAsset, 'atomicassets_assets_master');

    return await Promise.all(links.map(async (link) => {
        link.assets = await filler.fill(link.assets);

        return link;
    }));
}
