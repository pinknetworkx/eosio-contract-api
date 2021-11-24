import 'mocha';
import { expect } from 'chai';
import { getSalesAction } from './handlers/sales';
import { getTestContext } from '../testutils';
import { TestClient, txit } from '../../../../utils/test';
import { SaleApiState } from '../index';
import { OfferState } from '../../../../filler/handlers/atomicassets';
import { SaleState } from '../../../../filler/handlers/atomicmarket';
import { ApiError } from '../../../error';
import { RequestValues } from '../../utils';

async function getSalesIds(client: TestClient, values: RequestValues): Promise<Array<number>> {
    const testContext = getTestContext(client);

    const result = await getSalesAction(values, testContext);

    return result.map((s: any) => s.sale_id);
}

describe('AtomicMarket Sales API', () => {

    describe('getSalesAction V1', () => {

        txit('works without filters', async (client) => {

            const {sale_id} = await client.createSale();

            expect(await getSalesIds(client, {})).to.deep.equal([sale_id]);
        });

        txit('filters by waiting state', async (client) => {
            await client.createSale();
            const {sale_id} = await client.createSale({
                state: SaleApiState.WAITING,
            });

            expect(await getSalesIds(client, {state: `${SaleApiState.WAITING}`}))
                .to.deep.equal([sale_id]);
        });

        txit('filters by listed state', async (client) => {
            await client.createSale({
                state: SaleApiState.WAITING,
            });

            const {offer_id} = await client.createOffer({
                state: OfferState.ACCEPTED,
            });
            await client.createSale({
                state: SaleApiState.LISTED,
                offer_id,
            });

            const {sale_id} = await client.createSale({
                state: SaleApiState.LISTED,
            });

            expect(await getSalesIds(client, {state: `${SaleApiState.LISTED}`}))
                .to.deep.equal([sale_id]);
        });

        txit('filters by canceled state', async (client) => {
            await client.createSale();
            const {sale_id} = await client.createSale({
                state: SaleApiState.CANCELED,
            });

            expect(await getSalesIds(client, {state: `${SaleApiState.CANCELED}`}))
                .to.deep.equal([sale_id]);
        });

        txit('filters by sold state', async (client) => {
            await client.createSale();
            const {sale_id} = await client.createSale({
                state: SaleApiState.SOLD,
            });

            expect(await getSalesIds(client, {state: `${SaleApiState.SOLD}`}))
                .to.deep.equal([sale_id]);
        });

        txit('filters by invalid state', async (client) => {
            await client.createSale({
                state: SaleState.WAITING
            });

            await client.createSale({
                state: SaleApiState.LISTED,
            });

            const {offer_id} = await client.createOffer({
                state: OfferState.ACCEPTED,
            });
            const {sale_id} = await client.createSale({
                state: SaleApiState.LISTED,
                offer_id,
            });

            expect(await getSalesIds(client, {state: `${SaleApiState.INVALID}`}))
                .to.deep.equal([sale_id]);
        });

        txit('filters by multiple states', async (client) => {
            await client.createSale();

            const {sale_id: sale_id1} = await client.createSale({
                state: SaleState.WAITING,
            });

            const {sale_id: sale_id2} = await client.createSale({
                state: SaleState.CANCELED,
            });

            expect(await getSalesIds(client, {state: `${SaleApiState.WAITING},${SaleApiState.CANCELED}`}))
                .to.deep.equal([sale_id2, sale_id1]);
        });

        txit('filters by minimum asset count', async (client) => {
            await client.createSale();

            const {offer_id} = await client.createOfferAsset();
            const {sale_id} = await client.createSale({offer_id});

            expect(await getSalesIds(client, {min_assets: '1'}))
                .to.deep.equal([sale_id]);
        });

        txit('filters by maximum asset count', async (client) => {

            const {offer_id} = await client.createOfferAsset();
            await client.createOfferAsset({offer_id});
            await client.createSale({offer_id});

            const {sale_id} = await client.createSale();

            expect(await getSalesIds(client, {max_assets: '1'}))
                .to.deep.equal([sale_id]);
        });

        txit('filters by settlement symbol', async (client) => {

            await client.createSale({
                settlement_symbol: 'NOT_THIS',
            });

            const {sale_id} = await client.createSale();

            expect(await getSalesIds(client, {symbol: 'TEST'}))
                .to.deep.equal([sale_id]);
        });

        txit('throws error when minimum price filter is set without settlement symbol', async (client) => {

            let err;
            try {
                await getSalesIds(client, {min_price: '1'});
            } catch (e) {
                err = e;
            }

            expect(err).to.be.instanceof(ApiError);
            expect(err.message).to.equal('Price range filters require the "symbol" filter');
        });

        txit('throws error when maximum price filter is set without settlement symbol', async (client) => {

            let err;
            try {
                await getSalesIds(client, {max_price: '1'});
            } catch (e) {
                err = e;
            }

            expect(err).to.be.instanceof(ApiError);
            expect(err.message).to.equal('Price range filters require the "symbol" filter');
        });

        txit('filters by minimum price', async (client) => {
            await client.createSale({});

            const {sale_id} = await client.createSale({
                listing_price: 200000000,
            });

            await client.query('REFRESH MATERIALIZED VIEW atomicmarket_sale_prices');

            expect(await getSalesIds(client, {symbol: 'TEST', min_price: '2'}))
                .to.deep.equal([sale_id]);
        });

        txit('filters by maximum price', async (client) => {
            await client.createSale({
                listing_price: 200000000,
            });

            const {sale_id} = await client.createSale({});

            await client.query('REFRESH MATERIALIZED VIEW atomicmarket_sale_prices');

            expect(await getSalesIds(client, {symbol: 'TEST', max_price: '1'}))
                .to.deep.equal([sale_id]);
        });

        txit('filters out seller contracts unless whitelisted', async (client) => {
            await client.createContractCode({
                account: 'excluded',
            });
            await client.createSale({
                seller: 'excluded',
            });

            await client.createContractCode({
                account: 'whitelisted',
            });
            const {sale_id} = await client.createSale({
                seller: 'whitelisted',
            });

            expect(await getSalesIds(client, {show_seller_contracts: 'false', contract_whitelist: 'whitelisted,abc'}))
                .to.deep.equal([sale_id]);
        });

        txit('filters by blacklisted sellers', async (client) => {
            await client.createSale({
                seller: 'blacklisted',
            });

            const {sale_id} = await client.createSale({});

            expect(await getSalesIds(client, {seller_blacklist: 'blacklisted,abc'}))
                .to.deep.equal([sale_id]);
        });

        txit('filters by blacklisted buyers', async (client) => {
            await client.createSale({
                buyer: 'blacklisted',
            });

            const {sale_id} = await client.createSale({});

            expect(await getSalesIds(client, {buyer_blacklist: 'blacklisted,abc'}))
                .to.deep.equal([sale_id]);
        });

        txit('filters by accounts', async (client) => {
            await client.createSale();

            const {sale_id: sale_id1} = await client.createSale({buyer: 'x'});
            const {sale_id: sale_id2} = await client.createSale({seller: 'x'});

            expect(await getSalesIds(client, {account: 'x,abc'}))
                .to.deep.equal([sale_id2, sale_id1]);
        });

        txit('filters by seller', async (client) => {
            await client.createSale();

            const {sale_id} = await client.createSale({seller: 'x'});

            expect(await getSalesIds(client, {seller: 'x,abc'}))
                .to.deep.equal([sale_id]);
        });

        txit('filters by buyer', async (client) => {
            await client.createSale();

            const {sale_id} = await client.createSale({buyer: 'x'});

            expect(await getSalesIds(client, {buyer: 'x,abc'}))
                .to.deep.equal([sale_id]);
        });

        txit('filters by maker marketplace', async (client) => {
            await client.createSale();

            const {sale_id} = await client.createSale({maker_marketplace: 'x'});

            expect(await getSalesIds(client, {maker_marketplace: 'x,abc'}))
                .to.deep.equal([sale_id]);
        });

        txit('filters by taker marketplace', async (client) => {
            await client.createSale();

            const {sale_id} = await client.createSale({taker_marketplace: 'x'});

            expect(await getSalesIds(client, {taker_marketplace: 'x,abc'}))
                .to.deep.equal([sale_id]);
        });

        txit('filters by maker or taker marketplace', async (client) => {
            await client.createSale();

            const {sale_id: sale_id1} = await client.createSale({maker_marketplace: 'x'});
            const {sale_id: sale_id2} = await client.createSale({taker_marketplace: 'x'});

            expect(await getSalesIds(client, {marketplace: 'x,abc'}))
                .to.deep.equal([sale_id2, sale_id1]);
        });

    });

});
