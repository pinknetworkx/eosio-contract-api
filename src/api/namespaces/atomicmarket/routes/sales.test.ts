import 'mocha';
import { expect } from 'chai';
import { getSalesAction } from './handlers/sales';
import { getTestContext } from '../testutils';
import { txit } from '../../../../utils/test';
import { SaleApiState } from '../index';
import { OfferState } from '../../../../filler/handlers/atomicassets';
import { SaleState } from '../../../../filler/handlers/atomicmarket';
import { ApiError } from '../../../error';

describe('AtomicMarket Sales API', () => {

    describe('getSalesAction V1', () => {

        txit('works without filters', async (client) => {

            await client.createSale();

            const testContext = getTestContext(client);

            const result = await getSalesAction({}, testContext);

            expect(result.length).to.equal(1);
        });

        txit('filters by waiting state', async (client) => {
            await client.createSale();
            const {sale_id} = await client.createSale({
                state: SaleApiState.WAITING,
            });

            const testContext = getTestContext(client);

            const result = await getSalesAction({state: `${SaleApiState.WAITING}`}, testContext);

            expect(result.length).to.equal(1);
            expect(result[0]).to.haveOwnProperty('sale_id', sale_id);
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

            const testContext = getTestContext(client);

            const result = await getSalesAction({state: `${SaleApiState.LISTED}`}, testContext);

            expect(result.length).to.equal(1);
            expect(result[0]).to.haveOwnProperty('sale_id', sale_id);
        });

        txit('filters by canceled state', async (client) => {
            await client.createSale();
            const {sale_id} = await client.createSale({
                state: SaleApiState.CANCELED,
            });

            const testContext = getTestContext(client);

            const result = await getSalesAction({state: `${SaleApiState.CANCELED}`}, testContext);

            expect(result.length).to.equal(1);
            expect(result[0]).to.haveOwnProperty('sale_id', sale_id);
        });

        txit('filters by sold state', async (client) => {
            await client.createSale();
            const {sale_id} = await client.createSale({
                state: SaleApiState.SOLD,
            });

            const testContext = getTestContext(client);

            const result = await getSalesAction({state: `${SaleApiState.SOLD}`}, testContext);

            expect(result.length).to.equal(1);
            expect(result[0]).to.haveOwnProperty('sale_id', sale_id);
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

            const testContext = getTestContext(client);

            const result = await getSalesAction({state: `${SaleApiState.INVALID}`}, testContext);

            expect(result.length).to.equal(1);
            expect(result[0]).to.haveOwnProperty('sale_id', sale_id);
        });

        txit('filters by multiple states', async (client) => {
            await client.createSale();

            const {sale_id: sale_id1} = await client.createSale({
                state: SaleState.WAITING,
            });

            const {sale_id: sale_id2} = await client.createSale({
                state: SaleState.CANCELED,
            });

            const testContext = getTestContext(client);

            const result = await getSalesAction({state: `${SaleApiState.WAITING},${SaleApiState.CANCELED}`}, testContext);

            expect(result.length).to.equal(2);
            expect(result[0]).to.haveOwnProperty('sale_id', sale_id2);
            expect(result[1]).to.haveOwnProperty('sale_id', sale_id1);
        });

        txit('filters by minimum asset count', async (client) => {
            await client.createSale();

            const {offer_id} = await client.createOfferAsset();
            const {sale_id} = await client.createSale({offer_id});

            const testContext = getTestContext(client);

            const result = await getSalesAction({min_assets: '1'}, testContext);

            expect(result.length).to.equal(1);
            expect(result[0]).to.haveOwnProperty('sale_id', sale_id);
        });

        txit('filters by maximum asset count', async (client) => {

            const {offer_id} = await client.createOfferAsset();
            await client.createOfferAsset({offer_id});
            await client.createSale({offer_id});

            const {sale_id} = await client.createSale();

            const testContext = getTestContext(client);

            const result = await getSalesAction({max_assets: '1'}, testContext);

            expect(result.length).to.equal(1);
            expect(result[0]).to.haveOwnProperty('sale_id', sale_id);
        });

        txit('filters by settlement symbol', async (client) => {

            await client.createSale({
                settlement_symbol: 'NOT_THIS',
            });

            const {sale_id} = await client.createSale();

            const testContext = getTestContext(client);

            const result = await getSalesAction({symbol: 'TEST'}, testContext);

            expect(result.length).to.equal(1);
            expect(result[0]).to.haveOwnProperty('sale_id', sale_id);
        });

        txit('throws error when minimum price filter is set without settlement symbol', async (client) => {

            const testContext = getTestContext(client);

            let err;
            try {
                await getSalesAction({min_price: '1'}, testContext);
            } catch (e) {
                err = e;
            }

            expect(err).to.be.instanceof(ApiError);
            expect(err.message).to.equal('Price range filters require the "symbol" filter');
        });

        txit('throws error when maximum price filter is set without settlement symbol', async (client) => {

            const testContext = getTestContext(client);

            let err;
            try {
                await getSalesAction({max_price: '1'}, testContext);
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

            const testContext = getTestContext(client);

            const result = await getSalesAction({symbol: 'TEST', min_price: '2'}, testContext);

            expect(result.length).to.equal(1);
            expect(result[0]).to.haveOwnProperty('sale_id', sale_id);
        });

        txit('filters by maximum price', async (client) => {
            await client.createSale({
                listing_price: 200000000,
            });

            const {sale_id} = await client.createSale({});

            await client.query('REFRESH MATERIALIZED VIEW atomicmarket_sale_prices');

            const testContext = getTestContext(client);

            const result = await getSalesAction({symbol: 'TEST', max_price: '1'}, testContext);

            expect(result.length).to.equal(1);
            expect(result[0]).to.haveOwnProperty('sale_id', sale_id);
        });

    });

});
