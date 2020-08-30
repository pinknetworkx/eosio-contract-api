import { AssetFiller } from '../atomicassets/filler';
import { formatAsset } from '../atomicassets/format';
import { HTTPServer } from '../../server';

export async function fillLinks(server: HTTPServer, assetContract: string, links: any[]): Promise<any[]> {
    const assetIDs: string[] = [];

    for (const link of links) {
        assetIDs.push(...link.assets);
    }

    const filler = new AssetFiller(server, assetContract, assetIDs, formatAsset, 'atomicassets_assets_master');

    return await Promise.all(links.map(async (link) => {
        link.assets = await filler.fill(link.assets);

        return link;
    }));
}
