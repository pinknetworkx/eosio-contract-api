import {buildBoundaryFilter, RequestValues} from '../../utils';
import {AtomicMarketContext, SaleApiState} from '../index';
import QueryBuilder from '../../../builder';
import {fillSales} from '../filler';
import {formatSale} from '../format';
import {ApiError} from '../../../error';
import {toInt} from '../../../../utils';
import moize from 'moize';
import {filterQueryArgs, FilterValues} from '../../validation';
import {hasAssetFilter} from '../../atomicassets/utils';
import {buildTemplateMintFilter} from '../utils';

type SalesSearchOptions = {
    values: FilterValues;
    ctx: AtomicMarketContext;
    query: QueryBuilder;
    strongFilters: string[];
    saleStates: number[],
}

const LISTING_ORDER_MARKER = '/*listing_order_marker*/';
export async function getSalesV2Action(params: RequestValues, ctx: AtomicMarketContext): Promise<any> {
    const maxLimit = ctx.coreArgs.limits?.sales_v2 || 100;
    const args = await filterQueryArgs(params, {
        state: {type: 'string[]', min: 1},

        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: maxLimit, default: Math.min(maxLimit, 100)},
        sort: {
            type: 'string',
            allowedValues: [
                'created', 'updated', 'sale_id', 'price',
                'template_mint', 'name',
            ],
            default: 'created'
        },
        order: {type: 'string', allowedValues: ['asc', 'desc'], default: 'desc'},
        count: {type: 'bool'}
    });

    const query = new QueryBuilder(`
        SELECT listing.sale_id, listing.market_contract ${LISTING_ORDER_MARKER}
        FROM atomicmarket_sales_filters listing
    `);

    query.equal('listing.market_contract', ctx.coreArgs.atomicmarket_account);

    const search: SalesSearchOptions = {
        values: params,
        ctx,
        query,
        strongFilters: [],
        saleStates: args.state.map(toInt),
    };

    await buildSaleFilterV2(search);

    await buildBoundaryFilter(
        params, query, 'listing.sale_id', 'int',
        args.sort === 'updated' ? 'listing.updated_at_time' : 'listing.created_at_time'
    );
    if (params.ids) {
        search.strongFilters.push('ids');
    }

    if (args.count) {
        const countQuery = await ctx.db.query(
            'SELECT COUNT(*) counter FROM (' + query.buildString() + ') x',
            query.buildValues()
        );

        return countQuery.rows[0].counter;
    }

    const sortMapping: { [key: string]: { column: string, nullable?: boolean, numericIndex: boolean } } = {
        sale_id: {column: 'listing.sale_id', numericIndex: true},
        created: {column: 'listing.created_at_time', numericIndex: true},
        updated: {column: 'listing.updated_at_time', numericIndex: true},
        price: {column: 'listing.price', numericIndex: true},
        template_mint: {column: 'LOWER(listing.template_mint)', numericIndex: true},
        name: {column: `SPLIT_PART(listing.asset_names, e'\\n', 1)`, nullable: true, numericIndex: false},
    };

    if (args.sort === 'template_mint') {
        query.addCondition('LOWER(listing.template_mint) IS NOT NULL');

        if (args.order === 'asc' && !search.strongFilters.length) {
            // TODO find a better solution. when no strong (collection) filter is set, and the result is ordered by
            //  template_mint in ascending order, it always takes longer than 10 seconds. I think it's due to lack
            //  of listings matching whitelisted/blacklisted listings at the lower end of the mints
            search.strongFilters.push('template_mint_asc_block');
        }
    }

    const preventIndexUsage = search.strongFilters.length > 0 && sortMapping[args.sort].numericIndex;

    const orderBy = `ORDER BY ${sortMapping[args.sort].column}${preventIndexUsage ? ' + 0' : ''} ${args.order} ${sortMapping[args.sort].nullable ? 'NULLS LAST' : ''}, listing.sale_id`;
    query.append(orderBy);

    const stateRecheckQuery = addStateRecheck(query, search.saleStates, args.page, args.limit, orderBy);

    const saleIds = await ctx.db.query(stateRecheckQuery.buildString(), stateRecheckQuery.buildValues());

    return await fillSalesIdRows(saleIds.rows, ctx);
}

