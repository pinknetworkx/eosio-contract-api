import 'mocha';
import {expect} from 'chai';
import {initAtomicMarketTest} from '../test';
import {getUsersInventoryPrices} from './prices';
import {getTestContext} from '../../../../utils/test';

const {client, txit} = initAtomicMarketTest();

describe('AtomicMarket Prices API', () => {

    describe('get prices for user inventory', () => {
        txit('no data', async () => {
            const response = await getUsersInventoryPrices({}, {
                coreArgs: {
                    atomicassets_account: 'account1234',
                    atomicmarket_account: 'account1234',
                    connected_reader: '',
                    delphioracle_account: '',
                },
                pathParams: {
                    account: 'account1234',
                },
                db: getTestContext(client).db,
            });
            expect(response.collections).to.deep.equal([]);
        });

        txit('has data', async () => {
            const account = 'account1234';
            const token = await client.createToken({token_symbol: 'SYM'});
            const token2 = await client.createToken({token_symbol: 'WAX'});
            const template1 = await client.createTemplate();
            const template2 = await client.createTemplate();
            const template3 = await client.createTemplate();
            const template4 = await client.createTemplate({collection_name: template1.collection_name});

            const asset1 = await client.createAsset({
                owner: account,
                collection_name: template1.collection_name,
                template_id: template1.template_id,
            });
            const asset2 = await client.createAsset({
                owner: account,
                collection_name: template1.collection_name,
                template_id: template1.template_id
            });
            const asset3 = await client.createAsset({
                owner: account,
                collection_name: template2.collection_name,
                template_id: template2.template_id
            });
            const asset4 = await client.createAsset({
                owner: 'another123',
                collection_name: template2.collection_name,
                template_id: template2.template_id
            });
            const asset5 = await client.createAsset({
                owner: 'another123',
                collection_name: template3.collection_name,
                template_id: template3.template_id
            });
            const asset6 = await client.createAsset({
                owner: account,
                collection_name: template4.collection_name,
                template_id: template4.template_id,
            });


            //make price
            //collection1, token1, template user owns
            const buyOffer1 = await client.createBuyOffer({
                assets_contract: asset1.contract,
                state: 3,
                token_symbol: token.token_symbol,
                price: 10,
                collection_name: template1.collection_name,
            });
            await client.createBuyOfferAssets({
                assets_contract: buyOffer1.assets_contract,
                buyoffer_id: buyOffer1.buyoffer_id,
                asset_id: asset1.asset_id
            });
            //collection1, token1, template user owns
            const buyOffer2 = await client.createBuyOffer({
                assets_contract: asset2.contract,
                state: 3,
                token_symbol: token.token_symbol,
                price: 20,
                collection_name: template1.collection_name,
            });
            await client.createBuyOfferAssets({
                assets_contract: buyOffer2.assets_contract,
                buyoffer_id: buyOffer2.buyoffer_id,
                asset_id: asset2.asset_id
            });
            //collection2, token1, template user owns
            const buyOffer3 = await client.createBuyOffer({
                assets_contract: asset3.contract,
                state: 3,
                token_symbol: token.token_symbol,
                price: 8,
                collection_name: template2.collection_name,
            });
            await client.createBuyOfferAssets({
                assets_contract: buyOffer3.assets_contract,
                buyoffer_id: buyOffer3.buyoffer_id,
                asset_id: asset3.asset_id
            });
            //collection2, token1, template user owns though user doesn't own this asset
            const buyOffer4 = await client.createBuyOffer({
                assets_contract: asset4.contract,
                state: 3,
                token_symbol: token.token_symbol,
                price: 12,
                collection_name: template2.collection_name,
            });
            await client.createBuyOfferAssets({
                assets_contract: buyOffer4.assets_contract,
                buyoffer_id: buyOffer4.buyoffer_id,
                asset_id: asset4.asset_id
            });
            //collection2, token1, template user doesn't own (should not be in response)
            const buyOffer5 = await client.createBuyOffer({
                assets_contract: asset5.contract,
                state: 3,
                token_symbol: token.token_symbol,
                price: 100,
                collection_name: template3.collection_name,
            });
            await client.createBuyOfferAssets({
                assets_contract: buyOffer5.assets_contract,
                buyoffer_id: buyOffer5.buyoffer_id,
                asset_id: asset5.asset_id
            });
            //collection1, token2, template user owns
            const buyOffer6 = await client.createBuyOffer({
                assets_contract: asset6.contract,
                state: 3,
                token_symbol: token2.token_symbol,
                price: 16,
                collection_name: template4.collection_name,
            });
            await client.createBuyOfferAssets({
                assets_contract: buyOffer6.assets_contract,
                buyoffer_id: buyOffer6.buyoffer_id,
                asset_id: asset6.asset_id
            });
            await client.refreshPrice();

            const response = await getUsersInventoryPrices({}, getTestContext(client, {account}));

            expect(response.collections.find((i: any) => i.collection.collection_name === asset3.collection_name).prices.length).to.be.equal(1);
            expect(response.collections.find((i: any) => i.collection.collection_name === asset3.collection_name).prices[0]).to.deep.contain({
                median: '8',
                average: '10',
                min: '8',
                max: '12'
            });
            expect(response.collections.find((i: any) => i.collection.collection_name === asset1.collection_name).prices.length).to.be.equal(2);
            expect(response.collections.find((i: any) => i.collection.collection_name === asset1.collection_name).prices.find((x) => x.token_symbol === token.token_symbol)).to.deep.contain({
                median: '20',
                average: '30',
                min: '20',
                max: '40',
            });
            expect(response.collections.find((i: any) => i.collection.collection_name === asset6.collection_name).prices.find((x) => x.token_symbol === token2.token_symbol)).to.deep.contain({
                median: '16',
                average: '16',
                min: '16',
                max: '16',
            });
        });
    });

    after(async () => await client.end());
});
