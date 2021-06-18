import * as express from 'express';
import { Numeric } from 'eosjs/dist';

import { AtomicToolsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import {
    actionGreylistParameters,
    dateBoundaryParameters,
    getOpenAPI3Responses,
    paginationParameters,
    primaryBoundaryParameters
} from '../../../docs';
import { fillLinks } from '../filler';
import { formatLink } from '../format';
import { buildBoundaryFilter, filterQueryArgs } from '../../utils';
import { LinkState } from '../../../../filler/handlers/atomictools';
import { greylistFilterParameters } from '../../atomicassets/openapi';
import { applyActionGreylistFilters, getContractActionLogs } from '../../../utils';
import logger from '../../../../utils/winston';
import QueryBuilder from '../../../builder';

export function linksEndpoints(core: AtomicToolsNamespace, server: HTTPServer, router: express.Router): any {
    router.all(['/v1/links', '/v1/links/_count'], server.web.caching(), async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                creator: {type: 'string', min: 1},
                claimer: {type: 'string', min: 1},
                public_key: {type: 'string', min: 1},
                state: {type: 'string'},

                collection_blacklist: {type: 'string', min: 1},
                collection_whitelist: {type: 'string', min: 1},

                page: {type: 'int', min: 1, default: 1},
                limit: {type: 'int', min: 1, max: 100, default: 100},
                sort: {type: 'string', values: ['created'], default: 'created'},
                order: {type: 'string', values: ['asc', 'desc'], default: 'desc'}
            });

            const query = new QueryBuilder('SELECT * FROM atomictools_links_master link');

            query.equal('tools_contract', core.args.atomictools_account);

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
                req, query, 'link_id', 'int',
                args.sort === 'updated' ? 'updated_at_time' : 'created_at_time'
            );

            if (req.originalUrl.search('/_count') >= 0) {
                const countQuery = await this.server.query(
                    'SELECT COUNT(*) counter FROM (' + query.buildString() + ') x',
                    query.buildValues()
                );

                return res.json({success: true, data: countQuery.rows[0].counter, query_time: Date.now()});
            }

            const sortColumnMapping: {[key: string]: string} = {
                created: 'link_id',
                updated: 'updated_at_time'
            };

            query.append('ORDER BY ' + sortColumnMapping[args.sort] + ' ' + args.order + ', link_id ASC');
            query.append('LIMIT ' + query.addVariable(args.limit) + ' OFFSET ' + query.addVariable((args.page - 1) * args.limit));

            const result = await server.query(query.buildString(), query.buildValues());

            const links = await fillLinks(
                server, core.args.atomicassets_account, result.rows.map((row) => formatLink(row))
            );

            res.json({success: true, data: links, query_time: Date.now()});
        } catch (e) {
            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    router.all('/v1/links/:link_id', server.web.caching(), async (req, res) => {
        try {
            const query = await server.query(
                'SELECT * FROM atomictools_links_master WHERE tools_contract = $1 AND link_id = $2',
                [core.args.atomictools_account, req.params.link_id]
            );

            if (query.rowCount === 0) {
                res.status(416).json({success: false, message: 'Link not found'});
            } else {
                const links = await fillLinks(
                    server, core.args.atomicassets_account, query.rows.map((row) => formatLink(row))
                );

                res.json({success: true, data: links[0], query_time: Date.now()});
            }
        } catch (e) {
            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    router.all('/v1/links/:link_id/logs', server.web.caching(), (async (req, res) => {
        const args = filterQueryArgs(req, {
            page: {type: 'int', min: 1, default: 1},
            limit: {type: 'int', min: 1, max: 100, default: 100},
            order: {type: 'string', values: ['asc', 'desc'], default: 'asc'}
        });

        try {
            res.json({
                success: true,
                data: await getContractActionLogs(
                    server, core.args.atomictools_account,
                    applyActionGreylistFilters(['lognewlink', 'loglinkstart', 'cancellink', 'claimlink'], args),
                    {link_id: req.params.link_id},
                    (args.page - 1) * args.limit, args.limit, args.order
                ), query_time: Date.now()
            });
        } catch (e) {
            logger.error(e);

            return res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    }));

    return {
        tag: {
            name: 'links',
            description: 'Share Links'
        },
        paths: {
            '/v1/links': {
                get: {
                    tags: ['links'],
                    summary: 'Get all links',
                    parameters: [
                        {
                            name: 'creator',
                            in: 'query',
                            description: 'Link Creator',
                            required: false,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'claimer',
                            in: 'query',
                            description: 'Claimer of the link if it was claimed',
                            required: false,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'public_key',
                            in: 'query',
                            description: 'Public key which is used to share the assets',
                            required: false,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'state',
                            in: 'query',
                            description: 'Filter by link state (' +
                                LinkState.WAITING.valueOf() + ': WAITING - Link created but items were not transferred yet, ' +
                                LinkState.CREATED.valueOf() + ': CREATED - Link is pending, ' +
                                LinkState.CANCELED.valueOf() + ': CANCELED - Creator canceled link, ' +
                                LinkState.CLAIMED.valueOf() + ': CLAIMED - Link was claimed, ' +
                                ') - separate multiple with ","',
                            required: false,
                            schema: {type: 'string'}
                        },
                        ...greylistFilterParameters,
                        ...primaryBoundaryParameters,
                        ...dateBoundaryParameters,
                        ...paginationParameters,
                        {
                            name: 'sort',
                            in: 'query',
                            description: 'Column to sort',
                            required: false,
                            schema: {
                                type: 'string',
                                enum: ['created'],
                                default: 'created'
                            }
                        }
                    ],
                    responses: getOpenAPI3Responses([500, 200], {
                        type: 'array',
                        items: {'$ref': '#/components/schemas/Link'}
                    })
                }
            },
            '/v1/links/{link_id}': {
                get: {
                    tags: ['links'],
                    summary: 'Get a specific link by id',
                    parameters: [
                        {
                            in: 'path',
                            name: 'link_id',
                            description: 'Link Id',
                            required: true,
                            schema: {type: 'integer'}
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 416, 500], {'$ref': '#/components/schemas/Link'})
                }
            },
            '/v1/links/{link_id}/logs': {
                get: {
                    tags: ['links'],
                    summary: 'Fetch link logs',
                    parameters: [
                        {
                            name: 'link_id',
                            in: 'path',
                            description: 'ID of link',
                            required: true,
                            schema: {type: 'integer'}
                        },
                        ...paginationParameters,
                        ...actionGreylistParameters
                    ],
                    responses: getOpenAPI3Responses([200, 500], {type: 'array', items: {'$ref': '#/components/schemas/Log'}})
                }
            }
        }
    };
}