function addStateRecheck(query: QueryBuilder, saleStates: number[], page: number, limit: number, orderBy: string): QueryBuilder {
    if (!saleStates.length) {
        query.paginate(page, limit);
        return query;
    }

    query.append(`LIMIT ${Math.ceil(page * limit * 1.25)}`); // select more rows than requested in case the state doesn't match for some of them

    const stateRecheckQuery = new QueryBuilder(`
        WITH listings AS MATERIALIZED (
            ${query.buildString().replace(LISTING_ORDER_MARKER, `, ROW_NUMBER() OVER(${orderBy}) listing_order`)}
        )
        
        SELECT listings.sale_id
        FROM listings
            LEFT OUTER JOIN atomicmarket_sales sales ON listings.market_contract = sales.market_contract AND listings.sale_id = sales.sale_id
            LEFT OUTER JOIN atomicassets_offers offer ON sales.assets_contract = offer.contract AND sales.offer_id = offer.offer_id
        WHERE atomicmarket_get_sale_state(sales.state, offer.state) = ANY(${query.addVariable(saleStates)})
        ORDER BY listing_order
    `, query.buildValues());

    stateRecheckQuery.paginate(page, limit);

    return stateRecheckQuery;
}

async function fillSalesIdRows(rows: any[], ctx: AtomicMarketContext): Promise<any[]> {
    const result = await ctx.db.query(`
            SELECT * FROM atomicmarket_sales_master m
                JOIN UNNEST($2::BIGINT[]) WITH ORDINALITY AS f(sale_id) ON m.sale_id = f.sale_id
            WHERE market_contract = $1
                AND m.sale_id = ANY($2::BIGINT[])
            ORDER BY f.ordinality`,
        [ctx.coreArgs.atomicmarket_account, rows.map((row: any) => row.sale_id)]
    );

    return await fillSales(
        ctx.db, ctx.coreArgs.atomicassets_account, result.rows.map(formatSale)
    );
}

export async function getSalesCountV2Action(params: RequestValues, ctx: AtomicMarketContext): Promise<any> {
    return await getSalesV2Action({...params, count: 'true'}, ctx);
}

async function buildSaleFilterV2(search: SalesSearchOptions): Promise<void> {
    const {values, query, ctx} = search;
    const args = await filterQueryArgs(values, {
        max_assets: {type: 'int', min: 1},
        min_assets: {type: 'int', min: 1},

        symbol: {type: 'string', min: 1},
        min_price: {type: 'float', min: 0},
        max_price: {type: 'float', min: 0},

        template_blacklist: {type: 'int[]', min: 1},
    });

    await buildMainFilterV2(search);
    await buildListingFilterV2(search);

    await buildAssetFilterV2(search);

    if (args.template_blacklist.length) {
        const ignore = args.template_blacklist.map((t: number) => `t${t}`);
        query.addCondition(`NOT(listing.filter && ${query.addVariable(ignore)}::TEXT[])`);
    }

    if (args.max_assets) {
        query.addCondition(`listing.asset_count <= ${args.max_assets}`);
    }

    if (args.min_assets) {
        query.addCondition(`listing.asset_count >= ${args.min_assets}`);
    }

    if (args.symbol) {
        query.equal('listing.settlement_symbol', args.symbol);

        const token = await ctx.db.query('SELECT token_precision FROM atomicmarket_tokens WHERE market_contract = $1 AND token_symbol = $2', [ctx.coreArgs.atomicmarket_account, args.symbol]);

        if (token.rows.length === 0) {
            throw new ApiError('Symbol not found');
        }

        const {token_precision} = token.rows[0];

        if (args.min_price) {
            query.addCondition(`listing.price >= 1.0 * ${query.addVariable(args.min_price)} * POWER(10, ${query.addVariable(token_precision)})`);
            search.strongFilters.push('price');
        }

        if (args.max_price) {
            query.addCondition(`listing.price <= 1.0 * ${query.addVariable(args.max_price)} * POWER(10, ${query.addVariable(token_precision)})`);
            search.strongFilters.push('price');
        }
    } else if (args.min_price || args.max_price) {
        throw new ApiError('Price range filters require the "symbol" filter');
    }

    if (search.saleStates.length) {
        query.equalMany('listing.sale_state', search.saleStates);
    }
}

