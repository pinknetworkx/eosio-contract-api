import * as express from 'express';

import { buildBoundaryFilter, filterQueryArgs } from '../../utils';
import { getOpenAPI3Responses, paginationParameters, primaryBoundaryParameters } from '../../../docs';
import { AtomicAssetsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { greylistFilterParameters, hideOffersParameters } from '../openapi';
import { hideOfferAssets } from '../utils';

export function burnEndpoints(core: AtomicAssetsNamespace, server: HTTPServer, router: express.Router): any {
    router.all(['/v1/burns'], server.web.caching(), (async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                page: {type: 'int', min: 1, default: 1},
                limit: {type: 'int', min: 1, max: 5000, default: 100},

                collection_name: {type: 'string', min: 1},
                schema_name: {type: 'string', min: 1},
                template_id: {type: 'string', min: 1},

                collection_whitelist: {type: 'string', min: 1},
                collection_blacklist: {type: 'string', min: 1},

                match: {type: 'string', min: 1}
            });

            let varCounter = 1;
            let queryString = 'SELECT burned_by_account account, COUNT(*) as assets FROM atomicassets_assets asset WHERE contract = $1 AND burned_by_account IS NOT NULL ';
            const queryValues: any[] = [core.args.atomicassets_account];

            if (args.collection_whitelist) {
                queryString += 'AND asset.collection_name = ANY ($' + ++varCounter + ') ';
                queryValues.push(args.collection_whitelist.split(','));
            }

            if (args.collection_blacklist) {
                queryString += 'AND NOT (asset.collection_name = ANY ($' + ++varCounter + ')) ';
                queryValues.push(args.collection_blacklist.split(','));
            }

            if (args.collection_name) {
                queryString += 'AND asset.collection_name = ANY ($' + ++varCounter + ') ';
                queryValues.push(args.collection_name.split(','));
            }

            if (args.schema_name) {
                queryString += 'AND asset.schema_name = ANY ($' + ++varCounter + ') ';
                queryValues.push(args.schema_name.split(','));
            }

            if (args.template_id) {
                queryString += 'AND asset.template_id = ANY ($' + ++varCounter + ') ';
                queryValues.push(args.template_id.split(','));
            }

            const boundaryFilter = buildBoundaryFilter(
                req, varCounter, 'burned_by_account', 'string', 'burned_at_time'
            );
            queryValues.push(...boundaryFilter.values);
            varCounter += boundaryFilter.values.length;
            queryString += boundaryFilter.str;

            queryString += 'GROUP BY burned_by_account ';

            queryString += 'ORDER BY assets DESC, account ASC LIMIT $' + ++varCounter + ' OFFSET $' + ++varCounter + ' ';
            queryValues.push(args.limit);
            queryValues.push((args.page - 1) * args.limit);

            const query = await server.query(queryString, queryValues);

            return res.json({success: true, data: query.rows});
        } catch (e) {
            return res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    }));

    router.all('/v1/burns/:account', server.web.caching(), (async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                collection_whitelist: {type: 'string', min: 1},
                collection_blacklist: {type: 'string', min: 1}
            });

            let varCounter = 2;
            let collectionQueryString = 'SELECT collection_name, COUNT(*) as assets ' +
                'FROM atomicassets_assets asset ' +
                'WHERE contract = $1 AND burned_by_account = $2 ';
            let templateQueryString = 'SELECT collection_name, template_id, COUNT(*) as assets ' +
                'FROM atomicassets_assets asset ' +
                'WHERE contract = $1 AND burned_by_account = $2 ';
            const queryValues: any[] = [core.args.atomicassets_account, req.params.account];

            if (args.collection_whitelist) {
                const condition = 'AND asset.collection_name = ANY ($' + ++varCounter + ') ';

                collectionQueryString += condition;
                templateQueryString += condition;

                queryValues.push(args.collection_whitelist.split(','));
            }

            if (args.collection_blacklist) {
                const condition = 'AND NOT (asset.collection_name = ANY ($' + ++varCounter + ')) ';

                collectionQueryString += condition;
                templateQueryString += condition;

                queryValues.push(args.collection_blacklist.split(','));
            }

            collectionQueryString += hideOfferAssets(req);
            collectionQueryString += 'GROUP BY contract, collection_name ORDER BY assets DESC';

            templateQueryString += hideOfferAssets(req);
            templateQueryString += 'GROUP BY contract, collection_name, template_id ORDER BY assets DESC';

            const collectionQuery = await server.query(collectionQueryString, queryValues);
            const templateQuery = await server.query(templateQueryString, queryValues);

            return res.json({
                success: true,
                data: {
                    collections: collectionQuery.rows,
                    templates: templateQuery.rows,
                    assets: collectionQuery.rows.reduce((prev, current) => prev + parseInt(current.assets, 10), 0)
                }
            });
        } catch (e) {
            return res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    }));

    return {
        tag: {
            name: 'burns',
            description: 'Burns'
        },
        paths: {
            '/v1/burns': {
                get: {
                    tags: ['burns'],
                    summary: 'Get accounts which own atomicassets NFTs',
                    parameters: [
                        {
                            name: 'collection_name',
                            in: 'query',
                            description: 'Filter for specific collection',
                            required: false,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'schema_name',
                            in: 'query',
                            description: 'Filter for specific schema',
                            required: false,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'template_id',
                            in: 'query',
                            description: 'Filter for specific template',
                            required: false,
                            schema: {type: 'string'}
                        },
                        ...greylistFilterParameters,
                        ...primaryBoundaryParameters,
                        ...paginationParameters
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                account: {type: 'string'},
                                assets: {type: 'string'}
                            }
                        }
                    })
                }
            },
            '/v1/burns/{account}': {
                get: {
                    tags: ['burns'],
                    summary: 'Get a specific account',
                    parameters: [
                        {
                            name: 'account',
                            in: 'path',
                            description: 'Account name',
                            required: true,
                            schema: {type: 'string'}
                        },
                        ...hideOffersParameters,
                        ...greylistFilterParameters
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                collections: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            collection_name: {type: 'string'},
                                            assets: {type: 'string'}
                                        }
                                    }
                                },
                                templates: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            collection_name: {type: 'string'},
                                            template_id: {type: 'string'},
                                            assets: {type: 'string'}
                                        }
                                    }
                                },
                                assets: {type: 'string'}
                            }
                        }
                    })
                }
            }
        }
    };
}
