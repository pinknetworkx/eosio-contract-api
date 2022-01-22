import 'mocha';
import {expect} from 'chai';
import {RequestValues} from '../../utils';
import {initAtomicMarketTest} from '../test';
import {getTestContext} from '../../../../utils/test';
import {getMarketAssetsAction} from './assets';
import {SaleState} from '../../../../filler/handlers/atomicmarket';

const {client, txit} = initAtomicMarketTest();

async function getAssetIds(values: RequestValues): Promise<Array<number>> {
    const testContext = getTestContext(client);

    const result = await getMarketAssetsAction(values, testContext);
    return result.map((a: any) => a.asset_id);
}

describe('AtomicMarket Assets API', () => {

    describe('getMarketAssetsAction V1', () => {

        txit('orders by suggested median price', async () => {
            const {template_id: template_id1} = await client.createTemplate();

            await client.createFullSale({
                final_price: 500,
                state: SaleState.SOLD,
            }, {
                template_id: template_id1,
            });

            const {asset_id: asset_id1} = await client.createAsset({template_id: template_id1});

            const {template_id: template_id2} = await client.createTemplate();
            const {asset_id: asset_id2} = await client.createAsset({template_id: template_id2});

            await client.createFullSale({
                final_price: 400,
                state: SaleState.SOLD,
            }, {
                template_id: template_id2,
            });

            await client.query('REFRESH MATERIALIZED VIEW atomicmarket_template_prices');

            expect(await getAssetIds({sort: 'suggested_median_price', asset_id: `${asset_id1},${asset_id2}`}))
                .to.deep.equal([asset_id1, asset_id2]);
        });

        txit('orders by suggested average price', async () => {
            const {template_id: template_id1} = await client.createTemplate();

            await client.createFullSale({
                final_price: 500,
                state: SaleState.SOLD,
            }, {
                template_id: template_id1,
            });

            const {asset_id: asset_id1} = await client.createAsset({template_id: template_id1});

            const {template_id: template_id2} = await client.createTemplate();
            const {asset_id: asset_id2} = await client.createAsset({template_id: template_id2});

            await client.createFullSale({
                final_price: 400,
                state: SaleState.SOLD,
            }, {
                template_id: template_id2,
            });

            await client.query('REFRESH MATERIALIZED VIEW atomicmarket_template_prices');

            expect(await getAssetIds({sort: 'suggested_average_price', asset_id: `${asset_id1},${asset_id2}`}))
                .to.deep.equal([asset_id1, asset_id2]);
        });

        txit('orders by median price', async () => {
            const {template_id: template_id1} = await client.createTemplate();

            await client.createFullSale({
                final_price: 500,
                state: SaleState.SOLD,
            }, {
                template_id: template_id1,
            });

            const {asset_id: asset_id1} = await client.createAsset({template_id: template_id1});

            const {template_id: template_id2} = await client.createTemplate();
            const {asset_id: asset_id2} = await client.createAsset({template_id: template_id2});

            await client.createFullSale({
                final_price: 400,
                state: SaleState.SOLD,
            }, {
                template_id: template_id2,
            });

            await client.query('REFRESH MATERIALIZED VIEW atomicmarket_template_prices');

            expect(await getAssetIds({sort: 'median_price', asset_id: `${asset_id1},${asset_id2}`}))
                .to.deep.equal([asset_id1, asset_id2]);
        });

        txit('orders by average price', async () => {
            const {template_id: template_id1} = await client.createTemplate();

            await client.createFullSale({
                final_price: 500,
                state: SaleState.SOLD,
            }, {
                template_id: template_id1,
            });

            const {asset_id: asset_id1} = await client.createAsset({template_id: template_id1});

            const {template_id: template_id2} = await client.createTemplate();
            const {asset_id: asset_id2} = await client.createAsset({template_id: template_id2});

            await client.createFullSale({
                final_price: 400,
                state: SaleState.SOLD,
            }, {
                template_id: template_id2,
            });

            await client.query('REFRESH MATERIALIZED VIEW atomicmarket_template_prices');

            expect(await getAssetIds({sort: 'average_price', asset_id: `${asset_id1},${asset_id2}`}))
                .to.deep.equal([asset_id1, asset_id2]);
        });

    });

    after(async () => {
        await client.end();
    });
});
