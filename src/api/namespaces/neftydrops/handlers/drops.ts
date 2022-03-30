import {buildBoundaryFilter, RequestValues} from '../../utils';
import {filterQueryArgs} from '../../validation';
import {NeftyDropsContext} from '../index';
import QueryBuilder from '../../../builder';
import {buildDropFilter} from '../utils';
import {buildGreylistFilter} from '../../atomicassets/utils';
import {fillDrops} from '../filler';
import {formatClaim, formatDrop} from '../format';
import {ApiError} from '../../../error';

export async function getDropsAction(params: RequestValues, ctx: NeftyDropsContext): Promise<any> {
    const args = filterQueryArgs(params, {
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: 100, default: 100},
        collection_name: {type: 'string', min: 1},
        sort: {
            type: 'string',
            allowedValues: [
                'created', 'updated', 'drop_id', 'price',
                'start_time', 'end_time',
            ],
            default: 'created'
        },
        order: {type: 'string', allowedValues: ['asc', 'desc'], default: 'desc'},
        count: {type: 'bool'}
    });

    const query = new QueryBuilder(`
                SELECT ndrop.drop_id 
                FROM neftydrops_drops ndrop 
                    LEFT JOIN neftydrops_drop_prices price ON (price.drops_contract = ndrop.drops_contract AND price.drop_id = ndrop.drop_id)
            `);

    buildDropFilter(params, query);

    if (!args.collection_name) {
        buildGreylistFilter(params, query, {collectionName: 'ndrop.collection_name'});
    }

    let dateColumn = 'ndrop.created_at_time';
    if (args.sort === 'updated') {
        dateColumn = 'ndrop.updated_at_time';
    } else if (args.sort === 'start_time') {
        dateColumn = 'ndrop.start_time';
    } else if (args.sort === 'end_time') {
        dateColumn = 'ndrop.end_time';
    }

    buildBoundaryFilter(
        params, query, 'ndrop.drop_id', 'int',
        dateColumn
    );

    if (args.count) {
        const countQuery = await ctx.db.query(
            'SELECT COUNT(*) counter FROM (' + query.buildString() + ') x',
            query.buildValues()
        );

        return countQuery.rows[0].counter;
    }

    const sortMapping: {[key: string]: {column: string, nullable: boolean}}  = {
        drop_id: {column: 'ndrop.drop_id', nullable: false},
        created: {column: 'ndrop.created_at_time', nullable: false},
        updated: {column: 'ndrop.updated_at_time', nullable: false},
        start_time: {column: 'ndrop.start_time', nullable: false},
        end_time: {column: 'ndrop.end_time', nullable: false},
        price: {column: 'price.price', nullable: true}
    };

    query.append('ORDER BY ' + sortMapping[args.sort].column + ' ' + args.order + ' ' + (sortMapping[args.sort].nullable ? 'NULLS LAST' : ''));
    query.append('LIMIT ' + query.addVariable(args.limit) + ' OFFSET ' + query.addVariable((args.page - 1) * args.limit));

    const dropQuery = await ctx.db.query(query.buildString(), query.buildValues());

    const result = await ctx.db.query(
        'SELECT * FROM neftydrops_drops_master WHERE drops_contract = $1 AND drop_id = ANY ($2)',
        [ctx.coreArgs.neftydrops_account, dropQuery.rows.map(row => row.drop_id)]
    );

    const dropLookup: {[key: string]: any} = {};
    result.rows.reduce((prev, current) => {
        prev[String(current.drop_id)] = current;
        return prev;
    }, dropLookup);

    return fillDrops(
        ctx.db,
        ctx.coreArgs.atomicassets_account,
        dropQuery.rows.map((row) => formatDrop(dropLookup[String(row.drop_id)])).filter(x => !!x)
    );
}

export async function getDropsCountAction(params: RequestValues, ctx: NeftyDropsContext): Promise<any> {
    return getDropsAction({...params, count: 'true'}, ctx);
}

export async function getDropAction(params: RequestValues, ctx: NeftyDropsContext): Promise<any> {
    const query = await ctx.db.query(
        'SELECT * FROM neftydrops_drops_master WHERE drops_contract = $1 AND drop_id = $2',
        [ctx.coreArgs.neftydrops_account, ctx.pathParams.drop_id]
    );

    if (query.rowCount === 0) {
        throw new ApiError('Drop not found', 416);
    } else {
        const drops = await fillDrops(
            ctx.db, ctx.coreArgs.atomicassets_account, query.rows.map((row) => formatDrop(row))
        );
        return drops[0];
    }
}

export async function getDropClaimsAction(params: RequestValues, ctx: NeftyDropsContext): Promise<any> {
    const args = filterQueryArgs(params, {
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: 100, default: 100},
        sort: {
            type: 'string',
            allowedValues: [
                'claim_time', 'created_at_time', 'price', 'total_price',
                'amount', 'claimer',
            ],
            default: 'claim_time'
        },
        order: {type: 'string', allowedValues: ['asc', 'desc'], default: 'asc'},
        count: {type: 'bool'}
    });

    const query = new QueryBuilder(
        'SELECT claim_id FROM neftydrops_claims WHERE drops_contract = $1 AND drop_id = $2',
        [ctx.coreArgs.neftydrops_account, ctx.pathParams.drop_id]
    );

    if (args.count) {
        const countQuery = await ctx.db.query(
            'SELECT COUNT(*) counter FROM (' + query.buildString() + ') x',
            query.buildValues()
        );

        return countQuery.rows[0].counter;
    }

    const sortMapping: {[key: string]: {column: string, nullable: boolean}}  = {
        claim_time: {column: 'created_at_time', nullable: false},
        created_at_time: {column: 'created_at_time', nullable: false},
        price: {column: 'final_price', nullable: false},
        total_price: {column: 'total_price', nullable: false},
        amount: {column: 'amount', nullable: false},
        claimer: {column: 'claimer', nullable: false},
    };

    query.append('ORDER BY ' + sortMapping[args.sort].column + ' ' + args.order + ' ' + (sortMapping[args.sort].nullable ? 'NULLS LAST' : ''));
    query.append('LIMIT ' + query.addVariable(args.limit) + ' OFFSET ' + query.addVariable((args.page - 1) * args.limit));

    const claimsQuery = await ctx.db.query(query.buildString(), query.buildValues());
    const result = await ctx.db.query(
        'SELECT * FROM neftydrops_claims_master WHERE drops_contract = $1 AND claim_id = ANY ($2)',
        [ctx.coreArgs.neftydrops_account, claimsQuery.rows.map(row => row.claim_id)]
    );

    const claimLookup: {[key: string]: any} = {};
    result.rows.reduce((prev: any, current: any) => {
        prev[String(current.claim_id)] = current;
        return prev;
    }, claimLookup);

    return claimsQuery.rows.map((row) => formatClaim(claimLookup[row.claim_id]));
}

export async function getDropClaimsCountAction(params: RequestValues, ctx: NeftyDropsContext): Promise<any> {
    return getDropClaimsAction({...params, count: 'true'}, ctx);
}
