import { HTTPServer } from '../../server';

export type FillerHook = (server: HTTPServer, contract: string, rows: any[]) => Promise<any[]>;

export class AssetFiller {
    private assets: Promise<{[key: string]: any}> | null;

    constructor(
        readonly server: HTTPServer,
        readonly contract: string,
        readonly assetIDs: string[],
        readonly formatter: (_: any) => any,
        readonly view: string,
        readonly hook?: FillerHook
    ) {
        this.assets = null;
    }

    async fill(assetIDs: string[]): Promise<any[]> {
        this.query();

        const data = await this.assets;

        return assetIDs.map((assetID) => data[String(assetID)] || String(assetID));
    }

    query(): void {
        if (this.assets !== null) {
            return;
        }

        this.assets = new Promise(async (resolve, reject) => {
            if (this.assetIDs.length === 0) {
                return resolve({});
            }

            try {
                const query = await this.server.query(
                    'SELECT * FROM ' + this.view + ' WHERE contract = $1 AND asset_id = ANY ($2)',
                    [this.contract, this.assetIDs]
                );

                const rows = this.hook ? await this.hook(this.server, this.contract, query.rows) : query.rows;
                const result: {[key: string]: any} = {};

                for (const row of rows) {
                    result[String(row.asset_id)] = this.formatter(row);
                }

                return resolve(result);
            } catch (e) {
                return reject(e);
            }
        });
    }
}

export async function fillAssets(
    server: HTTPServer, contract: string, assetIDs: any[], formatter: (_: any) => any,
    view: string, hook?: FillerHook
): Promise<any[]> {
    const filler = new AssetFiller(server, contract, assetIDs, formatter, view, hook);

    return await filler.fill(assetIDs);
}

export async function fillOffers(
    server: HTTPServer, contract: string, offers: any[], formatter: (_: any) => any,
    view: string, hook?: FillerHook
): Promise<any[]> {
    const assetIDs: string[] = [];

    for (const offer of offers) {
        assetIDs.push(...offer.sender_assets);
        assetIDs.push(...offer.recipient_assets);
    }

    const filler = new AssetFiller(server, contract, assetIDs, formatter, view, hook);

    return await Promise.all(offers.map(async (offer) => {
        offer.sender_assets = await filler.fill(offer.sender_assets);
        offer.recipient_assets = await filler.fill(offer.recipient_assets);

        return offer;
    }));
}

export async function fillTransfers(
    server: HTTPServer, contract: string, transfers: any[], formatter: (_: any) => any,
    view: string, hook?: FillerHook
): Promise<any[]> {
    const assetIDs: string[] = [];

    for (const transfer of transfers) {
        assetIDs.push(...transfer.assets);
    }

    const filler = new AssetFiller(server, contract, assetIDs, formatter, view, hook);

    return await Promise.all(transfers.map(async (transfer) => {
        transfer.assets = await filler.fill(transfer.assets);

        return transfer;
    }));
}
