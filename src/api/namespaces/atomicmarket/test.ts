import { SaleApiState } from './index';
import { AtomicAssetsTestClient } from '../atomicassets/test';
import { createTxIt } from '../../../utils/test';
import {AuctionState} from '../../../filler/handlers/atomicmarket';

export function initAtomicMarketTest(): {client: AtomicMarketTestClient, txit: any} {
    const client = new AtomicMarketTestClient();

    const txit = createTxIt(client);

    return {client, txit};
}

export class AtomicMarketTestClient extends AtomicAssetsTestClient {

    async init(): Promise<void> {
        await super.init();

        await this.createToken();
    }

    async createAuctionAssets(values: Record<string, any> = {}): Promise<Record<string, any>> {
        return this.insert('atomicmarket_auctions_assets', {
            market_contract: 'amtest',
            auction_id: values.auction_id ?? (await this.createAuction()).auction_id,
            assets_contract: 'aatest',
            index: 1,
            asset_id: values.asset_id ?? (await this.createAsset()).asset_id,
            ...values,
        });
    }

    async createAuction(values: Record<string, any> = {}): Promise<Record<string, any>> {
        return this.insert('atomicmarket_auctions', {
            market_contract: 'amtest',
            auction_id: this.getId(),
            seller: 'seller',
            buyer: 'buyer',
            price: 1,
            token_symbol: 'TEST',
            assets_contract: 'aatest',
            maker_marketplace: '',
            taker_marketplace: '',
            collection_name: values.collection_name ?? (await this.createCollection()).collection_name,
            collection_fee: 0,
            claimed_by_buyer: false,
            claimed_by_seller: false,
            state: AuctionState.LISTED,
            end_time: this.getId(),
            updated_at_block: this.getId(),
            updated_at_time: this.getId(),
            created_at_block: this.getId(),
            created_at_time: this.getId(),
            ...values,
        });
    }

    async createToken(values: Record<string, any> = {}): Promise<Record<string, any>> {
        return await this.insert('atomicmarket_tokens', {
            market_contract: 'amtest',
            token_contract: 'tctest',
            token_symbol: 'TEST',
            token_precision: 8,
            ...values,
        });
    }

    async createSale(values: Record<string, any> = {}): Promise<Record<string, any>> {
        return await this.insert('atomicmarket_sales', {
            market_contract: 'amtest',
            sale_id: this.getId(),
            seller: 'seller',
            buyer: 'buyer',
            listing_price: 1,
            listing_symbol: 'TEST',
            settlement_symbol: 'TEST',
            assets_contract: 'aatest',
            offer_id: values.offer_id ?? (await this.createOffer()).offer_id,
            maker_marketplace: '',
            collection_name: values.collection_name ?? (await this.createCollection()).collection_name,
            collection_fee: 0,
            state: SaleApiState.LISTED,
            updated_at_block: this.getId(),
            updated_at_time: this.getId(),
            created_at_block: this.getId(),
            created_at_time: this.getId(),
            ...values,
        });
    }

    async createFullSale(saleValues: Record<string, any> = {}, assetValues: Record<string, any> = {}, offerValues: Record<string, any> = {}, offerAssetValues: Record<string, any> = {}): Promise<Record<string, any>> {
        const collection_name = saleValues.collection_name ?? (await this.createCollection()).collection_name;
        const {offer_id} = await this.createOffer(offerValues);
        const {asset_id} = await this.createAsset({...assetValues, collection_name});
        await this.createOfferAsset({...offerAssetValues, offer_id, asset_id});
        return {
            ...(await this.createSale({...saleValues, offer_id, collection_name})),
            asset_id,
        };
    }

}
