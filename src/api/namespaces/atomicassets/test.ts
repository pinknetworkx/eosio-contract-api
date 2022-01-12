import {createTxIt, TestClient} from '../../../utils/test';
import {OfferState} from '../../../filler/handlers/atomicassets';

export function initAtomicAssetsTest(): { client: AtomicAssetsTestClient, txit: any } {
    const client = new AtomicAssetsTestClient();

    const txit = createTxIt(client);

    return {client, txit};
}

export class AtomicAssetsTestClient extends TestClient {

    async createSchema(values: Record<string, any> = {}): Promise<Record<string, any>> {
        return this.insert('atomicassets_schemas', {
            contract: 'aatest',
            collection_name: values.collection_name ?? (await this.createCollection()).collection_name,
            schema_name: this.getId(),
            format: '{}',
            created_at_block: this.getId(),
            created_at_time: this.getId(),
            ...values,
        });
    }

    async createCollection(values: Record<string, any> = {}): Promise<Record<string, any>> {
        return this.insert('atomicassets_collections', {
            collection_name: this.getId(),
            contract: 'aatest',
            author: 'author',
            allow_notify: false,
            authorized_accounts: [],
            notify_accounts: [],
            market_fee: 0,
            data: JSON.stringify({name: 'test'}),
            created_at_block: this.getId(),
            created_at_time: this.getId(),
            ...values,
        });
    }

    async createTemplate(values: Record<string, any> = {}): Promise<Record<string, any>> {
        values = {
            ...values,
            collection_name: values.collection_name ?? (await this.createCollection()).collection_name,
        };
        return await this.insert('atomicassets_templates', {
            contract: 'aatest',
            template_id: this.getId(),
            schema_name: values.schema_name ?? (await this.createSchema({collection_name: values.collection_name})).schema_name,
            transferable: true,
            burnable: true,
            max_supply: 10,
            issued_supply: 1,
            created_at_time: this.getId(),
            created_at_block: this.getId(),
            ...values,
        });
    }

    async createOfferAsset(values: Record<string, any> = {}, assetValues: Record<string, any> = {}): Promise<Record<string, any>> {
        return await this.insert('atomicassets_offers_assets', {
            contract: 'aatest',
            offer_id: values.offer_id ?? (await this.createOffer()).offer_id,
            owner: 'owner',
            index: 0,
            asset_id: values.asset_id ?? (await this.createAsset(assetValues)).asset_id,
            ...values,
        });
    }

    async createOffer(values: Record<string, any> = {}): Promise<Record<string, any>> {
        return await this.insert('atomicassets_offers', {
            contract: 'aatest',
            offer_id: this.getId(),
            sender: 'sender',
            recipient: 'recipient',
            memo: 'memo',
            state: OfferState.PENDING,
            updated_at_block: this.getId(),
            updated_at_time: this.getId(),
            created_at_block: this.getId(),
            created_at_time: this.getId(),
            ...values,
        });
    }

    async createAsset(values: Record<string, any> = {}): Promise<Record<string, any>> {
        values = {
            ...values,
            collection_name: values.collection_name ?? (await this.createCollection()).collection_name,
        };
        return this.insert('atomicassets_assets', {
            contract: 'aatest',
            asset_id: this.getId(),
            schema_name: values.schema_name ?? (await this.createSchema({collection_name: values.collection_name})).schema_name,
            owner: 'owner',
            transferred_at_block: this.getId(),
            transferred_at_time: this.getId(),
            updated_at_block: this.getId(),
            updated_at_time: this.getId(),
            minted_at_block: this.getId(),
            minted_at_time: this.getId(),
            ...values,
        });
    }

    async createAssetBackedToken(values: Record<string, any> = {}): Promise<Record<string, any>> {
        return this.insert('atomicassets_assets_backed_tokens', {
            contract: 'aatest',
            token_symbol: 'TEST',
            amount: 1,
            updated_at_block: this.getId(),
            updated_at_time: this.getId(),
            ...values,
        });
    }

}
