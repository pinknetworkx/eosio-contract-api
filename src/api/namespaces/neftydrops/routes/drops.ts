import * as express from 'express';

import {DropApiState, NeftyDropsNamespace} from '../index';
import { HTTPServer } from '../../../server';
import { buildBoundaryFilter, filterQueryArgs } from '../../utils';
import { buildGreylistFilter } from '../../atomicassets/utils';
import QueryBuilder from '../../../builder';
import {buildDropFilter} from '../utils';
import {fillDrops} from '../filler';
import {formatClaim, formatDrop} from '../format';
import {
    dateBoundaryParameters, getOpenAPI3Responses,
    paginationParameters,
    primaryBoundaryParameters
} from '../../../docs';
import logger from '../../../../utils/winston';
import {DropState} from '../../../../filler/handlers/neftydrops';
import {dropDataFilter, dropsFilterParameters} from '../openapi';

export function dropsEndpoints(core: NeftyDropsNamespace, server: HTTPServer, router: express.Router): any {
    router.all(['/v1/drops', '/v1/drops/_count'], server.web.caching(), async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                page: {type: 'int', min: 1, default: 1},
                limit: {type: 'int', min: 1, max: 100, default: 100},
                collection_name: {type: 'string', min: 1},
                sort: {
                    type: 'string',
                    values: [
                        'created', 'updated', 'drop_id', 'price',
                        'start_time', 'end_time',
                    ],
                    default: 'created'
                },
                order: {type: 'string', values: ['asc', 'desc'], default: 'desc'}
            });

            const query = new QueryBuilder(`
                SELECT ndrop.drop_id 
                FROM neftydrops_drops ndrop 
                    LEFT JOIN neftydrops_drop_prices price ON (price.drops_contract = ndrop.drops_contract AND price.drop_id = ndrop.drop_id)
            `);

            query.equal('ndrop.state', DropState.ACTIVE);

            buildDropFilter(req, query);

            if (!args.collection_name) {
                buildGreylistFilter(req, query, {collectionName: 'ndrop.collection_name'});
            }

            buildBoundaryFilter(
                req, query, 'ndrop.drop_id', 'int',
                args.sort === 'updated' ? 'ndrop.updated_at_time' : 'ndrop.created_at_time'
            );

            if (req.originalUrl.search('/_count') >= 0) {
                const countQuery = await server.query(
                    'SELECT COUNT(*) counter FROM (' + query.buildString() + ') x',
                    query.buildValues()
                );

                return res.json({success: true, data: countQuery.rows[0].counter, query_time: Date.now()});
            }

            const sortMapping: {[key: string]: {column: string, nullable: boolean}}  = {
                drop_id: {column: 'ndrop.drop_id', nullable: false},
                created: {column: 'ndrop.created_at_time', nullable: false},
                updated: {column: 'ndrop.updated_at_time', nullable: false},
                start_time: {column: 'ndrop.start_time', nullable: false},
                end_time: {column: 'ndrop.end_time', nullable: false},
                price: {column: 'price.price', nullable: true}
            };

            query.append('ORDER BY ' + sortMapping[args.sort].column + ' ' + args.order + ' ' + (sortMapping[args.sort].nullable ? 'NULLS LAST' : '') + ', ndrop.drop_id ASC');
            query.append('LIMIT ' + query.addVariable(args.limit) + ' OFFSET ' + query.addVariable((args.page - 1) * args.limit));

            const dropQuery = await server.query(query.buildString(), query.buildValues());

            const result = await server.query(
                'SELECT * FROM neftydrops_drops_master WHERE drops_contract = $1 AND drop_id = ANY ($2)',
                [core.args.neftydrops_account, dropQuery.rows.map(row => row.drop_id)]
            );

            const dropLookup: {[key: string]: any} = {};
            result.rows.reduce((prev, current) => {
                prev[String(current.drop_id)] = current;

                return prev;
            }, dropLookup);

            const drops = await fillDrops(
                server, core.args.atomicassets_account, dropQuery.rows.map((row) => formatDrop(dropLookup[String(row.drop_id)]))
            );

            res.json({success: true, data: drops, query_time: Date.now()});
        } catch (e) {
            logger.error(e);
            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    router.all('/v1/drops/:drop_id', server.web.caching(), async (req, res) => {
        try {
            const query = await server.query(
                'SELECT * FROM neftydrops_drops_master WHERE drops_contract = $1 AND drop_id = $2',
                [core.args.neftydrops_account, req.params.drop_id]
            );

            if (query.rowCount === 0) {
                res.status(416).json({success: false, message: 'Drop not found'});
            } else {
                const drops = await fillDrops(
                    server, core.args.atomicassets_account, query.rows.map((row) => formatDrop(row))
                );
                res.json({success: true, data: drops[0], query_time: Date.now()});
            }
        } catch (e) {
            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    router.all(['/v1/drops/:drop_id/claims', '/v1/drops/:drop_id/claims/_count'], server.web.caching(), async (req, res) => {
        const args = filterQueryArgs(req, {
            page: {type: 'int', min: 1, default: 1},
            limit: {type: 'int', min: 1, max: 100, default: 100},
            sort: {
                type: 'string',
                values: [
                    'claim_time', 'price', 'total_price',
                    'amount', 'claimer',
                ],
                default: 'claim_time'
            },
            order: {type: 'string', values: ['asc', 'desc'], default: 'asc'}
        });

        try {
            const query = new QueryBuilder(
                'SELECT claim_id FROM neftydrops_claims WHERE drops_contract = $1 AND drop_id = $2',
                [core.args.neftydrops_account, req.params.drop_id]
            );

            if (req.originalUrl.search('/_count') >= 0) {
                const countQuery = await server.query(
                    'SELECT COUNT(*) counter FROM (' + query.buildString() + ') x',
                    query.buildValues()
                );

                return res.json({success: true, data: countQuery.rows[0].counter, query_time: Date.now()});
            }

            const sortMapping: {[key: string]: {column: string, nullable: boolean}}  = {
                claim_time: {column: 'created_at_time', nullable: false},
                price: {column: 'final_price', nullable: false},
                total_price: {column: 'total_price', nullable: false},
                amount: {column: 'amount', nullable: false},
                claimer: {column: 'claimer', nullable: false},
            };

            query.append('ORDER BY ' + sortMapping[args.sort].column + ' ' + args.order + ' ' + (sortMapping[args.sort].nullable ? 'NULLS LAST' : '') + ', claim_id ASC');
            query.append('LIMIT ' + query.addVariable(args.limit) + ' OFFSET ' + query.addVariable((args.page - 1) * args.limit));

            const claimsQuery = await server.query(query.buildString(), query.buildValues());
            const result = await server.query(
                'SELECT * FROM neftydrops_claims_master WHERE drops_contract = $1 AND claim_id = ANY ($2)',
                [core.args.neftydrops_account, claimsQuery.rows.map(row => row.claim_id)]
            );

            const claimLookup: {[key: string]: any} = {};
            result.rows.reduce((prev, current) => {
                prev[String(current.claim_id)] = current;

                return prev;
            }, claimLookup);

            const claims = claimsQuery.rows.map((row) => formatClaim(claimLookup[row.claim_id]));
            res.json({success: true, data: claims, query_time: Date.now()});
        } catch (e) {
            logger.error(e);
            return res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    return {
        tag: {
            name: 'drops',
            description: 'Drops'
        },
        paths: {
            '/v1/drops': {
                get: {
                    tags: ['drops'],
                    summary: 'Get all drops. ',
                    description: dropDataFilter,
                    parameters: [
                        {
                            name: 'state',
                            in: 'query',
                            description: 'Filter by drop state (' +
                                DropApiState.CREATED.valueOf() + ': CREATED - The drop is created, ' +
                                DropApiState.ACTIVE.valueOf() + ': ACTIVE - The drop is active for claiming' +
                                DropApiState.SOLD_OUT.valueOf() + ': SOLD_OUT - The drop is sold out' +
                                DropApiState.ENDED.valueOf() + ': ENDED - The drop is already ended' +
                                ') - separate multiple with ","',
                            required: false,
                            schema: {type: 'string'}
                        },
                        ...primaryBoundaryParameters,
                        ...dropsFilterParameters,
                        ...dateBoundaryParameters,
                        ...paginationParameters,
                        {
                            name: 'sort',
                            in: 'query',
                            description: 'Column to sort',
                            required: false,
                            schema: {
                                type: 'string',
                                enum: [
                                    'created', 'updated', 'drop_id', 'price',
                                    'start_time', 'end_time',
                                ],
                                default: 'created'
                            }
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'array',
                        items: {'$ref': '#/components/schemas/Drop'}
                    })
                }
            },
            '/v1/drops/{drop_id}': {
                get: {
                    tags: ['drops'],
                    summary: 'Get a specific drop by id',
                    parameters: [
                        {
                            in: 'path',
                            name: 'drop_id',
                            description: 'Drop Id',
                            required: true,
                            schema: {type: 'integer'}
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 416, 500], {'$ref': '#/components/schemas/Drop'})
                }
            },
            '/v1/drops/{drop_id}/claims': {
                get: {
                    tags: ['drops'],
                    summary: 'Fetch drop claims',
                    parameters: [
                        {
                            name: 'drop_id',
                            in: 'path',
                            description: 'ID of drop',
                            required: true,
                            schema: {type: 'integer'}
                        },
                        ...paginationParameters,
                        {
                            name: 'sort',
                            in: 'query',
                            description: 'Column to sort',
                            required: false,
                            schema: {
                                type: 'string',
                                enum: [
                                    'claim_time', 'price', 'amount', 'claimer'
                                ],
                                default: 'claim_time'
                            }
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 500], {type: 'array', items: {'$ref': '#/components/schemas/Claim'}})
                }
            }
        }
    };
}
