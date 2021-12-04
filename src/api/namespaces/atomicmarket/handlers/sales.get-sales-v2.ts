import { buildBoundaryFilter, filterQueryArgs, FilterValues, RequestValues } from '../../utils';
import { AtomicMarketContext } from '../index';
import QueryBuilder from '../../../builder';
import { fillSales } from '../filler';
import { formatSale } from '../format';
import { ApiError } from '../../../error';

export async function getSalesV2Action(params: RequestValues, ctx: AtomicMarketContext): Promise<any> {

    const args = filterQueryArgs(params, {
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: 100, default: 100},
        sort: {
            type: 'string',
            values: [
                'created', 'updated', 'sale_id', 'price',
                'template_mint'
            ],
            default: 'created'
        },
        order: {type: 'string', values: ['asc', 'desc'], default: 'desc'},
        count: {type: 'bool'}
    });

    const query = new QueryBuilder(`
                SELECT listing.sale_id
                FROM atomicmarket_sales_filters listing
            `);

    query.equal('listing.market_contract', ctx.coreArgs.atomicmarket_account);

    await buildSaleFilterV2(params, query, ctx);

    buildBoundaryFilter(
        params, query, 'listing.sale_id', 'int',
        args.sort === 'updated' ? 'listing.updated_at_time' : 'listing.created_at_time'
    );
/*
    if (args.count) {
        const countQuery = await ctx.db.query(
            'SELECT COUNT(*) counter FROM (' + query.buildString() + ') x',
            query.buildValues()
        );

        return countQuery.rows[0].counter;
    }
*/
    const sortMapping: { [key: string]: { column: string, nullable: boolean, numericIndex: boolean } } = {
        sale_id: {column: 'listing.sale_id', nullable: false, numericIndex: true},
        created: {column: 'listing.created_at_time', nullable: false, numericIndex: true},
        updated: {column: 'listing.updated_at_time', nullable: false, numericIndex: true},
        price: {column: 'listing.price', nullable: true, numericIndex: false},
        template_mint: {column: 'LOWER(listing.template_mint)', nullable: true, numericIndex: false}
    };

    // const preventIndexUsage = (hasAssetFilter(params) || hasDataFilters(params) || hasListingFilter(params)) && sortMapping[args.sort].numericIndex;

    query.append(`ORDER BY ${sortMapping[args.sort].column} ${args.order} ${(sortMapping[args.sort].nullable ? 'NULLS LAST' : '')}, listing.sale_id ASC`);
    query.paginate(args.page, args.limit);

    const saleQuery = await ctx.db.query(query.buildString(), query.buildValues());

    const result = await ctx.db.query(`
            SELECT * FROM atomicmarket_sales_master m
                JOIN UNNEST($2::BIGINT[]) WITH ORDINALITY AS f(sale_id) ON m.sale_id = f.sale_id
            WHERE market_contract = $1
            ORDER BY f.ordinality`,
        [ctx.coreArgs.atomicmarket_account, saleQuery.rows.map(row => row.sale_id)]
    );

    return await fillSales(
        ctx.db, ctx.coreArgs.atomicassets_account, result.rows.map(formatSale)
    );

}

export async function getSalesCountV2Action(params: RequestValues, ctx: AtomicMarketContext): Promise<any> {
    return await getSalesV2Action({...params, count: 'true'}, ctx);
}

async function buildSaleFilterV2(values: FilterValues, query: QueryBuilder, ctx: AtomicMarketContext): Promise<void> {
    const args = filterQueryArgs(values, {
        state: {type: 'string', min: 1},

        max_assets: {type: 'int', min: 1},
        min_assets: {type: 'int', min: 1},

        symbol: {type: 'string', min: 1},
        min_price: {type: 'float', min: 0},
        max_price: {type: 'float', min: 0}
    });

    buildAggFilterV2(values, query);
    buildListingFilterV2(values, query);

    buildAssetFilterV2(values, query);

    if (args.max_assets) {
        query.addCondition(`listing.asset_count <= ${args.max_assets}`);
    }

    if (args.min_assets) {
        query.addCondition(`listing.asset_count >= ${args.min_assets}`);
    }

    if (args.symbol) {
        query.equal('listing.settlement_symbol', args.symbol);

        const {token_precision} = (await ctx.db.query('SELECT token_precision FROM atomicmarket_tokens WHERE market_contract = $1 AND token_symbol = $2', [ctx.coreArgs.atomicmarket_account, args.symbol])).rows[0];

        if (args.min_price) {
            query.addCondition(`listing.price >= 1.0 * ${query.addVariable(args.min_price)} * POWER(10, ${query.addVariable(token_precision)})`);
        }

        if (args.max_price) {
            query.addCondition(`listing.price <= 1.0 * ${query.addVariable(args.max_price)} * POWER(10, ${query.addVariable(token_precision)})`);
        }
    } else if (args.min_price || args.max_price) {
        throw new ApiError('Price range filters require the "symbol" filter');
    }

    if (args.state?.length) {
        query.equalMany('listing.sale_state', args.state.split(',').map((state: string) => parseInt(state, 10)));
    }
}

