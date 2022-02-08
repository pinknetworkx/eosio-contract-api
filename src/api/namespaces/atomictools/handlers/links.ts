import { buildBoundaryFilter, RequestValues } from '../../utils';
import { AtomicToolsContext } from '../index';
import QueryBuilder from '../../../builder';
import { Numeric } from 'eosjs';
import { fillLinks } from '../filler';
import { formatLink } from '../format';
import { ApiError } from '../../../error';
import { applyActionGreylistFilters, getContractActionLogs } from '../../../utils';
import { filterQueryArgs } from '../../validation';

export async function getLinksAction(params: RequestValues, ctx: AtomicToolsContext): Promise<any> {
    const maxLimit = ctx.coreArgs.limits?.links || 100;
    const args = filterQueryArgs(params, {
        creator: {type: 'string', min: 1},
        claimer: {type: 'string', min: 1},
        public_key: {type: 'string', min: 1},
        state: {type: 'string'},

        collection_blacklist: {type: 'string', min: 1},
        collection_whitelist: {type: 'string', min: 1},

        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: maxLimit, default: Math.min(maxLimit, 100)},
        sort: {type: 'string', allowedValues: ['created'], default: 'created'},
        order: {type: 'string', allowedValues: ['asc', 'desc'], default: 'desc'},

        count: {type: 'bool'}
    });

    const query = new QueryBuilder('SELECT * FROM atomictools_links_master link');

    query.equal('tools_contract', ctx.coreArgs.atomictools_account);

    if (args.creator) {
        query.equalMany('creator', args.creator.split(','));
    }

    if (args.claimer) {
        query.equalMany('claimer', args.claimer.split(','));
    }

    if (args.public_key) {
        const key = Numeric.stringToPublicKey(args.public_key);

        query.equal('key_type', key.type.valueOf());
        query.equal('key_data', key.data);
    }

    if (args.state) {
        query.equalMany('state', args.state.split(','));
    }

    if (args.collection_blacklist) {
        query.addCondition(
            'NOT EXISTS(' +
            'SELECT * FROM atomictools_links_assets asset_l, atomicassets_assets asset_a ' +
            'WHERE asset_l.tools_contract = link.tools_contract AND asset_l.link_id = link.link_id AND ' +
            'asset_l.assets_contract = asset_a.contract AND asset_l.asset_id = asset_a.asset_id AND ' +
            'asset_a.collection_name = ANY (' + query.addVariable(args.collection_blacklist.split(',')) + ')' +
            ')'
        );
    }

    if (args.collection_whitelist) {
        query.addCondition(
            'NOT EXISTS(' +
            'SELECT * FROM atomictools_links_assets asset_l, atomicassets_assets asset_a ' +
            'WHERE asset_l.tools_contract = link.tools_contract AND asset_l.link_id = link.link_id AND ' +
            'asset_l.assets_contract = asset_a.contract AND asset_l.asset_id = asset_a.asset_id AND ' +
            'NOT (asset_a.collection_name = ANY (' + query.addVariable(args.collection_whitelist.split(',')) + '))' +
            ') '
        );
    }

    buildBoundaryFilter(
        params, query, 'link_id', 'int',
        args.sort === 'updated' ? 'updated_at_time' : 'created_at_time'
    );

    if (args.count) {
        const countQuery = await ctx.db.query(
            'SELECT COUNT(*) counter FROM (' + query.buildString() + ') x',
            query.buildValues()
        );

        return countQuery.rows[0].counter;
    }

    const sortColumnMapping: {[key: string]: string} = {
        created: 'link_id',
        updated: 'updated_at_time'
    };

    query.append('ORDER BY ' + sortColumnMapping[args.sort] + ' ' + args.order + ', link_id ASC');
    query.paginate(args.page, args.limit);

    const result = await ctx.db.query(query.buildString(), query.buildValues());

    return await fillLinks(
        ctx.db, ctx.coreArgs.atomicassets_account, result.rows.map(formatLink)
    );
}

export async function getLinksCountAction(params: RequestValues, ctx: AtomicToolsContext): Promise<any> {
    return getLinksAction({...params, count: 'true'}, ctx);
}

export async function getLinkAction(params: RequestValues, ctx: AtomicToolsContext): Promise<any> {
    const query = await ctx.db.query(
        'SELECT * FROM atomictools_links_master WHERE tools_contract = $1 AND link_id = $2',
        [ctx.coreArgs.atomictools_account, ctx.pathParams.link_id]
    );

    if (query.rowCount === 0) {
        throw new ApiError('Link not found', 416);
    }

    const links = await fillLinks(
        ctx.db, ctx.coreArgs.atomicassets_account, query.rows.map(formatLink)
    );

    return links[0];
}

export async function getLinkLogsAction(params: RequestValues, ctx: AtomicToolsContext): Promise<any> {
    const maxLimit = ctx.coreArgs.limits?.logs || 100;
    const args = filterQueryArgs(params, {
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: maxLimit, default: Math.min(maxLimit, 100)},
        order: {type: 'string', allowedValues: ['asc', 'desc'], default: 'asc'}
    });

    return await getContractActionLogs(
        ctx.db, ctx.coreArgs.atomictools_account,
        applyActionGreylistFilters(['lognewlink', 'loglinkstart', 'cancellink', 'claimlink'], args),
        {link_id: ctx.pathParams.link_id},
        (args.page - 1) * args.limit, args.limit, args.order
    );
}
