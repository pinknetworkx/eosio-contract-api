import 'mocha';
import { expect } from 'chai';
import { RequestValues } from '../../utils';
import { initAtomicMarketTest } from '../test';
import { getTestContext } from '../../../../utils/test';
import { getSalesV2Action } from './sales.get-sales-v2';
import { SaleApiState } from '../index';
import { OfferState } from '../../../../filler/handlers/atomicassets';
import { SaleState } from '../../../../filler/handlers/atomicmarket';
import { ApiError } from '../../../error';

const {client, txit} = initAtomicMarketTest();

async function getSalesIds(values: RequestValues): Promise<Array<number>> {
    const testContext = getTestContext(client);

    await client.query('SELECT update_atomicmarket_sales_filters()');

    const result = await getSalesV2Action(values, testContext);

    return result?.map((s: any) => s.sale_id);
}

// TODO remove only
describe.only('AtomicMarket Sales API', () => {

    describe('getSalesAction V2', () => {

        txit('works without filters', async () => {

            const {sale_id} = await client.createFullSale();

            expect(await getSalesIds({})).to.deep.equal([sale_id]);
        });

        txit('filters by waiting state', async () => {
            await client.createFullSale();
            const {sale_id} = await client.createFullSale({
                state: SaleState.WAITING,
            });

            expect(await getSalesIds({state: `${SaleApiState.WAITING}`}))
                .to.deep.equal([sale_id]);
        });

        txit('filters by listed state', async () => {
            await client.createFullSale({
                state: SaleState.WAITING,
            });

            await client.createFullSale({
                state: SaleState.LISTED,
            }, {}, {
                state: OfferState.ACCEPTED
            }, {});

            const {sale_id} = await client.createFullSale({
                state: SaleState.LISTED,
            });

            expect(await getSalesIds({state: `${SaleApiState.LISTED}`}))
                .to.deep.equal([sale_id]);
        });

        // cancelled sales are not currently stored
        // txit('filters by canceled state', async () => {
        //     await client.createSale();
        //     const {sale_id} = await client.createFullSale({
        //         state: SaleState.CANCELED,
        //     });
        //
        //     expect(await getSalesIds({state: `${SaleApiState.CANCELED}`}))
        //         .to.deep.equal([sale_id]);
        // });

        txit('filters by sold state', async () => {
            await client.createSale();
            const {sale_id} = await client.createFullSale({
                state: SaleState.SOLD,
            });

            expect(await getSalesIds({state: `${SaleApiState.SOLD}`}))
                .to.deep.equal([sale_id]);
        });

        txit('filters by invalid state', async () => {
            await client.createFullSale({
                state: SaleState.WAITING
            });

            await client.createSale({
                state: SaleState.LISTED,
            });

            const {sale_id} = await client.createFullSale({
                state: SaleState.LISTED,
            }, {}, {
                state: OfferState.ACCEPTED,
            });

            expect(await getSalesIds({state: `${SaleApiState.INVALID}`}))
                .to.deep.equal([sale_id]);
        });

        txit('filters by multiple states', async () => {
            await client.createFullSale();

            const {sale_id: sale_id1} = await client.createFullSale({
                state: SaleState.WAITING,
            });

            const {sale_id: sale_id2} = await client.createFullSale({
                state: SaleState.SOLD,
            });

            expect(await getSalesIds({state: `${SaleApiState.WAITING},${SaleApiState.SOLD}`}))
                .to.deep.equal([sale_id2, sale_id1]);
        });

        txit('filters by minimum asset count', async () => {
            await client.createFullSale();

            const {sale_id, offer_id} = await client.createFullSale({});
            await client.createOfferAsset({offer_id});

            expect(await getSalesIds({min_assets: '2'}))
                .to.deep.equal([sale_id]);
        });

        txit('filters by maximum asset count', async () => {

            const {offer_id} = await client.createFullSale({});
            await client.createOfferAsset({offer_id});

            const {sale_id} = await client.createFullSale();

            expect(await getSalesIds({max_assets: '1'}))
                .to.deep.equal([sale_id]);
        });

        txit('filters by settlement symbol', async () => {

            await client.createToken({token_symbol: 'NOT_THIS'});

            await client.createFullSale({
                settlement_symbol: 'NOT_THIS',
            });

            const {sale_id} = await client.createFullSale();

            expect(await getSalesIds({symbol: 'TEST'}))
                .to.deep.equal([sale_id]);
        });

        txit('throws error when minimum price filter is set without settlement symbol', async () => {

            let err;
            try {
                await getSalesIds({min_price: '1'});
            } catch (e) {
                err = e;
            }

            expect(err).to.be.instanceof(ApiError);
            expect(err.message).to.equal('Price range filters require the "symbol" filter');
        });

        txit('throws error when maximum price filter is set without settlement symbol', async () => {

            let err;
            try {
                await getSalesIds({max_price: '1'});
            } catch (e) {
                err = e;
            }

            expect(err).to.be.instanceof(ApiError);
            expect(err.message).to.equal('Price range filters require the "symbol" filter');
        });

        txit('filters by minimum price', async () => {
            await client.createFullSale({});

            const {sale_id} = await client.createFullSale({
                listing_price: 200000000,
            });

            expect(await getSalesIds({symbol: 'TEST', min_price: '2'}))
                .to.deep.equal([sale_id]);
        });

        txit('filters by maximum price', async () => {
            await client.createFullSale({
                listing_price: 200000000,
            });

            const {sale_id} = await client.createFullSale({});

            expect(await getSalesIds({symbol: 'TEST', max_price: '1'}))
                .to.deep.equal([sale_id]);
        });

        // txit('filters out seller contracts unless whitelisted', async () => {
        //     await client.createContractCode({
        //         account: 'excluded',
        //     });
        //     await client.createSale({
        //         seller: 'excluded',
        //     });
        //
        //     await client.createContractCode({
        //         account: 'whitelisted',
        //     });
        //     const {sale_id} = await client.createSale({
        //         seller: 'whitelisted',
        //     });
        //
        //     expect(await getSalesIds({show_seller_contracts: 'false', contract_whitelist: 'whitelisted,abc'}))
        //         .to.deep.equal([sale_id]);
        // });
        //
        // txit('filters by blacklisted sellers', async () => {
        //     await client.createSale({
        //         seller: 'blacklisted',
        //     });
        //
        //     const {sale_id} = await client.createSale({});
        //
        //     expect(await getSalesIds({seller_blacklist: 'blacklisted,abc'}))
        //         .to.deep.equal([sale_id]);
        // });
        //
        // txit('filters by blacklisted buyers', async () => {
        //     await client.createSale({
        //         buyer: 'blacklisted',
        //     });
        //
        //     const {sale_id} = await client.createSale({});
        //
        //     expect(await getSalesIds({buyer_blacklist: 'blacklisted,abc'}))
        //         .to.deep.equal([sale_id]);
        // });
        //
        // txit('filters by accounts', async () => {
        //     await client.createSale();
        //
        //     const {sale_id: sale_id1} = await client.createSale({buyer: 'x'});
        //     const {sale_id: sale_id2} = await client.createSale({seller: 'x'});
        //
        //     expect(await getSalesIds({account: 'x,abc'}))
        //         .to.deep.equal([sale_id2, sale_id1]);
        // });
        //
        // txit('filters by seller', async () => {
        //     await client.createSale();
        //
        //     const {sale_id} = await client.createSale({seller: 'x'});
        //
        //     expect(await getSalesIds({seller: 'x,abc'}))
        //         .to.deep.equal([sale_id]);
        // });
        //
        // txit('filters by buyer', async () => {
        //     await client.createSale();
        //
        //     const {sale_id} = await client.createSale({buyer: 'x'});
        //
        //     expect(await getSalesIds({buyer: 'x,abc'}))
        //         .to.deep.equal([sale_id]);
        // });
        //
        // txit('filters by maker marketplace', async () => {
        //     await client.createSale();
        //
        //     const {sale_id} = await client.createSale({maker_marketplace: 'x'});
        //
        //     expect(await getSalesIds({maker_marketplace: 'x,abc'}))
        //         .to.deep.equal([sale_id]);
        // });
        //
        // txit('filters by taker marketplace', async () => {
        //     await client.createSale();
        //
        //     const {sale_id} = await client.createSale({taker_marketplace: 'x'});
        //
        //     expect(await getSalesIds({taker_marketplace: 'x,abc'}))
        //         .to.deep.equal([sale_id]);
        // });
        //
        // txit('filters by maker or taker marketplace', async () => {
        //     await client.createSale();
        //
        //     const {sale_id: sale_id1} = await client.createSale({maker_marketplace: 'x'});
        //     const {sale_id: sale_id2} = await client.createSale({taker_marketplace: 'x'});
        //
        //     expect(await getSalesIds({marketplace: 'x,abc'}))
        //         .to.deep.equal([sale_id2, sale_id1]);
        // });
        //
        // txit('filters by collection', async () => {
        //     await client.createSale();
        //
        //     const {collection_name} = await client.createCollection({collection_name: 'x'});
        //     const {sale_id} = await client.createSale({collection_name});
        //
        //     expect(await getSalesIds({collection_name: 'x,abc'}))
        //         .to.deep.equal([sale_id]);
        // });
        //
        // txit('filters by minimum and maximum template mint', async () => {
        //     await client.createSale();
        //     await client.createSale({template_mint: '[1,2)'});
        //     await client.createSale({template_mint: '[10,11)'});
        //
        //     const {sale_id} = await client.createSale({template_mint: '[5,5]'});
        //
        //     expect(await getSalesIds({min_template_mint: '4', max_template_mint: '6'}))
        //         .to.deep.equal([sale_id]);
        // });
        //
        // txit('filters by asset_id', async () => {
        //     const offer1 = await client.createOfferAsset();
        //     await client.createSale({offer_id: offer1.offer_id});
        //
        //     const {asset_id, offer_id} = await client.createOfferAsset();
        //     const {sale_id} = await client.createSale({offer_id});
        //
        //     expect(await getSalesIds({asset_id}))
        //         .to.deep.equal([sale_id]);
        // });
        //
        // txit('filters by asset owner', async () => {
        //     const offer1 = await client.createOfferAsset();
        //     await client.createSale({offer_id: offer1.offer_id});
        //
        //     const {offer_id} = await client.createOfferAsset({}, {owner: 'x'});
        //     const {sale_id} = await client.createSale({offer_id});
        //
        //     expect(await getSalesIds({owner: 'x,abc'}))
        //         .to.deep.equal([sale_id]);
        // });
        //
        // txit('filters by asset burned', async () => {
        //     const offer1 = await client.createOfferAsset();
        //     await client.createSale({offer_id: offer1.offer_id});
        //
        //     const {offer_id} = await client.createOfferAsset({}, {owner: null});
        //     const {sale_id} = await client.createSale({offer_id});
        //
        //     expect(await getSalesIds({burned: 'true'}))
        //         .to.deep.equal([sale_id]);
        // });
        //
        // txit('filters by asset not burned', async () => {
        //     const offer1 = await client.createOfferAsset({}, {owner: null});
        //     await client.createSale({offer_id: offer1.offer_id});
        //
        //     const {offer_id} = await client.createOfferAsset();
        //     const {sale_id} = await client.createSale({offer_id});
        //
        //     expect(await getSalesIds({burned: 'false'}))
        //         .to.deep.equal([sale_id]);
        // });
        //
        // txit('filters by asset template', async () => {
        //     const offer1 = await client.createOfferAsset({}, {
        //         template_id: (await client.createTemplate()).template_id,
        //     });
        //     await client.createSale({offer_id: offer1.offer_id});
        //
        //     const {template_id} = await client.createTemplate();
        //     const {offer_id} = await client.createOfferAsset({}, {template_id});
        //     const {sale_id} = await client.createSale({offer_id});
        //
        //     expect(await getSalesIds({template_id: `${template_id},-1`}))
        //         .to.deep.equal([sale_id]);
        // });
        //
        // txit('filters by not having an asset template', async () => {
        //     const offer1 = await client.createOfferAsset({}, {
        //         template_id: (await client.createTemplate()).template_id,
        //     });
        //     await client.createSale({offer_id: offer1.offer_id});
        //
        //     const {offer_id} = await client.createOfferAsset();
        //     const {sale_id} = await client.createSale({offer_id});
        //
        //     expect(await getSalesIds({template_id: 'null'}))
        //         .to.deep.equal([sale_id]);
        // });
        //
        // txit('filters by schema', async () => {
        //     const offer1 = await client.createOfferAsset();
        //     await client.createSale({offer_id: offer1.offer_id});
        //
        //     const {schema_name} = await client.createSchema();
        //     const {offer_id} = await client.createOfferAsset({}, {schema_name});
        //     const {sale_id} = await client.createSale({offer_id});
        //
        //     expect(await getSalesIds({schema_name: `${schema_name},-1`}))
        //         .to.deep.equal([sale_id]);
        // });
        //
        // txit('filters by asset being transferable', async () => {
        //     const offer1 = await client.createOfferAsset({}, {
        //         template_id: (await client.createTemplate({transferable: false})).template_id,
        //     });
        //     await client.createSale({offer_id: offer1.offer_id});
        //
        //     const {template_id} = await client.createTemplate({transferable: true});
        //     const {offer_id} = await client.createOfferAsset({}, {template_id});
        //     const {sale_id} = await client.createSale({offer_id});
        //
        //     expect(await getSalesIds({is_transferable: 'true'}))
        //         .to.deep.equal([sale_id]);
        // });
        //
        // txit('filters by asset not being transferable', async () => {
        //     const offer1 = await client.createOfferAsset({}, {
        //         template_id: (await client.createTemplate({transferable: true})).template_id,
        //     });
        //     await client.createSale({offer_id: offer1.offer_id});
        //
        //     const {template_id} = await client.createTemplate({transferable: false});
        //     const {offer_id} = await client.createOfferAsset({}, {template_id});
        //     const {sale_id} = await client.createSale({offer_id});
        //
        //     expect(await getSalesIds({is_transferable: 'false'}))
        //         .to.deep.equal([sale_id]);
        // });
        //
        // txit('filters by asset being burnable', async () => {
        //     const offer1 = await client.createOfferAsset({}, {
        //         template_id: (await client.createTemplate({burnable: false})).template_id,
        //     });
        //     await client.createSale({offer_id: offer1.offer_id});
        //
        //     const {template_id} = await client.createTemplate({burnable: true});
        //     const {offer_id} = await client.createOfferAsset({}, {template_id});
        //     const {sale_id} = await client.createSale({offer_id});
        //
        //     expect(await getSalesIds({is_burnable: 'true'}))
        //         .to.deep.equal([sale_id]);
        // });
        //
        // txit('filters by asset not being burnable', async () => {
        //     const offer1 = await client.createOfferAsset({}, {
        //         template_id: (await client.createTemplate({burnable: true})).template_id,
        //     });
        //     await client.createSale({offer_id: offer1.offer_id});
        //
        //     const {template_id} = await client.createTemplate({burnable: false});
        //     const {offer_id} = await client.createOfferAsset({}, {template_id});
        //     const {sale_id} = await client.createSale({offer_id});
        //
        //     expect(await getSalesIds({is_burnable: 'false'}))
        //         .to.deep.equal([sale_id]);
        // });
        //
        // txit('filters by text data', async () => {
        //     const offer1 = await client.createOfferAsset();
        //     await client.createSale({offer_id: offer1.offer_id});
        //
        //     const {template_id} = await client.createTemplate({immutable_data: JSON.stringify({'prop': 'TheValue'})});
        //     const {offer_id} = await client.createOfferAsset({}, {template_id});
        //     const {sale_id} = await client.createSale({offer_id});
        //
        //     expect(await getSalesIds({'data:text.prop': 'TheValue'}))
        //         .to.deep.equal([sale_id]);
        // });
        //
        // txit('filters by number template_data', async () => {
        //     const offer1 = await client.createOfferAsset();
        //     await client.createSale({offer_id: offer1.offer_id});
        //
        //     const {template_id} = await client.createTemplate({immutable_data: JSON.stringify({'prop': 1})});
        //     const {offer_id} = await client.createOfferAsset({}, {template_id});
        //     const {sale_id} = await client.createSale({offer_id});
        //
        //     expect(await getSalesIds({'template_data:number.prop': 1}))
        //         .to.deep.equal([sale_id]);
        // });
        //
        // txit('filters by bool mutable_data', async () => {
        //     const offer1 = await client.createOfferAsset();
        //     await client.createSale({offer_id: offer1.offer_id});
        //
        //     const {offer_id} = await client.createOfferAsset({}, {mutable_data: JSON.stringify({'prop': 1})});
        //     const {sale_id} = await client.createSale({offer_id});
        //
        //     expect(await getSalesIds({'mutable_data:bool.prop': 'true'}))
        //         .to.deep.equal([sale_id]);
        // });
        //
        // txit('filters by untyped immutable_data', async () => {
        //     const offer1 = await client.createOfferAsset();
        //     await client.createSale({offer_id: offer1.offer_id});
        //
        //     const {offer_id} = await client.createOfferAsset({}, {immutable_data: JSON.stringify({'prop': 'this'})});
        //     const {sale_id} = await client.createSale({offer_id});
        //
        //     expect(await getSalesIds({'immutable_data.prop': 'this'}))
        //         .to.deep.equal([sale_id]);
        // });
        //
        // txit('filters by match_immutable_name', async () => {
        //     const offer1 = await client.createOfferAsset();
        //     await client.createSale({offer_id: offer1.offer_id});
        //
        //     const {offer_id} = await client.createOfferAsset({}, {immutable_data: JSON.stringify({name: 'prefix_par%_tial_postfix'})});
        //     const {sale_id} = await client.createSale({offer_id});
        //
        //     expect(await getSalesIds({'match_immutable_name': 'par%_tial'}))
        //         .to.deep.equal([sale_id]);
        // });
        //
        // txit('filters by match_mutable_name', async () => {
        //     const offer1 = await client.createOfferAsset();
        //     await client.createSale({offer_id: offer1.offer_id});
        //
        //     const {offer_id} = await client.createOfferAsset({}, {mutable_data: JSON.stringify({name: 'prefix_par%_tial_postfix'})});
        //     const {sale_id} = await client.createSale({offer_id});
        //
        //     expect(await getSalesIds({'match_mutable_name': 'par%_tial'}))
        //         .to.deep.equal([sale_id]);
        // });
        //
        // txit('filters by match (template name)', async () => {
        //     const offer1 = await client.createOfferAsset();
        //     await client.createSale({offer_id: offer1.offer_id});
        //
        //     const {template_id} = await client.createTemplate({immutable_data: JSON.stringify({name: 'prefix_par%_tial_postfix'})});
        //     const {offer_id} = await client.createOfferAsset({}, {template_id});
        //     const {sale_id} = await client.createSale({offer_id});
        //
        //     expect(await getSalesIds({'match': 'par%_tial'}))
        //         .to.deep.equal([sale_id]);
        // });
        //
        // txit('filters by collection_whitelist', async () => {
        //     await client.createSale();
        //
        //     const {collection_name} = await client.createCollection({collection_name: 'x'});
        //     const {sale_id} = await client.createSale({collection_name});
        //
        //     expect(await getSalesIds({collection_name: 'x,abc'}))
        //         .to.deep.equal([sale_id]);
        // });
        //
        // txit('filters by collection_blacklist', async () => {
        //     const {collection_name} = await client.createCollection({collection_name: 'x'});
        //     await client.createSale({collection_name});
        //
        //     const {sale_id} = await client.createSale();
        //
        //     expect(await getSalesIds({collection_blacklist: 'x,abc'}))
        //         .to.deep.equal([sale_id]);
        // });
        //
        // txit('filters by id (sale_id)', async () => {
        //     await client.createSale();
        //
        //     const {sale_id} = await client.createSale();
        //
        //     expect(await getSalesIds({ids: `${sale_id},-1`}))
        //         .to.deep.equal([sale_id]);
        // });
        //
        // txit('filters by id range (sale_id)', async () => {
        //     await client.createSale();
        //
        //     const lower_bound = `${client.getId()}`;
        //
        //     const {sale_id} = await client.createSale();
        //     const upper_bound = `${client.getId()}`;
        //
        //     await client.createSale();
        //
        //     expect(await getSalesIds({lower_bound, upper_bound}))
        //         .to.deep.equal([sale_id]);
        // });
        //
        // txit('filters by date range', async () => {
        //     await client.createSale();
        //
        //     const after = `${client.getId()}`;
        //
        //     const {sale_id} = await client.createSale();
        //     const before = `${client.getId()}`;
        //
        //     await client.createSale();
        //
        //     expect(await getSalesIds({after, before}))
        //         .to.deep.equal([sale_id]);
        // });
        //
        // txit('returns count', async () => {
        //     await client.createFullSale();
        //
        //     const {sale_id} = await client.createFullSale();
        //
        //     const testContext = getTestContext(client);
        //
        //     await client.query('SELECT update_atomicmarket_sales_filters()');
        //
        //     const result = await getSalesV2Action({ids: `${sale_id}`, count: 'true'}, testContext);
        //
        //     expect(result).to.equal('1');
        // });

        txit('orders ascending', async () => {
            const {sale_id: sale_id1} = await client.createFullSale();

            const {sale_id: sale_id2} = await client.createFullSale();

            expect(await getSalesIds({order: 'asc'}))
                .to.deep.equal([sale_id1, sale_id2]);
        });

        txit('orders descending', async () => {
            const {sale_id: sale_id1} = await client.createFullSale();

            const {sale_id: sale_id2} = await client.createFullSale();

            expect(await getSalesIds({order: 'desc'}))
                .to.deep.equal([sale_id2, sale_id1]);
        });

        txit('orders by sale_id', async () => {
            const sale_id2 = `${client.getId()}`;
            const {sale_id: sale_id1} = await client.createFullSale();

            await client.createFullSale({sale_id: sale_id2, created_at_time: sale_id2});

            expect(await getSalesIds({sort: 'sale_id'}))
                .to.deep.equal([sale_id1, sale_id2]);
        });

        txit('orders by created', async () => {
            const created_at_time = `${client.getId()}`;
            const {sale_id: sale_id1} = await client.createFullSale({});

            const {sale_id: sale_id2} = await client.createFullSale({created_at_time});

            expect(await getSalesIds({sort: 'created'}))
                .to.deep.equal([sale_id1, sale_id2]);
        });

        txit('orders by updated', async () => {
            const updated_at_time = `${client.getId()}`;
            const {sale_id: sale_id1} = await client.createFullSale({});

            const {sale_id: sale_id2} = await client.createFullSale({updated_at_time});

            expect(await getSalesIds({sort: 'updated'}))
                .to.deep.equal([sale_id1, sale_id2]);
        });

        txit('orders by price', async () => {
            const sale_id2 = `${client.getId()}`;
            const {sale_id: sale_id1} = await client.createFullSale({listing_price: 2});

            await client.createFullSale({listing_price: 1, sale_id: sale_id2});

            expect(await getSalesIds({sort: 'price'}))
                .to.deep.equal([sale_id1, sale_id2]);
        });

        txit('orders by template_mint', async () => {
            const {sale_id: sale_id1} = await client.createFullSale({template_mint: '[2,3)'});

            const {sale_id: sale_id2} = await client.createFullSale({template_mint: '[1,2)'});

            expect(await getSalesIds({sort: 'template_mint'}))
                .to.deep.equal([sale_id1, sale_id2]);
        });

        txit('paginates', async () => {
            const {sale_id: sale_id1} = await client.createFullSale();

            await client.createFullSale();

            expect(await getSalesIds({page: '2', limit: '1'}))
                .to.deep.equal([sale_id1]);
        });

        txit('formats and fills result', async () => {
            await client.createFullSale();

            const testContext = getTestContext(client);

            await client.query('SELECT update_atomicmarket_sales_filters()');

            const [result] = await getSalesV2Action({}, testContext);

            expect(result).to.not.haveOwnProperty('raw_price');
            expect(result).to.haveOwnProperty('state');
            expect(result).to.haveOwnProperty('price');
            expect(result).to.haveOwnProperty('collection');
        });

    });

});