function buildAssetFilterV2(values: FilterValues, query: QueryBuilder): void {

    const args = filterQueryArgs(values, {
        asset_id: {type: 'string[]', min: 1},
    });

    buildDataConditionsV2(values, query);

    if (args.asset_id) {
        query.addCondition(`listing.asset_ids && ${query.addVariable(args.asset_id)}`);
    }

}

type AggFilter = {
    buyers?: string[],
    sellers?: string[],
    collection_names?: string[],
    owners?: string[],
    flags?: string[],
    template_ids?: string[],
    schema_names?: string[],
};

const SALE_FILTER_FLAG_BURNED = 'b';
const SALE_FILTER_FLAG_NO_TEMPLATE = 'nt';
const SALE_FILTER_FLAG_NOT_TRANSFERABLE = 'nx';
const SALE_FILTER_FLAG_NOT_BURNABLE = 'nb';

function buildAggFilterV2(values: FilterValues, query: QueryBuilder): void {
    const args = filterQueryArgs(values, {
        seller_blacklist: {type: 'string[]', min: 1},
        buyer_blacklist: {type: 'string[]', min: 1},

        account: {type: 'string[]', min: 1},
        seller: {type: 'string[]', min: 1},
        buyer: {type: 'string[]', min: 1},

        collection_name: {type: 'string[]', min: 1, default: []},
        collection_blacklist: {type: 'string[]', min: 1},
        collection_whitelist: {type: 'string[]', min: 1, default: []},

        owner: {type: 'string[]', min: 1, max: 12},

        burned: {type: 'bool'},
        template_id: {type: 'string[]', min: 1, default: []},
        schema_name: {type: 'string[]', min: 1},
        is_transferable: {type: 'bool'},
        is_burnable: {type: 'bool'},

    });

    let hasInc = 0;
    const inc: AggFilter = {
        buyers: [],
        sellers: [],
        collection_names: [],
        owners: [],
        flags: [],
        template_ids: [],
        schema_names: [],
    };

    let hasExc = 0;
    const exc: AggFilter = {
        buyers: [],
        sellers: [],
        collection_names: [],
        flags: [],
    };

    function addIncArrayFilter(filter: string, value: any = undefined): void {
        value = value ?? args[filter];
        if (value?.length) {
            if (value.length > 1) {
                query.addCondition(`(listing.filter && create_atomicmarket_sales_filter(${filter}s := ${query.addVariable(value)}))`);
            } else {
                // @ts-ignore
                hasInc = inc[filter+'s'].push(args[filter]);
            }
        }
    }

    addIncArrayFilter('owner');
    addIncArrayFilter('collection_name');
    addIncArrayFilter('collection_name', args.collection_whitelist);

    if (args.account) {
        query.addCondition(`(listing.filter && create_atomicmarket_sales_filter(sellers := ${query.addVariable(args.account)}, buyers := ${query.addVariable(args.account)}))`);
    }

    addIncArrayFilter('seller');
    addIncArrayFilter('buyer');

    addIncArrayFilter('schema_name');

    if (args.template_id.find((s: string) => s.toLowerCase() === 'null')) {
        hasInc = inc.flags.push(SALE_FILTER_FLAG_NO_TEMPLATE);
    } else {
        addIncArrayFilter('template_id');
    }

    if (typeof args.burned === 'boolean') {
        if (args.burned) {
            hasInc = inc.flags.push(SALE_FILTER_FLAG_BURNED);
        } else {
            hasExc = exc.flags.push(SALE_FILTER_FLAG_BURNED);
        }
    }

    if (typeof args.is_transferable === 'boolean') {
        if (args.is_transferable) {
            hasExc = exc.flags.push(SALE_FILTER_FLAG_NOT_TRANSFERABLE);
        } else {
            hasInc = inc.flags.push(SALE_FILTER_FLAG_NOT_TRANSFERABLE);
        }
    }

    if (typeof args.is_burnable === 'boolean') {
        if (args.is_burnable) {
            hasExc = exc.flags.push(SALE_FILTER_FLAG_NOT_BURNABLE);
        } else {
            hasInc = inc.flags.push(SALE_FILTER_FLAG_NOT_BURNABLE);
        }
    }

    if (args.seller_blacklist) {
        hasExc = exc.sellers.push(...args.seller_blacklist);
    }

    if (args.buyer_blacklist) {
        hasExc = exc.buyers.push(...args.buyer_blacklist);
    }

    if (args.collection_blacklist) {
        hasExc = exc.collection_names.push(...args.collection_blacklist);
    }

    if (hasInc) {
        query.addCondition(`(listing.filter @> create_atomicmarket_sales_filter(
            buyers := ${query.addVariable(inc.buyers)},
            sellers := ${query.addVariable(inc.sellers)},
            collection_names := ${query.addVariable(inc.collection_names)},
            owners := ${query.addVariable(inc.owners)},
            flags := ${query.addVariable(inc.flags)},
            template_ids := ${query.addVariable(inc.template_ids)},
            schema_names := ${query.addVariable(inc.schema_names)}
        ))`);
    }

    if (hasExc) {
        query.addCondition(`NOT (listing.filter && create_atomicmarket_sales_filter(
            buyers := ${query.addVariable(exc.buyers)},
            sellers := ${query.addVariable(exc.sellers)},
            collection_names := ${query.addVariable(exc.collection_names)},
            flags := ${query.addVariable(exc.flags)}
        ))`);
    }
}

