import { buildBoundaryFilter, RequestValues } from '../../utils';
import { AtomicAssetsContext } from '../index';
import QueryBuilder from '../../../builder';
import { buildAssetFilter, hasAssetFilter } from '../utils';
import { applyActionGreylistFilters, getContractActionLogs } from '../../../utils';
import { filterQueryArgs } from '../../validation';

export async function getRawOffersAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    const maxLimit = ctx.coreArgs.limits?.offers || 100;
    const args = filterQueryArgs(params, {
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: maxLimit, default: Math.min(maxLimit, 100)},
        sort: {type: 'string', allowedValues: ['created', 'updated'], default: 'created'},
        order: {type: 'string', allowedValues: ['asc', 'desc'], default: 'desc'},

        account: {type: 'string', min: 1},
        sender: {type: 'string', min: 1},
        recipient: {type: 'string', min: 1},
        state: {type: 'string', min: 1},
        memo: {type: 'string', min: 1},
        match_memo: {type: 'string', min: 1},

        asset_id: {type: 'string', min: 1},

        recipient_asset_blacklist: {type: 'string', min: 1},
        recipient_asset_whitelist: {type: 'string', min: 1},
        sender_asset_blacklist: {type: 'string', min: 1},
        sender_asset_whitelist: {type: 'string', min: 1},
        account_whitelist: {type: 'string', min: 1},
        account_blacklist: {type: 'string', min: 1},
        collection_blacklist: {type: 'string', min: 1},
        collection_whitelist: {type: 'string', min: 1},

        is_recipient_contract: {type: 'bool'},

        hide_contracts: {type: 'bool'},
        hide_empty_offers: {type: 'bool'},

        count: {type: 'bool'}
    });

    const query = new QueryBuilder('SELECT contract, offer_id FROM atomicassets_offers offer');

    query.equal('contract', ctx.coreArgs.atomicassets_account);

    if (args.account) {
        const varName = query.addVariable(args.account.split(','));
        query.addCondition('(sender = ANY (' + varName + ') OR recipient = ANY (' + varName + '))');
    }

    if (args.sender) {
        query.equalMany('sender', args.sender.split(','));
    }

    if (args.recipient) {
        query.equalMany('recipient', args.recipient.split(','));
    }

    if (args.state) {
        query.equalMany('state', args.state.split(','));
    }

    if (args.memo) {
        query.equal('memo', args.memo);
    }

    if (args.match_memo) {
        query.addCondition(
            'memo ILIKE ' + query.addVariable('%' + args.match_memo.replace('%', '\\%').replace('_', '\\_') + '%')
        );
    }

    if (args.is_recipient_contract === true) {
        query.addCondition('EXISTS(SELECT * FROM contract_codes WHERE account = offer.recipient)');
    } else if (args.is_recipient_contract === false) {
        query.addCondition('NOT EXISTS(SELECT * FROM contract_codes WHERE account = offer.recipient)');
    }

    if (args.hide_contracts) {
        query.addCondition(
            'NOT EXISTS(SELECT * FROM contract_codes ' +
            'WHERE (account = offer.recipient OR account = offer.sender) AND NOT (account = ANY(' +
            query.addVariable([args.account, args.sender, args.recipient].filter(row => !!row)) +
            ')))'
        );
    }

    if (args.hide_empty_offers) {
        query.addCondition(
            'EXISTS(SELECT * FROM atomicassets_offers_assets asset ' +
            'WHERE asset.contract = offer.contract AND asset.offer_id = offer.offer_id AND asset.owner = offer.sender)'
        );

        query.addCondition(
            'EXISTS(SELECT * FROM atomicassets_offers_assets asset ' +
            'WHERE asset.contract = offer.contract AND asset.offer_id = offer.offer_id AND asset.owner = offer.recipient)'
        );
    }

    if (hasAssetFilter(params, ['asset_id'])) {
        const assetQuery = new QueryBuilder('SELECT * FROM atomicassets_offers_assets offer_asset, atomicassets_assets asset', query.buildValues());

        assetQuery.join('asset', 'offer_asset', ['contract', 'asset_id']);
        assetQuery.join('offer_asset', 'offer', ['contract', 'offer_id']);

        buildAssetFilter(params, assetQuery, {assetTable: '"asset"', allowDataFilter: false});

        query.addCondition('EXISTS(' + assetQuery.buildString() + ')');
        query.setVars(assetQuery.buildValues());
    }

    if (args.asset_id) {
        query.addCondition(
            'EXISTS(' +
            'SELECT * FROM atomicassets_offers_assets asset ' +
            'WHERE offer.contract = asset.contract AND offer.offer_id = asset.offer_id AND ' +
            'asset_id = ANY (' + query.addVariable(args.asset_id.split(',')) + ')' +
            ')'
        );
    }

    if (args.collection_blacklist) {
        query.addCondition(
            'NOT EXISTS(' +
            'SELECT * FROM atomicassets_offers_assets offer_asset, atomicassets_assets asset ' +
            'WHERE offer_asset.contract = offer.contract AND offer_asset.offer_id = offer.offer_id AND ' +
            'offer_asset.contract = asset.contract AND offer_asset.asset_id = asset.asset_id AND ' +
            'asset.collection_name = ANY (' + query.addVariable(args.collection_blacklist.split(',')) + ')' +
            ')'
        );
    }

    if (args.collection_whitelist) {
        query.addCondition(
            'NOT EXISTS(' +
            'SELECT * FROM atomicassets_offers_assets offer_asset, atomicassets_assets asset ' +
            'WHERE offer_asset.contract = offer.contract AND offer_asset.offer_id = offer.offer_id AND ' +
            'offer_asset.contract = asset.contract AND offer_asset.asset_id = asset.asset_id AND ' +
            'NOT (asset.collection_name = ANY (' + query.addVariable(args.collection_whitelist.split(',')) + '))' +
            ')'
        );
    }

    if (args.account_blacklist) {
        const varName = query.addVariable(args.account_blacklist.split(','));
        query.addCondition('NOT (offer.sender = ANY(' + varName + ') OR offer.recipient = ANY(' + varName + '))');
    }

    if (args.account_whitelist) {
        const varName = query.addVariable(args.account_whitelist.split(','));
        query.addCondition('(offer.sender = ANY(' + varName + ') OR offer.recipient = ANY(' + varName + '))');
    }

    if (args.recipient_asset_blacklist) {
        query.addCondition(
            'NOT EXISTS(' +
            'SELECT * FROM atomicassets_offers_assets offer_asset ' +
            'WHERE offer_asset.contract = offer.contract AND offer_asset.offer_id = offer.offer_id AND ' +
            'offer_asset.owner = offer.recipient AND offer_asset.asset_id = ANY (' + query.addVariable(args.recipient_asset_blacklist.split(',')) + ')' +
            ')'
        );
    }

    if (args.recipient_asset_whitelist) {
        query.addCondition(
            'NOT EXISTS(' +
            'SELECT * FROM atomicassets_offers_assets offer_asset ' +
            'WHERE offer_asset.contract = offer.contract AND offer_asset.offer_id = offer.offer_id AND ' +
            'offer_asset.owner = offer.recipient AND NOT (offer_asset.asset_id = ANY (' + query.addVariable(args.recipient_asset_whitelist.split(',')) + '))' +
            ')'
        );
    }

    if (args.sender_asset_blacklist) {
        query.addCondition(
            'NOT EXISTS(' +
            'SELECT * FROM atomicassets_offers_assets offer_asset ' +
            'WHERE offer_asset.contract = offer.contract AND offer_asset.offer_id = offer.offer_id AND ' +
            'offer_asset.owner = offer.sender AND offer_asset.asset_id = ANY (' + query.addVariable(args.sender_asset_blacklist.split(',')) + ')' +
            ')'
        );
    }

    if (args.sender_asset_whitelist) {
        query.addCondition(
            'NOT EXISTS(' +
            'SELECT * FROM atomicassets_offers_assets offer_asset ' +
            'WHERE offer_asset.contract = offer.contract AND offer_asset.offer_id = offer.offer_id AND ' +
            'offer_asset.owner = offer.sender AND NOT (offer_asset.asset_id = ANY (' + query.addVariable(args.sender_asset_whitelist.split(',')) + '))' +
            ')'
        );
    }

    buildBoundaryFilter(
        params, query, 'offer_id', 'int',
        args.sort === 'updated' ? 'updated_at_time' : 'created_at_time'
    );

    const sortColumnMapping: {[key: string]: string} = {
        created: 'created_at_time',
        updated: 'updated_at_time'
    };

    if (args.count) {
        const countQuery = await ctx.db.query(
            'SELECT COUNT(*) counter FROM (' + query.buildString() + ') x',
            query.buildValues()
        );

        return countQuery.rows[0].counter;
    }

    query.append('ORDER BY ' + sortColumnMapping[args.sort] + ' ' + args.order + ', offer_id ASC');
    query.paginate(args.page, args.limit);

    return await ctx.db.query(query.buildString(), query.buildValues());
}

export async function getOffersCountAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    return getRawOffersAction({...params, count: 'true'}, ctx);
}

export async function getOfferLogsCountAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    const maxLimit = ctx.coreArgs.limits?.logs || 100;
    const args = filterQueryArgs(params, {
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: maxLimit, default: Math.min(maxLimit, 100)},
        order: {type: 'string', allowedValues: ['asc', 'desc'], default: 'asc'}
    });

    return await getContractActionLogs(
        ctx.db, ctx.coreArgs.atomicassets_account,
        applyActionGreylistFilters(['lognewoffer', 'acceptoffer', 'declineoffer', 'canceloffer'], args),
        {offer_id: ctx.pathParams.offer_id},
        (args.page - 1) * args.limit, args.limit, args.order
    );
}
