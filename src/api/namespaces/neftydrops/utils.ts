import * as express from 'express';

import {filterQueryArgs, mergeRequestData} from '../utils';
import {
    buildDataConditions,
    hasDataFilters
} from '../atomicassets/utils';
import QueryBuilder from '../../builder';
import {DropState} from '../../../filler/handlers/neftydrops';
import {DropApiState} from './index';

export function hasTemplateFilter(req: express.Request, blacklist: string[] = []): boolean {
    const keys = Object.keys(mergeRequestData(req));

    for (const key of keys) {
        if (
            ['template_id', 'schema_name', 'is_transferable', 'is_burnable'].indexOf(key) >= 0 &&
            blacklist.indexOf(key) === -1
        ) {
            return true;
        }
    }

    return false;
}

export function buildTemplateFilter(
    req: express.Request, query: QueryBuilder,
    options: {templateTable?: string, allowDataFilter?: boolean} = {}
): void {
    options = Object.assign({allowDataFilter: true}, options);

    const args = filterQueryArgs(req, {
        template_id: {type: 'string', min: 1},
        schema_name: {type: 'string', min: 1},
        is_transferable: {type: 'bool'},
        is_burnable: {type: 'bool'}
    });

    if (options.allowDataFilter !== false) {
        buildDataConditions(req, query, {assetTable: null, templateTable: options.templateTable});
    }

    if (args.template_id) {
        query.equalMany(options.templateTable + '.template_id', args.template_id.split(','));
    }

    if (args.schema_name) {
        query.equalMany(options.templateTable + '.schema_name', args.schema_name.split(','));
    }

    if (options.templateTable && typeof args.is_transferable === 'boolean') {
        if (args.is_transferable) {
            query.addCondition(options.templateTable + '.transferable IS DISTINCT FROM FALSE');
        } else {
            query.addCondition(options.templateTable + '.transferable = FALSE');
        }
    }

    if (options.templateTable && typeof args.is_burnable === 'boolean') {
        if (args.is_burnable) {
            query.addCondition(options.templateTable + '.burnable IS DISTINCT FROM FALSE');
        } else {
            query.addCondition(options.templateTable + '.burnable = FALSE');
        }
    }
}

export function buildListingFilter(req: express.Request, query: QueryBuilder): void {
    const args = filterQueryArgs(req, {
        collection_name: {type: 'string', min: 1},
    });

    if (args.collection_name) {
        query.equalMany('ndrop.collection_name', args.collection_name.split(','));
    }
}

export function buildDropFilter(req: express.Request, query: QueryBuilder): void {
    const args = filterQueryArgs(req, {
        state: {type: 'string', min: 0},

        max_assets: {type: 'int', min: 1},
        min_assets: {type: 'int', min: 1},

        symbol: {type: 'string', min: 1},
        min_price: {type: 'float', min: 0},
        max_price: {type: 'float', min: 0},

        collection_name: {type: 'string', min: 1},
    });

    buildListingFilter(req, query);

    if (hasTemplateFilter(req) || hasDataFilters(req)) {
        const assetQuery = new QueryBuilder(
            'SELECT * FROM neftydrops_drop_assets drop_asset ' +
            'LEFT JOIN atomicassets_templates "template" ON (drop_asset.assets_contract = "template".contract AND drop_asset.template_id = "template".template_id)',
            query.buildValues()
        );

        assetQuery.addCondition('drop_asset.drop_id = ndrop.drop_id');
        buildTemplateFilter(req, assetQuery, {templateTable: '"template"', allowDataFilter: true});

        query.addCondition('EXISTS(' + assetQuery.buildString() + ')');
        query.setVars(assetQuery.buildValues());
    }

    if (args.max_assets) {
        query.addCondition(
            `(
                SELECT COUNT(*) FROM (
                    SELECT FROM neftydrops_drop_assets asset
                    WHERE asset.assets_contract = ndrop.assets_contract AND asset.drop_id = ndrop.drop_id LIMIT ${args.max_assets + 1}
                ) ct        
            ) <= ${args.max_assets} `
        );
    }

    if (args.min_assets) {
        query.addCondition(
            `(
                SELECT COUNT(*) FROM (
                    SELECT FROM neftydrops_drop_assets asset
                    WHERE asset.assets_contract = ndrop.assets_contract AND asset.drop_id = ndrop.drop_id LIMIT ${args.min_assets}
                ) ct        
            ) >= ${args.min_assets} `
        );
    }

    if (args.symbol) {
        query.equal('ndrop.settlement_symbol', args.symbol);

        if (args.min_price) {
            query.addCondition('price.price > 0 AND price.price >= 1.0 * ' + query.addVariable(args.min_price) + ' * POWER(10, price.settlement_precision)');
        }

        if (args.max_price) {
            query.addCondition('price.price <= 1.0 * ' + query.addVariable(args.max_price) + ' * POWER(10, price.settlement_precision)');
        }
    }

    if (args.collection_name) {
        query.equalMany('ndrop.collection_name', args.collection_name.split(','));
    }

    if (args.state) {
        const stateFilters: string[] = [];
        if (args.state.split(',').indexOf(String(DropApiState.ACTIVE.valueOf())) >= 0) {
            stateFilters.push(`(ndrop.state = ${DropState.ACTIVE.valueOf()})`);
        }
        if (args.state.split(',').indexOf(String(DropApiState.DELETED.valueOf())) >= 0) {
            stateFilters.push(`(ndrop.state = ${DropState.DELETED.valueOf()})`);
        }
        if (args.state.split(',').indexOf(String(DropApiState.HIDDEN.valueOf())) >= 0) {
            stateFilters.push(`(ndrop.state = ${DropState.HIDDEN.valueOf()})`);
        }
        query.addCondition('(' + stateFilters.join(' OR ') + ')');
    } else {
        query.equal('ndrop.state', DropState.ACTIVE);
    }
}

export function buildRangeCondition(column: string, after?: number, before?: number): string {
    let queryStr = '';

    if (typeof after === 'number' && after > 0) {
        queryStr += 'AND ' + column + ' > ' + after + ' ';
    }

    if (typeof before === 'number' && before > 0) {
        queryStr += 'AND ' + column + ' < ' + before + ' ';
    }

    return queryStr;
}

