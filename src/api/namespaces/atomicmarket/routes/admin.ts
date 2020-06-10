import * as express from 'express';

import { AtomicMarketNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { formatCollection } from '../../atomicassets/format';

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

export function auctionsEndpoints(core: AtomicMarketNamespace, server: HTTPServer, router: express.Router): any {
    router.get('/v1/blacklist/collections', async (req, res) => {
        const query = await core.connection.database.query(
            'SELECT collection.* FROM atomicassets_collections_master collection, atomicmarket_blacklist_collections clist' +
            'WHERE collection.contract = clist.asset_contract AND collection.collection_name = clist.collection_name'
        );

        res.json({success: true, data: query.rows.map((row) => formatCollection(row))});
    });

    router.put('/v1/blacklist/collections', adminAuth(core), async (req, res) => {

    });

    router.delete('/v1/blacklist/collections/:collection_name', adminAuth(core), async (req, res) => {

    });

    router.get('/v1/blacklist/accounts', async (req, res) => {

    });

    router.put('/v1/blacklist/accounts', adminAuth(core), async (req, res) => {

    });

    router.delete('/v1/blacklist/accounts/:account', adminAuth(core), async (req, res) => {

    });

    router.get('/v1/whitelist/collections', async (req, res) => {
        const query = await core.connection.database.query(
            'SELECT collection.* FROM atomicassets_collections_master collection, atomicmarket_whitelist_collections clist' +
            'WHERE collection.contract = clist.asset_contract AND collection.collection_name = clist.collection_name'
        );

        res.json({success: true, data: query.rows.map((row) => formatCollection(row))});
    });

    router.put('/v1/whitelist/collections', adminAuth(core), async (req, res) => {

    });

    router.delete('/v1/whitelist/collections/:collection_name', adminAuth(core), async (req, res) => {

    });

    router.get('/v1/whitelist/accounts', async (req, res) => {

    });

    router.put('/v1/whitelist/accounts', adminAuth(core), async (req, res) => {

    });

    router.delete('/v1/whitelist/accounts/:account', adminAuth(core), async (req, res) => {

    });

    return {
        tag: {
            name: 'admin',
            description: 'Admin utilities'
        },
        paths: {

        }
    };
}
