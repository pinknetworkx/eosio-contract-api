import { buildBoundaryFilter, filterQueryArgs, FilterValues, RequestValues } from '../../utils';
import { AtomicMarketContext } from '../index';
import QueryBuilder from '../../../builder';
import { fillSales } from '../filler';
import { formatSale } from '../format';
import { ApiError } from '../../../error';

type SalesSearchOptions = {
    values: FilterValues;
    ctx: AtomicMarketContext;
    query: QueryBuilder;
    strongFilters: string[];
}

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

    const search: SalesSearchOptions = {
        values: params,
        ctx,
        query,
        strongFilters: [],
    };

    await buildSaleFilterV2(search);

    buildBoundaryFilter(
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

    const sortMapping: { [key: string]: { column: string, numericIndex: boolean } } = {
        sale_id: {column: 'listing.sale_id', numericIndex: true},
        created: {column: 'listing.created_at_time', numericIndex: true},
        updated: {column: 'listing.updated_at_time', numericIndex: true},
        price: {column: 'listing.price', numericIndex: false},
        template_mint: {column: 'LOWER(listing.template_mint)', numericIndex: false}
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

    const preventIndexUsage = search.strongFilters.length > 0;

    query.append(`ORDER BY ${sortMapping[args.sort].column}${preventIndexUsage ? ' + 0' : ''} ${args.order}, listing.sale_id ASC`);
    query.paginate(args.page, args.limit);
    const saleQuery = await ctx.db.query(query.buildString(), query.buildValues());

    const result = await ctx.db.query(`
            SELECT * FROM atomicmarket_sales_master m
                JOIN UNNEST($2::BIGINT[]) WITH ORDINALITY AS f(sale_id) ON m.sale_id = f.sale_id
            WHERE market_contract = $1
                AND m.sale_id = ANY($2::BIGINT[])
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

async function buildSaleFilterV2(search: SalesSearchOptions): Promise<void> {
    const {values, query, ctx} = search;
    const args = filterQueryArgs(values, {
        state: {type: 'string[]', min: 1, default: []},

        max_assets: {type: 'int', min: 1},
        min_assets: {type: 'int', min: 1},

        symbol: {type: 'string', min: 1},
        min_price: {type: 'float', min: 0},
        max_price: {type: 'float', min: 0}
    });

    buildMainFilterV2(search);
    buildListingFilterV2(search);

    buildAssetFilterV2(search);

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
            search.strongFilters.push('price');
        }

        if (args.max_price) {
            query.addCondition(`listing.price <= 1.0 * ${query.addVariable(args.max_price)} * POWER(10, ${query.addVariable(token_precision)})`);
            search.strongFilters.push('price');
        }
    } else if (args.min_price || args.max_price) {
        throw new ApiError('Price range filters require the "symbol" filter');
    }

    if (args.state.length) {
        query.equalMany('listing.sale_state', args.state.map((state: string) => parseInt(state, 10)));
    }
}

function buildAssetFilterV2(search: SalesSearchOptions): void {
    const {values, query} = search;

    const args = filterQueryArgs(values, {
        asset_id: {type: 'string[]', min: 1},
    });

    if (args.asset_id) {
        query.addCondition(`listing.asset_ids && ${query.addVariable(args.asset_id)}`);
        search.strongFilters.push('asset_ids');
    }

    const names = [values.match_immutable_name, values.match_mutable_name, values.match].filter(v => typeof v === 'string' && v.length);
    for (const name of names) {
        query.addCondition(
            'listing.asset_names ILIKE ' +
            query.addVariable('%' + name.replace('%', '\\%').replace('_', '\\_') + '%')
        );
        search.strongFilters.push('name');
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

function buildMainFilterV2(search: SalesSearchOptions): void {
    const {values, query} = search;
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

    function addIncArrayFilter(filter: string, isStrongFilter: boolean = false, value: any = undefined): void {
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
                inc[filter+'s'].push(args[filter]);
            }

            if (isStrongFilter && value.length <= 50) {
                search.strongFilters.push(filter);
            }
        }
    }

    addIncArrayFilter('owner', true);
    addIncArrayFilter('collection_name', true);
    addIncArrayFilter('collection_name', true, args.collection_whitelist);

    if (args.account) {
        query.addCondition(`(listing.filter && create_atomicmarket_sales_filter(sellers := ${query.addVariable(args.account)}, buyers := ${query.addVariable(args.account)}))`);
        search.strongFilters.push('account');
    }

    addIncArrayFilter('seller', true);
    addIncArrayFilter('buyer', true);

    addIncArrayFilter('schema_name', true);

    if (args.template_id.find((s: string) => s.toLowerCase() === 'null')) {
        inc.flags.push(SALE_FILTER_FLAG_NO_TEMPLATE);
    } else {
        addIncArrayFilter('template_id', true);
    }

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

    if (args.seller_blacklist) {
        exc.sellers.push(...args.seller_blacklist);
    }

    if (args.buyer_blacklist) {
        exc.buyers.push(...args.buyer_blacklist);
    }

    if (args.collection_blacklist) {
        exc.collection_names.push(...args.collection_blacklist);
    }

    inc.data = getDataFilters(search);


    if (inc.collection_names.length && exc.collection_names.length) {
        inc.collection_names = inc.collection_names.filter(c => !exc.collection_names.includes(c));
        if (!inc.collection_names.length) {
            inc.collection_names.push('\nDOES_NOT_EXIST\n');
        }
        exc.collection_names.length = 0;
    }

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

function buildListingFilterV2(search: SalesSearchOptions): void {
    const {values, query} = search;
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
            'WHERE code.account = SUBSTR(listing.filter[2], 2) AND code.account != ALL(' + query.addVariable(args.contract_whitelist) + ')' +
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

function getDataFilters(search: SalesSearchOptions): string[] {
    const {values, query} = search;

    const result = [];
    const keys = Object.keys(values);
    for (const key of keys) {
        const x = key.match(/^(template_|mutable_|immutable_)?data(:(?<type>text|number|bool))?\.(?<name>.+)$/);
        if (!x) {
            continue;
        }

        if (x.groups.name) {
            // name is not stored in data
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
