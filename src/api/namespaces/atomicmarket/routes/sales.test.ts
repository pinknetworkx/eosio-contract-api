import 'mocha';
import { expect } from 'chai';
import { getSalesAction } from './handlers/sales';
import { getTestContext } from '../testutils';
import { txit } from '../../../../utils/test';

describe('AtomicMarket Sales API', () => {

    describe('getSalesAction', () => {

        txit('works without filters', async (client) => {

            await client.createSale();

            const testContext = getTestContext(client);

            const result = await getSalesAction({}, testContext);

            expect(result.length).to.equal(1);
        });

    });

});