async function buildAssetFilterV2(search: SalesSearchOptions): Promise<void> {
    const {values, query} = search;

    const args = await filterQueryArgs(values, {
        asset_id: {type: 'id[]'},
    });

    if (args.asset_id.length) {
        query.addCondition(`listing.asset_ids && ${query.addVariable(args.asset_id)}`);
        search.strongFilters.push('asset_ids');
    }

    const names = [values.match_immutable_name, values.match_mutable_name, values.match].filter(v => typeof v === 'string' && v.length);
    for (const name of names) {
        query.addCondition(
            'listing.asset_names ILIKE ' +
            query.addVariable('%' + query.escapeLikeVariable(name) + '%')
        );
        // postgres makes the right decision on whether to use the asset_names index or the order index based
        // on how common the keyword is, so we don't force it to use the asset_names index here
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
    data?: string[],
};

const SALE_FILTER_FLAG_BURNED = 'b';
const SALE_FILTER_FLAG_NO_TEMPLATE = 'nt';
const SALE_FILTER_FLAG_NOT_TRANSFERABLE = 'nx';
const SALE_FILTER_FLAG_NOT_BURNABLE = 'nb';

async function buildMainFilterV2(search: SalesSearchOptions): Promise<void> {
    const {values, query} = search;
    const args = await filterQueryArgs(values, {
        seller_blacklist: {type: 'list[]', min: 1},
        buyer_blacklist: {type: 'list[]', min: 1},

        account: {type: 'list[]', min: 1},
        seller: {type: 'list[]', min: 1},
        buyer: {type: 'list[]', min: 1},

        collection_name: {type: 'list[]', min: 1},
        collection_blacklist: {type: 'list[]', min: 1},
        collection_whitelist: {type: 'list[]', min: 1},

        owner: {type: 'list[]', min: 1, max: 12},

        burned: {type: 'bool'},
        template_id: {type: 'id[]'},
        schema_name: {type: 'list[]', min: 1},
        is_transferable: {type: 'bool'},
        is_burnable: {type: 'bool'},

        search: {type: 'string', min: 1},
    });

    const inc: AggFilter = {
        buyers: [],
        sellers: [],
        collection_names: [],
        owners: [],
        flags: [],
        template_ids: [],
        schema_names: [],
        data: [],
    };

    const exc: AggFilter = {
        buyers: [],
        sellers: [],
        collection_names: [],
        flags: [],
    };

    async function addIncArrayFilter(filter: keyof typeof args, canBeStrongFilter: boolean = false, value: any = undefined): Promise<void> {
        value = value ?? args[filter];
        if (value?.length) {
            // when a single filter has multiple values, search ALL of them
            if (value.length > 1) {
                if (value.length > 50 && filter === 'collection_name') {
                    query.addCondition(`EXISTS (SELECT 1 FROM UNNEST(${query.addVariable(value)}::TEXT[]) u(collection_name) WHERE SUBSTR(listing.filter[1], 2) = u.collection_name)`);
                } else {
                    query.addCondition(`(listing.filter && create_atomicmarket_sales_filter(${filter}s := ${query.addVariable(value)}))`);
                }
            } else {
                // @ts-ignore
                inc[filter + 's'].push(value[0]);
            }

            if (canBeStrongFilter && await isStrongMainFilter(filter, value, search)) {
                search.strongFilters.push(filter);
            }
        }
    }

    await addIncArrayFilter('owner', true);

    const collectionNames = [];
    if (args.collection_name.length || args.collection_whitelist.length) {
        collectionNames.push(
            ...(
                args.collection_name.length
                    ? args.collection_name.filter((collectionName: string) => !args.collection_whitelist.length || args.collection_whitelist.includes(collectionName))
                    : args.collection_whitelist
            )
                .filter((collectionName: string) => !args.collection_blacklist.includes(collectionName))
        );

        if (!collectionNames.length) {
            collectionNames.push('\nDOES_NOT_EXIST\n');
        }
    } else if (args.collection_blacklist.length) {
        exc.collection_names.push(...args.collection_blacklist);
    }

    if (args.account.length) {
        query.addCondition(`(listing.filter && create_atomicmarket_sales_filter(sellers := ${query.addVariable(args.account)}, buyers := ${query.addVariable(args.account)}))`);
        search.strongFilters.push('account');
    }

    await addIncArrayFilter('seller', true);
    await addIncArrayFilter('buyer', true);

    const templateIds = [];
    if (args.template_id.find((s: string) => s.toLowerCase() === 'null')) {
        inc.flags.push(SALE_FILTER_FLAG_NO_TEMPLATE);
    } else {
        templateIds.push(...args.template_id);
    }

    const schemaNames = [...args.schema_name];

    if (args.search?.length || templateIds.length) {
        await addIncArrayFilter('template_id', true, await getTemplateIDs(args.search, search, collectionNames, schemaNames, templateIds));
        // we don't need to filter by collection or schema since template ids are unique
        collectionNames.length = 0;
        schemaNames.length = 0;
    }

    await addIncArrayFilter('schema_name', true, schemaNames);
    await addIncArrayFilter('collection_name', true, collectionNames);

    if (typeof args.burned === 'boolean') {
        if (args.burned) {
            inc.flags.push(SALE_FILTER_FLAG_BURNED);
        } else {
            exc.flags.push(SALE_FILTER_FLAG_BURNED);
        }
    }

    if (typeof args.is_transferable === 'boolean') {
        if (args.is_transferable) {
            exc.flags.push(SALE_FILTER_FLAG_NOT_TRANSFERABLE);
        } else {
            inc.flags.push(SALE_FILTER_FLAG_NOT_TRANSFERABLE);
        }
    }

    if (typeof args.is_burnable === 'boolean') {
        if (args.is_burnable) {
            exc.flags.push(SALE_FILTER_FLAG_NOT_BURNABLE);
        } else {
            inc.flags.push(SALE_FILTER_FLAG_NOT_BURNABLE);
        }
    }

    if (args.seller_blacklist.length) {
        exc.sellers.push(...args.seller_blacklist);
    }

    if (args.buyer_blacklist.length) {
        exc.buyers.push(...args.buyer_blacklist);
    }

    inc.data = getDataFilters(search);

    if (exc.collection_names.length >= 50) {
        query.addCondition(`NOT EXISTS (SELECT 1 FROM UNNEST(${query.addVariable([...exc.collection_names])}::TEXT[]) u(collection_name) WHERE SUBSTR(listing.filter[1], 2) = u.collection_name)`);
        exc.collection_names.length = 0;
    }

    const incFilterArgs = Object.keys(inc)
        // @ts-ignore
        .filter(prop => inc[prop]?.length)
        // @ts-ignore
        .map(prop => `${prop} => ${query.addVariable(inc[prop])}`);

    if (incFilterArgs.length) {
        query.addCondition(`(listing.filter @> create_atomicmarket_sales_filter(
            ${incFilterArgs.join(', ')}
        ))`);
    }

    const excFilterArgs = Object.keys(exc)
        // @ts-ignore
        .filter(prop => exc[prop]?.length)
        // @ts-ignore
        .map(prop => `${prop} => ${query.addVariable(exc[prop])}`);

    if (excFilterArgs.length) {
        query.addCondition(`NOT (listing.filter && create_atomicmarket_sales_filter(
            ${excFilterArgs.join(', ')}
        ))`);
    }
}

async function buildListingFilterV2(search: SalesSearchOptions): Promise<void> {
    const {values, query} = search;
    const args = await filterQueryArgs(values, {
        show_seller_contracts: {type: 'bool', default: true},
        contract_whitelist: {type: 'string[]', min: 1},

        maker_marketplace: {type: 'string[]', min: 1},
        taker_marketplace: {type: 'string[]', min: 1},
        marketplace: {type: 'string[]', min: 1},

        min_template_mint: {type: 'int', min: 1},
        max_template_mint: {type: 'int', min: 1}
    });

    if (!args.show_seller_contracts) {
        query.addCondition(`seller_contract IS DISTINCT FROM TRUE OR SUBSTR(listing.filter[2], 2) = ANY(${query.addVariable(args.contract_whitelist)})`);
    }

    if (args.marketplace.length) {
        const varName = query.addVariable(args.marketplace);
        query.addCondition('(listing.maker_marketplace = ANY (' + varName + ') OR listing.taker_marketplace = ANY (' + varName + ')) ');
    } else {
        if (args.maker_marketplace.length) {
            query.equalMany('listing.maker_marketplace', args.maker_marketplace);
        }

        if (args.taker_marketplace.length) {
            query.equalMany('listing.taker_marketplace', args.taker_marketplace);
        }
    }

    await buildTemplateMintFilter(values, query);
}

function getDataFilters(search: SalesSearchOptions): string[] {
    const {values, query} = search;

    const result = [];
    const keys = Object.keys(values);
    for (const key of keys) {
        const x = key.match(/^(template_|mutable_|immutable_)?data(:(?<type>text|number|bool))?\.(?<name>.+)$/);
        if (!x) {
            continue;
        }

        if (x.groups.name === 'name') {
            // name is stored in separate column
            query.equal('listing.asset_names', values[key]);
            search.strongFilters.push('name');

            continue;
        }

        switch (x.groups.type) {
            case 'number':
                result.push(`${x.groups.name}:${parseFloat(values[key])}`);
                break;
            case 'bool':
                result.push(`${x.groups.name}:${(values[key] === 'true' || values[key] === '1') ? 1 : 0}`);
                break;
            default:
                result.push(`${x.groups.name}:${values[key]}`);
        }
    }

    if (result.length) {
        search.strongFilters.push('data');
    }

    return result;
}

const largeSalesResult = 50_000;

const getSaleCount = moize({
    isPromise: true,
    maxAge: 1000 * 60 * 60 * 24,
    maxArgs: 3,
    maxSize: 1_000_000,
})(async (filter: string, value: string, saleState: number, search: SalesSearchOptions): Promise<number> => {
    const {rows} = await search.ctx.db.query(`
        SELECT COUNT(*)::INT ct
        FROM (
                SELECT
                FROM atomicmarket_sales_filters
                WHERE market_contract = $1
                    AND ((filter @> create_atomicmarket_sales_filter(${filter}s => $2)))
                    AND sale_state = $3
                LIMIT ${largeSalesResult + 1}
            ) filtered
            `, [search.ctx.coreArgs.atomicmarket_account, [value], saleState]);

    return rows[0].ct;
});

const FILTERS_REQUIRING_COUNTING = ['collection_name', 'template_id', 'schema_name'];
async function isStrongMainFilter(filter: string, values: string[], search: SalesSearchOptions): Promise<boolean> {
    if (!FILTERS_REQUIRING_COUNTING.includes(filter)) {
        return true;
    }

    const getTotalCount = async (): Promise<boolean> => {
        const saleStates = search.saleStates.length
            ? search.saleStates
            : [SaleApiState.LISTED, SaleApiState.SOLD];

        let expectedSalesCount = 0;
        for (const saleState of saleStates) {
            for (const value of values) {
                expectedSalesCount += await getSaleCount(filter, value, saleState, search);

                if (expectedSalesCount > largeSalesResult) {
                    return false;
                }
            }
        }

        return true;
    };

    const MAX_COUNT_TIME = 1_000;
    return limitExecutionTime(getTotalCount(), MAX_COUNT_TIME, false);
}

async function limitExecutionTime<T extends Promise<any>>(promise: T, maxTime: number, timeoutResult: Awaited<T>): Promise<Awaited<T>> {
    let timeoutId;
    const timeLimiter: Promise<Awaited<T>> = new Promise(resolve => timeoutId = setTimeout(() => resolve(timeoutResult), maxTime));

    const result = await Promise.race([promise, timeLimiter]);
    clearTimeout(timeoutId);

    return result;
}

async function getTemplateIDs(name: string | undefined, search: SalesSearchOptions, collectionNames: string[], schemaNames: string[], templateIds: string[]): Promise<number[]> {
    const query = new QueryBuilder(`
        SELECT template_id
        FROM atomicassets_templates    
    `);
    query.equal('contract', search.ctx.coreArgs.atomicassets_account);
    if (name !== undefined) {
        query.addCondition(`(immutable_data->>'name') %> ${query.addVariable(name)}`);
    }
    if (collectionNames.length) {
        query.equalMany('collection_name', collectionNames);
    }
    if (schemaNames.length) {
        query.equalMany('schema_name', schemaNames);
    }
    if (templateIds.length) {
        query.equalMany('template_id', templateIds);
    }

    const {rows} = await search.ctx.db.query(query.buildString(), query.buildValues());

    return rows.length ? rows.map(r => r.template_id) : [-1];
}

export async function getSalesTemplatesV2Action(params: RequestValues, ctx: AtomicMarketContext): Promise<any> {
    const maxLimit = ctx.coreArgs.limits?.sales_templates || 100;
    const args = await filterQueryArgs(params, {
        symbol: {type: 'string', min: 1},
        collection_whitelist: {type: 'list[]', min: 1},

        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: maxLimit, default: Math.min(maxLimit, 100)},
        sort: {
            type: 'string',
            allowedValues: ['template_id', 'price'],
            default: 'template_id'
        },
        order: {type: 'string', allowedValues: ['asc', 'desc'], default: 'desc'},
    });

    if (!args.symbol) {
        throw new ApiError('symbol parameter is required', 400);
    }

    if (!hasAssetFilter(params) && !args.collection_whitelist.length) {
        throw new ApiError('You need to specify an asset filter!', 400);
    }

    const query = new QueryBuilder(`
        SELECT DISTINCT ON (template_id, listing.assets_contract)
            listing.market_contract, listing.sale_id, listing.assets_contract, SUBSTRING(u.f FROM 2)::BIGINT template_id, listing.price
        FROM atomicmarket_sales_filters listing
            JOIN LATERAL UNNEST(filter) u(f) ON u.f LIKE 't%'
    `);

    query.equal('listing.market_contract', ctx.coreArgs.atomicmarket_account);
    query.equal('listing.asset_count', 1);

    const search: SalesSearchOptions = {
        values: params,
        ctx,
        query,
        strongFilters: [],
        saleStates: [SaleApiState.LISTED],
    };

    await buildSaleFilterV2(search);

    query.append('ORDER BY template_id NULLS LAST, listing.assets_contract, listing.price, listing.sale_id DESC');

    const sortColumnMapping: {[key: string]: string} = {
        price: 't1.price',
        template_id: 't1.template_id',
    };

    const outerQuery = new QueryBuilder(`SELECT * FROM (${query.buildString()}) t1`, query.buildValues());
    outerQuery.append(`ORDER BY ${sortColumnMapping[args.sort]} ${args.order} NULLS LAST, t1.template_id`);
    outerQuery.paginate(args.page, args.limit);

    const saleIds = await ctx.db.query(outerQuery.buildString(), outerQuery.buildValues());

    return await fillSalesIdRows(saleIds.rows, ctx);
}
