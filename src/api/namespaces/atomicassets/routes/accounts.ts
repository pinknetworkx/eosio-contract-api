import * as express from 'express';

import { buildBoundaryFilter, filterQueryArgs } from '../../utils';
import { getOpenAPI3Responses, paginationParameters, primaryBoundaryParameters } from '../../../docs';
import { formatCollection } from '../format';
import { AtomicAssetsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { greylistFilterParameters, hideOffersParameters } from '../openapi';
import { hideOfferAssets } from '../utils';

export function accountsEndpoints(core: AtomicAssetsNamespace, server: HTTPServer, router: express.Router): any {
    router.all(['/v1/accounts', '/v1/accounts/_count'], server.web.caching(), (async (req, res) => {
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
            let queryString = 'SELECT owner account, COUNT(*) as assets FROM atomicassets_assets asset WHERE contract = $1 AND owner IS NOT NULL ';
            const queryValues: any[] = [core.args.atomicassets_account];

            if (args.match) {
                queryString += 'AND POSITION($' + ++varCounter + ' IN owner) > 0 ';
                queryValues.push(args.match.toLowerCase());
            }

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

            queryString += hideOfferAssets(req);

            const boundaryFilter = buildBoundaryFilter(
                req, varCounter, 'owner', 'string', null, null
            );
            queryValues.push(...boundaryFilter.values);
            varCounter += boundaryFilter.values.length;
            queryString += boundaryFilter.str;

            queryString += 'GROUP BY owner ';

            if (req.originalUrl.search('/_count') >= 0) {
                const countQuery = await server.query(
                    'SELECT COUNT(*) counter FROM (' + queryString + ') x',
                    queryValues
                );

                return res.json({success: true, data: countQuery.rows[0].counter, query_time: Date.now()});
            }

            queryString += 'ORDER BY assets DESC, account ASC LIMIT $' + ++varCounter + ' OFFSET $' + ++varCounter + ' ';
            queryValues.push(args.limit);
            queryValues.push((args.page - 1) * args.limit);

            const query = await server.query(queryString, queryValues);

            return res.json({success: true, data: query.rows});
        } catch (e) {
            return res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    }));

    router.all('/v1/accounts/:account', server.web.caching(), (async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                collection_whitelist: {type: 'string', min: 1},
                collection_blacklist: {type: 'string', min: 1}
            });

            let varCounter = 2;
            let collectionQueryString = 'SELECT collection_name, COUNT(*) as assets ' +
                'FROM atomicassets_assets asset ' +
                'WHERE contract = $1 AND owner = $2 ';
            let templateQueryString = 'SELECT template_id, COUNT(*) as assets ' +
                'FROM atomicassets_assets asset ' +
                'WHERE contract = $1 AND owner = $2 ';
            const queryValues: any[] = [core.args.atomicassets_account, req.params.account];

            if (args.collection_whitelist) {
                collectionQueryString += 'AND asset.collection_name = ANY ($' + ++varCounter + ') ';
                templateQueryString += 'AND asset.collection_name = ANY ($' + ++varCounter + ') ';
                queryValues.push(args.collection_whitelist.split(','));
            }

            if (args.collection_blacklist) {
                collectionQueryString += 'AND NOT (asset.collection_name = ANY ($' + ++varCounter + ')) ';
                templateQueryString += 'AND NOT (asset.collection_name = ANY ($' + ++varCounter + ')) ';
                queryValues.push(args.collection_blacklist.split(','));
            }

            collectionQueryString += hideOfferAssets(req);
            collectionQueryString += 'GROUP BY contract, collection_name ORDER BY assets DESC';

            templateQueryString += hideOfferAssets(req);
            templateQueryString += 'GROUP BY contract, template_id ORDER BY assets DESC';

            const collectionQuery = await server.query(collectionQueryString, queryValues);

            const collections = await server.query(
                'SELECT * FROM atomicassets_collections_master WHERE contract = $1 AND collection_name = ANY ($2)',
                [core.args.atomicassets_account, collectionQuery.rows.map(row => row.collection_name)]
            );

            const lookupCollections = collections.rows.reduce(
                (prev, current) => Object.assign(prev, {[current.collection_name]: formatCollection(current)}), {}
            );

            return res.json({
                success: true,
                data: {
                    collections: collectionQuery.rows.map(row => ({
                        collection: lookupCollections[row.collection_name],
                        assets: row.assets
                    })),
                    templates: await server.query(templateQueryString, queryValues),
                    assets: collectionQuery.rows.reduce((prev, current) => prev + parseInt(current.assets, 10), 0)
                }
            });
        } catch (e) {
            return res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    }));

    router.all('/v1/accounts/:account/:collection_name', server.web.caching({ignoreQueryString: true}), (async (req, res) => {
        try {
            const templateQuery = await server.query(
                'SELECT template_id, COUNT(*) as assets ' +
                'FROM atomicassets_assets asset ' +
                'WHERE contract = $1 AND owner = $2 AND collection_name = $3 ' +
                'GROUP BY template_id ORDER BY assets DESC',
                [core.args.atomicassets_account, req.params.account, req.params.collection_name]
            );

            const schemaQuery = await server.query(
                'SELECT schema_name, COUNT(*) as assets ' +
                'FROM atomicassets_assets asset ' +
                'WHERE contract = $1 AND owner = $2 AND collection_name = $3 ' +
                'GROUP BY schema_name ORDER BY assets DESC',
                [core.args.atomicassets_account, req.params.account, req.params.collection_name]
            );

            return res.json({
                success: true,
                data: {
                    schemas: schemaQuery.rows,
                    templates: templateQuery.rows
                }
            });
        } catch (e) {
            return res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    }));

    return {
        tag: {
            name: 'accounts',
            description: 'Accounts'
        },
        paths: {
            '/v1/accounts': {
                get: {
                    tags: ['accounts'],
                    summary: 'Get accounts which own atomicassets NFTs',
                    parameters: [
                        {
                            name: 'match',
                            in: 'query',
                            description: 'Search for partial account name',
                            required: false,
                            schema: {type: 'string'}
                        },
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
                        ...hideOffersParameters,
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
            '/v1/accounts/{account}': {
                get: {
                    tags: ['accounts'],
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
                                            collection: {'$ref': '#/components/schemas/Collection'},
                                            assets: {type: 'string'}
                                        }
                                    }
                                },
                                templates: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
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
            },
            '/v1/accounts/{account}/{collection_name}': {
                get: {
                    tags: ['accounts'],
                    summary: 'Get templates and schemas count by account',
                    parameters: [
                        {
                            name: 'account',
                            in: 'path',
                            description: 'Account name',
                            required: true,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'collection_name',
                            in: 'path',
                            description: 'Collection Name',
                            required: true,
                            schema: {type: 'string'}
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                templates: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            template_id: {type: 'string'},
                                            assets: {type: 'string'}
                                        }
                                    }
                                },
                                schemas: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            schema_name: {type: 'string'},
                                            assets: {type: 'string'}
                                        }
                                    }
                                }
                            }
                        }
                    })
                }
            }
        }
    };
}
