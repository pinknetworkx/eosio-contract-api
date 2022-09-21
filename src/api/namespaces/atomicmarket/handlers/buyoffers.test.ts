import {expect} from 'chai';
import {initAtomicMarketTest} from '../test';
import {RequestValues} from '../../utils';
import {getTestContext} from '../../../../utils/test';
import {getBuyOffersAction} from './buyoffers';

// TODO add more tests
describe('buy offer handler', () => {
    const {client, txit} = initAtomicMarketTest();

    async function getBuyOffersIds(values: RequestValues): Promise<Array<number>> {
        const testContext = getTestContext(client);

        const result = await getBuyOffersAction(values, testContext);

        return result.map((s: any) => s.buyoffer_id);
    }

    describe('getBuyOffers', () => {

        txit('orders by asset name', async () => {

            const buyOffer1 = await client.createBuyOffer();
            const buyOffer2 = await client.createBuyOffer();
            const buyOffer3 = await client.createBuyOffer();

            const asset1 = await client.createAsset({
                mutable_data: {name: 'Z'},
            });
            await client.createBuyOfferAssets({
                asset_id: asset1.asset_id,
                buyoffer_id: buyOffer1.buyoffer_id,
            });

            const asset2 = await client.createAsset({
                immutable_data: {name: 'A'},
            });
            await client.createBuyOfferAssets({
                asset_id: asset2.asset_id,
                buyoffer_id: buyOffer2.buyoffer_id,
            });

            const asset3 = await client.createAsset({
                template_id: (await client.createTemplate({
                    immutable_data: {name: 'H'}
                })).template_id,
            });
            await client.createBuyOfferAssets({
                asset_id: asset3.asset_id,
                buyoffer_id: buyOffer3.buyoffer_id,
            });

            expect(await getBuyOffersIds({sort: 'name', order: 'asc'}))
                .to.deep.equal([buyOffer2.buyoffer_id, buyOffer3.buyoffer_id, buyOffer1.buyoffer_id]);
        });

    });

    after(async () => {
        await client.end();
    });
});
