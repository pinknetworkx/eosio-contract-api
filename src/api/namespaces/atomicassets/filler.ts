import ConnectionManager from '../../../connections/manager';
import { formatAsset } from './format';

export class AssetFiller {
    private assets: {[key: string]: any} | null;

    constructor(readonly connection: ConnectionManager, readonly contract: string, readonly assetIDs: string[]) {
        this.assets = null;
    }

    async fill(assetIDs: string[]): Promise<any[]> {
        await this.query();

        return assetIDs.map((assetID) => this.assets[assetID]);
    }

    private async query(): Promise<void> {
        if (this.assets !== null) {
            return;
        }

        const query = await this.connection.database.query(
            'SELECT * FROM atomicassets_assets_master WHERE contract = $1 AND asset_id = ANY ($2)',
            [this.contract, this.assetIDs]
        );

        this.assets = {};

        for (const row of query.rows) {
            this.assets[String(row.asset_id)] = formatAsset(row);
        }
    }
}

export async function fillOffers(connection: ConnectionManager, contract: string, offers: any[]): Promise<any[]> {
    const assetIDs: string[] = [];

    for (const offer of offers) {
        assetIDs.push(...offer.sender_assets);
        assetIDs.push(...offer.recipient_assets);
    }

    const filler = new AssetFiller(connection, contract, assetIDs);

    return await Promise.all(offers.map(async (offer) => {
        offer.sender_assets = await filler.fill(offer.sender_assets);
        offer.recipient_assets = await filler.fill(offer.recipient_assets);

        return offer;
    }));
}

export async function fillTransfers(connection: ConnectionManager, contract: string, transfers: any[]): Promise<any[]> {
    const assetIDs: string[] = [];

    for (const transfer of transfers) {
        assetIDs.push(...transfer.assets);
    }

    const filler = new AssetFiller(connection, contract, assetIDs);

    return await Promise.all(transfers.map(async (transfer) => {
        transfer.assets = await filler.fill(transfer.assets);

        return transfer;
    }));
}
