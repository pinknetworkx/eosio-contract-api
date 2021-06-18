import * as express from 'express';

import { buildBoundaryFilter, filterQueryArgs } from '../../utils';
import { getOpenAPI3Responses, paginationParameters, primaryBoundaryParameters } from '../../../docs';
import { formatCollection } from '../format';
import { AtomicAssetsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { greylistFilterParameters, hideOffersParameters } from '../openapi';
import { buildGreylistFilter, buildHideOffersFilter } from '../utils';
import QueryBuilder from '../../../builder';

export function accountsEndpoints(core: AtomicAssetsNamespace, server: HTTPServer, router: express.Router): any {
    router.all(['/v1/accounts', '/v1/accounts/_count'], server.web.caching(), (async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                page: {type: 'int', min: 1, default: 1},
                limit: {type: 'int', min: 1, max: 5000, default: 100},

                collection_name: {type: 'string', min: 1},
                schema_name: {type: 'string', min: 1},
                template_id: {type: 'string', min: 1},

                match: {type: 'string', min: 1}
            });

            const query = new QueryBuilder('SELECT owner account, COUNT(*) as assets FROM atomicassets_assets asset');

            query.equal('contract', core.args.atomicassets_account).notNull('owner');

            if (args.match) {
                query.addCondition('POSITION(' + query.addVariable(args.match.toLowerCase()) + ' IN owner) > 0');
            }

            buildGreylistFilter(req, query, {collectionName: 'asset.collection_name'});

            if (args.collection_name) {
                query.equalMany('asset.collection_name', args.collection_name.split(','));
            }

            if (args.schema_name) {
                query.equalMany('asset.schema_name', args.schema_name.split(','));
            }

            if (args.template_id) {
                query.equalMany('asset.template_id', args.template_id.split(','));
            }

            buildHideOffersFilter(req, query, 'asset');
            buildBoundaryFilter(req, query, 'owner', 'string', null);

            query.group(['owner']);

            if (req.originalUrl.search('/_count') >= 0) {
                const countQuery = await server.query('SELECT COUNT(*) counter FROM (' + query.buildString() + ') x', query.buildValues());

                return res.json({success: true, data: countQuery.rows[0].counter, query_time: Date.now()});
            }

            query.append('ORDER BY assets DESC, account ASC LIMIT ' + query.addVariable(args.limit) + ' OFFSET ' + query.addVariable((args.page - 1) * args.limit));

            const result = await server.query(query.buildString(), query.buildValues());

            return res.json({success: true, data: result.rows});
        } catch (e) {
            return res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    }));

    router.all('/v1/accounts/:account', server.web.caching(), (async (req, res) => {
        try {
            // collection query
            const collectionQuery = new QueryBuilder(
                'SELECT collection_name, COUNT(*) as assets ' +
                'FROM atomicassets_assets asset'
            );
            collectionQuery.equal('contract', core.args.atomicassets_account);
            collectionQuery.equal('owner', req.params.account);

            buildGreylistFilter(req, collectionQuery, {collectionName: 'asset.collection_name'});
            buildHideOffersFilter(req, collectionQuery, 'asset');

            collectionQuery.group(['contract', 'collection_name']);
            collectionQuery.append('ORDER BY assets DESC');

            const collectionResult = await server.query(collectionQuery.buildString(), collectionQuery.buildValues());

            // template query
            const templateQuery = new QueryBuilder(
                'SELECT collection_name, template_id, COUNT(*) as assets ' +
                'FROM atomicassets_assets asset'
            );
            templateQuery.equal('contract', core.args.atomicassets_account);
            templateQuery.equal('owner', req.params.account);

            buildGreylistFilter(req, templateQuery, {collectionName: 'asset.collection_name'});
            buildHideOffersFilter(req, templateQuery, 'asset');

            templateQuery.group(['contract', 'template_id']);
            templateQuery.append('ORDER BY assets DESC');

            const templateResult = await server.query(templateQuery.buildString(), templateQuery.buildValues());

            const collections = await server.query(
                'SELECT * FROM atomicassets_collections_master WHERE contract = $1 AND collection_name = ANY ($2)',
                [core.args.atomicassets_account, collectionResult.rows.map(row => row.collection_name)]
            );

            const lookupCollections = collections.rows.reduce(
                (prev, current) => Object.assign(prev, {[current.collection_name]: formatCollection(current)}), {}
            );

            return res.json({
                success: true,
                data: {
                    collections: collectionResult.rows.map(row => ({
                        collection: lookupCollections[row.collection_name],
                        assets: row.assets
                    })),
                    templates: templateResult.rows,
                    assets: collectionResult.rows.reduce((prev, current) => prev + parseInt(current.assets, 10), 0)
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
