import { buildBoundaryFilter, RequestValues } from '../../utils';
import { AtomicAssetsContext } from '../index';
import QueryBuilder from '../../../builder';
import { buildAssetFilter, hasAssetFilter } from '../utils';
import { filterQueryArgs } from '../../validation';

export async function getRawTransfersAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    const maxLimit = ctx.coreArgs.limits?.transfers || 100;
    const args = filterQueryArgs(params, {
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: maxLimit, default: Math.min(maxLimit, 100)},
        sort: {type: 'string', allowedValues: ['created'], default: 'created'},
        order: {type: 'string', allowedValues: ['asc', 'desc'], default: 'desc'},

        asset_id: {type: 'string', min: 1},

        collection_blacklist: {type: 'string', min: 1},
        collection_whitelist: {type: 'string', min: 1},

        account: {type: 'string', min: 1},
        sender: {type: 'string', min: 1},
        recipient: {type: 'string', min: 1},
        memo: {type: 'string', min: 1},
        match_memo: {type: 'string', min: 1},

        hide_contracts: {type: 'bool'},

        count: {type: 'bool'}
    });

    const query = new QueryBuilder('SELECT * FROM atomicassets_transfers_master transfer'); // TODO was ' + this.transferView + '
    query.equal('contract', ctx.coreArgs.atomicassets_account);

    if (args.account) {
        const varName = query.addVariable(args.account.split(','));
        query.addCondition('(sender_name = ANY (' + varName + ') OR recipient_name = ANY (' + varName + '))');
    }

    if (args.sender) {
        query.equalMany('sender_name', args.sender.split(','));
    }

    if (args.recipient) {
        query.equalMany('recipient_name', args.recipient.split(','));
    }

    if (args.memo) {
        query.equal('memo', args.memo);
    }

    if (args.match_memo) {
        query.addCondition(
            'memo ILIKE ' + query.addVariable('%' + args.match_memo.replace('%', '\\%').replace('_', '\\_') + '%')
        );
    }

    if (hasAssetFilter(params, ['asset_id'])) {
        const assetQuery = new QueryBuilder('SELECT * FROM atomicassets_transfers_assets transfer_asset, atomicassets_assets asset', query.buildValues());

        assetQuery.join('asset', 'transfer_asset', ['contract', 'asset_id']);
        assetQuery.join('transfer_asset', 'transfer', ['contract', 'transfer_id']);

        buildAssetFilter(params, assetQuery, {assetTable: '"asset"', allowDataFilter: false});

        query.addCondition('EXISTS(' + assetQuery.buildString() + ')');
        query.setVars(assetQuery.buildValues());
    }

    if (args.asset_id) {
        query.addCondition(
            'EXISTS(' +
            'SELECT * FROM atomicassets_transfers_assets asset ' +
            'WHERE transfer.contract = asset.contract AND transfer.transfer_id = asset.transfer_id AND ' +
            'asset_id = ANY (' + query.addVariable(args.asset_id.split(',')) + ')' +
            ') '
        );
    }

    if (args.collection_blacklist) {
        query.addCondition(
            'NOT EXISTS(' +
            'SELECT * FROM atomicassets_transfers_assets transfer_asset, atomicassets_assets asset ' +
            'WHERE transfer_asset.contract = transfer.contract AND transfer_asset.transfer_id = transfer.transfer_id AND ' +
            'transfer_asset.contract = asset.contract AND transfer_asset.asset_id = asset.asset_id AND ' +
            'asset.collection_name = ANY (' + query.addVariable(args.collection_blacklist.split(',')) + ')' +
            ') '
        );
    }

    if (args.collection_whitelist) {
        query.addCondition(
            'NOT EXISTS(' +
            'SELECT * FROM atomicassets_transfers_assets transfer_asset, atomicassets_assets asset ' +
            'WHERE transfer_asset.contract = transfer.contract AND transfer_asset.transfer_id = transfer.transfer_id AND ' +
            'transfer_asset.contract = asset.contract AND transfer_asset.asset_id = asset.asset_id AND ' +
            'NOT (asset.collection_name = ANY (' + query.addVariable(args.collection_whitelist.split(',')) + '))' +
            ')'
        );
    }

    if (args.hide_contracts) {
        query.addCondition(
            'NOT EXISTS(SELECT * FROM contract_codes ' +
            'WHERE (account = transfer.recipient_name OR account = transfer.sender_name) AND NOT (account = ANY(' +
            query.addVariable([args.account, args.sender, args.recipient].filter(row => !!row)) +
            ')))'
        );
    }

    buildBoundaryFilter(params, query, 'transfer_id', 'int', 'created_at_time');

    if (args.count) {
        const countQuery = await ctx.db.query(
            'SELECT COUNT(*) counter FROM (' + query.buildString() + ') x',
            query.buildValues()
        );

        return countQuery.rows[0].counter;
    }

    const sortColumnMapping: { [key: string]: string } = {
        created: 'transfer_id'
    };

    query.append('ORDER BY ' + sortColumnMapping[args.sort] + ' ' + args.order);
    query.paginate(args.page, args.limit);

    return await ctx.db.query(query.buildString(), query.buildValues());
}

export async function getTransfersCountAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    return getRawTransfersAction({...params, count: 'true'}, ctx);
}
