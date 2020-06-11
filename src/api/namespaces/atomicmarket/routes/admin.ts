import * as express from 'express';

import { AtomicMarketNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { formatCollection } from '../../atomicassets/format';
import { filterQueryArgs } from '../../utils';
import { getOpenAPI3Responses } from '../../../docs';

function adminAuth(core: AtomicMarketNamespace): express.RequestHandler {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
        const header = req.header('authorization');

        if (typeof header === 'string') {
            const token = header.split(' ');

            if (core.args.admin_token && token.length >= 2 && token[0] === 'Bearer' && token[1] === core.args.admin_token) {
                return next();
            }
        }

        res.status(401).json({success: false, message: 'unauthorized'});
    };
}

export function adminEndpoints(core: AtomicMarketNamespace, server: HTTPServer, router: express.Router): any {
    async function collectionExists(collectionName: string): Promise<boolean> {
        const query = await core.connection.database.query(
            'SELECT collection_name FROM atomicassets_collection WHERE contract = $1 AND collection_name = $2',
            [core.args.atomicassets_account, collectionName]
        );

        return query.rowCount > 0;
    }

    router.get('/v1/blacklist/collections', server.web.caching(), async (_, res) => {
        const query = await core.connection.database.query(
            'SELECT collection.* FROM atomicassets_collections_master collection, atomicmarket_blacklist_collections clist' +
            'WHERE collection.contract = clist.asset_contract AND collection.collection_name = clist.collection_name AND ' +
            'clist.market_contract = $1 AND clist.asset_contract = $2',
            [core.args.atomicmarket_account, core.args.atomicassets_account]
        );

        res.json({success: true, data: query.rows.map((row) => formatCollection(row)), query_time: Date.now()});
    });

    router.put('/v1/blacklist/collections', adminAuth(core), async (req, res) => {
        const args = filterQueryArgs(req, {
            collection_name: {type: 'string', min: 1, max: 12}
        }, 'body');

        if (!args.collection_name || !(await collectionExists(args.collection_name))) {
            return res.status(500).json({success: false, message: 'Collection not found'});
        }

        try {
            await core.connection.database.query(
                'INSERT INTO atomicmarket_blacklist_collections (market_contract, asset_contract, collection_name) VALUES ($1, $2, $3)',
                [core.args.atomicmarket_account, core.args.atomicassets_account, args.collection_name]
            );

            res.json({success: true, data: null});
        } catch (e) {
            res.status(500).json({success: false, message: 'Entry already exists'});
        }
    });

    router.delete('/v1/blacklist/collections/:collection_name', adminAuth(core), async (req, res) => {
        const query = await core.connection.database.query(
            'DELETE FROM atomicmarket_blacklist_collections ' +
            'WHERE market_contract = $1 AND asset_contract = $2 AND collection_name = $3 ' +
            'RETURNING collection_name',
            [core.args.atomicmarket_account, core.args.atomicassets_account, req.params.collection_name]
        );

        if (query.rowCount > 0) {
            res.json({success: true, data: null});
        } else {
            res.status(500).json({success: false, message: 'Collection not found'});
        }
    });

    router.get('/v1/blacklist/accounts', server.web.caching(), async (_, res) => {
        const query = await core.connection.database.query(
            'SELECT account FROM atomicmarket_blacklist_accounts' +
            'WHERE market_contract = $1',
            [core.args.atomicmarket_account]
        );

        res.json({success: true, data: query.rows.map((row) => row.account), query_time: Date.now()});
    });

    router.put('/v1/blacklist/accounts', adminAuth(core), async (req, res) => {
        const args = filterQueryArgs(req, {
            account: {type: 'string', min: 1, max: 12}
        }, 'body');

        try {
            await core.connection.database.query(
                'INSERT INTO atomicmarket_blacklist_accounts (market_contract, account) VALUES ($1, $2)',
                [core.args.atomicmarket_account, args.account]
            );
            res.json({success: true, data: null});
        } catch (e) {
            res.json({success: false, message: 'Entry already exists'});
        }
    });

    router.delete('/v1/blacklist/accounts/:account', adminAuth(core), async (req, res) => {
        const query = await core.connection.database.query(
            'DELETE FROM atomicmarket_blacklist_accounts ' +
            'WHERE market_contract = $1 AND account = $2 ' +
            'RETURNING account',
            [core.args.atomicmarket_account, req.params.account]
        );

        if (query.rowCount > 0) {
            res.json({success: true, data: null});
        } else {
            res.status(500).json({success: false, message: 'Account not found'});
        }
    });

    router.get('/v1/whitelist/collections', server.web.caching(), async (_, res) => {
        const query = await core.connection.database.query(
            'SELECT collection.* FROM atomicassets_collections_master collection, atomicmarket_whitelist_collections clist' +
            'WHERE collection.contract = clist.asset_contract AND collection.collection_name = clist.collection_name AND ' +
            'clist.market_contract = $1 AND clist.asset_contract = $2',
            [core.args.atomicmarket_account, core.args.atomicassets_account]
        );

        res.json({success: true, data: query.rows.map((row) => formatCollection(row)), query_time: Date.now()});
    });

    router.put('/v1/whitelist/collections', adminAuth(core), async (req, res) => {
        const args = filterQueryArgs(req, {
            collection_name: {type: 'string', min: 1, max: 12}
        }, 'body');

        if (!args.collection_name || !(await collectionExists(args.collection_name))) {
            return res.status(500).json({success: false, message: 'Collection not found'});
        }

        try {
            await core.connection.database.query(
                'INSERT INTO atomicmarket_whitelist_collections (market_contract, asset_contract, collection_name) VALUES ($1, $2, $3)',
                [core.args.atomicmarket_account, core.args.atomicassets_account, args.collection_name]
            );

            res.json({success: true, data: null});
        } catch (e) {
            res.status(500).json({success: false, message: 'Entry already exists'});
        }
    });

    router.delete('/v1/whitelist/collections/:collection_name', adminAuth(core), async (req, res) => {
        const query = await core.connection.database.query(
            'DELETE FROM atomicmarket_whitelist_collections ' +
            'WHERE market_contract = $1 AND asset_contract = $2 AND collection_name = $3 ' +
            'RETURNING collection_name',
            [core.args.atomicmarket_account, core.args.atomicassets_account, req.params.collection_name]
        );

        if (query.rowCount > 0) {
            res.json({success: true, data: null});
        } else {
            res.status(500).json({success: false, message: 'Collection not found'});
        }
    });

    router.get('/v1/whitelist/accounts', server.web.caching(), async (_, res) => {
        const query = await core.connection.database.query(
            'SELECT account FROM atomicmarket_whitelist_accounts' +
            'WHERE market_contract = $1',
            [core.args.atomicmarket_account]
        );

        res.json({success: true, data: query.rows.map((row) => row.account), query_time: Date.now()});
    });

    router.put('/v1/whitelist/accounts', adminAuth(core), async (req, res) => {
        const args = filterQueryArgs(req, {
            account: {type: 'string', min: 1, max: 12}
        }, 'body');

        try {
            await core.connection.database.query(
                'INSERT INTO atomicmarket_whitelist_accounts (market_contract, account) VALUES ($1, $2)',
                [core.args.atomicmarket_account, args.account]
            );
            res.json({success: true, data: null});
        } catch (e) {
            res.json({success: false, message: 'Entry already exists'});
        }
    });

    router.delete('/v1/whitelist/accounts/:account', adminAuth(core), async (req, res) => {
        const query = await core.connection.database.query(
            'DELETE FROM atomicmarket_whitelist_accounts ' +
            'WHERE market_contract = $1 AND account = $2 ' +
            'RETURNING account',
            [core.args.atomicmarket_account, req.params.account]
        );

        if (query.rowCount > 0) {
            res.json({success: true, data: null});
        } else {
            res.status(500).json({success: false, message: 'Account not found'});
        }
    });

    return {
        tag: {
            name: 'admin',
            description: 'Admin utilities'
        },
        paths: {
            '/v1/blacklist/collections': {
                get: {
                    tags: ['admin'],
                    summary: 'Get all blacklisted collections',
                    responses: getOpenAPI3Responses([200], {
                        type: 'array',
                        items: {'$ref': '#/components/schemas/Collection'}
                    })
                },
                put: {
                    tags: ['admin'],
                    summary: 'Add a collection to the blacklist',
                    security: [
                        {adminAuth: []}
                    ],
                    requestBody: {
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        collection_name: {type: 'string'}
                                    }
                                },
                                example: {
                                    collection_name: 'collection_name'
                                }
                            }
                        }
                    },
                    responses: getOpenAPI3Responses([500, 401, 200], {type: 'object', nullable: true})
                }
            },
            '/v1/blacklist/collections/{collection_name}': {
                delete: {
                    tags: ['admin'],
                    summary: 'Remove a collection from the blacklist',
                    security: [
                        {adminAuth: []}
                    ],
                    parameters: [
                        {
                            in: 'path',
                            name: 'collection_name',
                            description: 'Collection name to remove',
                            required: true,
                            schema: {type: 'string'}
                        }
                    ],
                    responses: getOpenAPI3Responses([500, 401, 200], {type: 'object', nullable: true})
                }
            },
            '/v1/whitelist/collections': {
                get: {
                    tags: ['admin'],
                    summary: 'Get all whitelisted collections',
                    responses: getOpenAPI3Responses([200], {
                        type: 'array',
                        items: {'$ref': '#/components/schemas/Collection'}
                    })
                },
                put: {
                    tags: ['admin'],
                    summary: 'Add a collection to the whitelist',
                    security: [
                        {adminAuth: []}
                    ],
                    requestBody: {
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        collection_name: {type: 'string'}
                                    }
                                },
                                example: {
                                    collection_name: 'collection_name'
                                }
                            }
                        }
                    },
                    responses: getOpenAPI3Responses([500, 401, 200], {type: 'object', nullable: true})
                }
            },
            '/v1/whitelist/collections/{collection_name}': {
                delete: {
                    tags: ['admin'],
                    summary: 'Remove a collection from the whitelist',
                    security: [
                        {adminAuth: []}
                    ],
                    parameters: [
                        {
                            in: 'path',
                            name: 'collection_name',
                            description: 'Collection name to remove',
                            required: true,
                            schema: {type: 'string'}
                        }
                    ],
                    responses: getOpenAPI3Responses([500, 401, 200], {type: 'object', nullable: true})
                }
            },
            '/v1/blacklist/accounts': {
                get: {
                    tags: ['admin'],
                    summary: 'Get all whitelisted accounts',
                    responses: getOpenAPI3Responses([200], {
                        type: 'array',
                        items: {type: 'string'}
                    })
                },
                put: {
                    tags: ['admin'],
                    summary: 'Add a account to the blacklist',
                    security: [
                        {adminAuth: []}
                    ],
                    requestBody: {
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        account: {type: 'string'}
                                    }
                                },
                                example: {
                                    account: 'Account Name'
                                }
                            }
                        }
                    },
                    responses: getOpenAPI3Responses([500, 401, 200], {type: 'object', nullable: true})
                }
            },
            '/v1/blacklist/accounts/{account}': {
                delete: {
                    tags: ['admin'],
                    summary: 'Remove an account from the blacklist',
                    security: [
                        {adminAuth: []}
                    ],
                    parameters: [
                        {
                            in: 'path',
                            name: 'account',
                            description: 'Account to remove',
                            required: true,
                            schema: {type: 'string'}
                        }
                    ],
                    responses: getOpenAPI3Responses([500, 401, 200], {type: 'object', nullable: true})
                }
            },
            '/v1/whitelist/accounts': {
                get: {
                    tags: ['admin'],
                    summary: 'Get all whitelisted accounts',
                    responses: getOpenAPI3Responses([200], {
                        type: 'array',
                        items: {type: 'string'}
                    })
                },
                put: {
                    tags: ['admin'],
                    summary: 'Add a account to the whitelist',
                    security: [
                        {adminAuth: []}
                    ],
                    requestBody: {
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        account: {type: 'string'}
                                    }
                                },
                                example: {
                                    account: 'Account Name'
                                }
                            }
                        }
                    },
                    responses: getOpenAPI3Responses([500, 401, 200], {type: 'object', nullable: true})
                }
            },
            '/v1/whitelist/accounts/{account}': {
                delete: {
                    tags: ['admin'],
                    summary: 'Remove an account from the whitelist',
                    security: [
                        {adminAuth: []}
                    ],
                    parameters: [
                        {
                            in: 'path',
                            name: 'account',
                            description: 'Account to remove',
                            required: true,
                            schema: {type: 'string'}
                        }
                    ],
                    responses: getOpenAPI3Responses([500, 401, 200], {type: 'object', nullable: true})
                }
            }
        }
    };
}