function buildListingFilterV2(values: FilterValues, query: QueryBuilder): void {
    const args = filterQueryArgs(values, {
        show_seller_contracts: {type: 'bool', default: true},
        contract_whitelist: {type: 'string[]', min: 1, default: []},

        maker_marketplace: {type: 'string[]', min: 1},
        taker_marketplace: {type: 'string[]', min: 1},
        marketplace: {type: 'string[]', min: 1},

        min_template_mint: {type: 'int', min: 1},
        max_template_mint: {type: 'int', min: 1}
    });

    if (!args.show_seller_contracts) {
        // TODO replace with flag on filter table? Needs to be updated when contract_codes changes
        query.addCondition(
            'NOT EXISTS(' +
            'SELECT * FROM contract_codes code ' +
            'WHERE code.account = listing.seller AND code.account != ALL(' + query.addVariable(args.contract_whitelist) + ')' +
            ')'
        );
    }

    if (args.marketplace) {
        const varName = query.addVariable(args.marketplace);
        query.addCondition('(listing.maker_marketplace = ANY (' + varName + ') OR listing.taker_marketplace = ANY (' + varName + ')) ');
    } else {
        if (args.maker_marketplace) {
            query.equalMany('listing.maker_marketplace', args.maker_marketplace);
        }

        if (args.taker_marketplace) {
            query.equalMany('listing.taker_marketplace', args.taker_marketplace);
        }
    }

    if (args.min_template_mint || args.max_template_mint) {
        if ((args.min_template_mint && args.min_template_mint > 1) || (args.max_template_mint && args.max_template_mint < 1)) {
            query.addCondition('listing.template_mint != \'empty\'');
        }

        query.addCondition(
            'listing.template_mint <@ int4range(' +
            query.addVariable(args.min_template_mint ?? null) + ', ' +
            query.addVariable(args.max_template_mint ?? null) +
            ', \'[]\')'
        );
    }
}

function buildDataConditionsV2(values: FilterValues, query: QueryBuilder): void {
    // const keys = Object.keys(values);
    //
    // function buildConditionObject(name: string): {[key: string]: string | number | boolean} {
    //     const searchObject: {[key: string]: string | number} = {};
    //
    //     for (const key of keys) {
    //         if (key.startsWith(name + ':text.')) {
    //             searchObject[key.substr((name + ':text.').length)] = String(values[key]);
    //         } else if (key.startsWith(name + ':number.')) {
    //             searchObject[key.substr((name + ':number.').length)] = parseFloat(values[key]);
    //         } else if (key.startsWith(name + ':bool.')) {
    //             searchObject[key.substr((name + ':bool.').length)] = (values[key] === 'true' || values[key] === '1') ? 1 : 0;
    //         } else if (key.startsWith(name + '.')) {
    //             searchObject[key.substr((name + '.').length)] = values[key];
    //         }
    //     }
    //
    //     return searchObject;
    // }
    //
    // const templateCondition = {...buildConditionObject('data'), ...buildConditionObject('template_data')};
    // const mutableCondition = buildConditionObject('mutable_data');
    // const immutableCondition = buildConditionObject('immutable_data');
    //
    // if (Object.keys(mutableCondition).length > 0) {
    //     query.addCondition(options.assetTable + '.mutable_data @> ' + query.addVariable(JSON.stringify(mutableCondition)) + '::jsonb');
    // }
    //
    // if (Object.keys(immutableCondition).length > 0) {
    //     query.addCondition(options.assetTable + '.immutable_data @> ' + query.addVariable(JSON.stringify(immutableCondition)) + '::jsonb');
    // }

    if (typeof values.match_immutable_name === 'string' && values.match_immutable_name.length > 0) {
        query.addCondition(
            'listing.asset_names ILIKE ' +
            query.addVariable('%' + values.match_immutable_name.replace('%', '\\%').replace('_', '\\_') + '%')
        );
    }

    if (typeof values.match_mutable_name === 'string' && values.match_mutable_name.length > 0) {
        query.addCondition(
            'listing.asset_names ILIKE ' +
            query.addVariable('%' + values.match_mutable_name.replace('%', '\\%').replace('_', '\\_') + '%')
        );
    }

    if (typeof values.match === 'string' && values.match.length > 0) {
        query.addCondition(
            'listing.asset_names ILIKE ' +
            query.addVariable('%' + values.match.replace('%', '\\%').replace('_', '\\_') + '%')
        );
    }

    // if (Object.keys(templateCondition).length > 0) {
    //     query.addCondition(options.templateTable + '.immutable_data @> ' + query.addVariable(JSON.stringify(templateCondition)) + '::jsonb');
    // }
}
