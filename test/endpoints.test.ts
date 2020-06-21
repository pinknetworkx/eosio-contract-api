import 'mocha';
import { expect } from 'chai';
import fetch from 'node-fetch';

import logger from '../src/utils/winston';

describe('Endpoints Test', () => {
    const endpoint = 'http://localhost:9000';

    async function testEndpoint(namespace: string, path: string, params: any): Promise<number> {
        const url = endpoint + '/' + namespace + path + '?' + Object.keys(params).map(key => key + '=' + params[key]).join('&');

        logger.info(url);

        const resp = await fetch(url, {
            timeout: 5000
        });

        return resp.status;
    }

    it('atomicassets namespace', async () => {
        const namespace = 'atomicassets';

        // assets
        expect(await testEndpoint(namespace, '/v1/assets', {
            owner: 'test',
            collection_name: 'test',
            schema_name: 'test',
            template_id: 1,
            match: 'test',
            authorized_account: 'test',
            page: 1,
            limit: 1,
            order: 'asc',
            sort: 'asset_id',
            'data.test': 'test'
        })).to.equal(200);

        expect(await testEndpoint(namespace, '/v1/assets/1', {})).to.equal(416);
        expect(await testEndpoint(namespace, '/v1/assets/1/logs', {})).to.equal(200);

        // collections
        expect(await testEndpoint(namespace, '/v1/collections', {
            author: 'test',
            match: 'test',
            authorized_account: 'test',
            notify_account: 'test',
            page: 1,
            limit: 1,
            order: 'asc',
            sort: 'created'
        })).to.equal(200);

        expect(await testEndpoint(namespace, '/v1/collections/test', {})).to.equal(416);
        expect(await testEndpoint(namespace, '/v1/collections/test/logs', {})).to.equal(200);

        // schemas
        expect(await testEndpoint(namespace, '/v1/schemas', {
            collection_name: 'test',
            authorized_account: 'test',
            match: 'test',
            page: 1,
            limit: 10,
            order: 'asc',
            sort: 'created'
        })).to.equal(200);

        expect(await testEndpoint(namespace, '/v1/schemas/test/test', {})).to.equal(416);
        expect(await testEndpoint(namespace, '/v1/schemas/test/test/stats', {})).to.equal(200);
        expect(await testEndpoint(namespace, '/v1/schemas/test/test/logs', {})).to.equal(200);

        // templates
        expect(await testEndpoint(namespace, '/v1/templates', {
            collection_name: 'test',
            schema_name: 'test',
            authorized_account: 'test',
            page: 1,
            limit: 10,
            order: 'asc',
            sort: 'created'
        })).to.equal(200);

        expect(await testEndpoint(namespace, '/v1/templates/test/10000000000', {})).to.equal(416);
        expect(await testEndpoint(namespace, '/v1/templates/test/10000000000/stats', {})).to.equal(200);
        expect(await testEndpoint(namespace, '/v1/templates/test/10000000000/logs', {})).to.equal(200);

        // offers
        expect(await testEndpoint(namespace, '/v1/offers', {
            account: 'test',
            sender: 'test',
            recipient: 'test',
            state: '1,2,3,4,5',
            is_recipient_contract: 'false',
            asset_id: 1,
            page: 1,
            limit: 10,
            order: 'asc',
            sort: 'created'
        })).to.equal(200);

        expect(await testEndpoint(namespace, '/v1/offers/10000000000', {})).to.equal(416);

        // transfers
        expect(await testEndpoint(namespace, '/v1/transfers', {
            account: 'test',
            sender: 'test',
            recipient: 'test',
            asset_id: 1,
            page: 1,
            limit: 10,
            order: 'asc',
            sort: 'created'
        })).to.equal(200);

        // config
        expect(await testEndpoint(namespace, '/v1/config', {})).to.equal(200);
    }).timeout(10000);

    it('atomicmarket namespace', async () => {
        const namespace = 'atomicmarket';

        // auctions
        expect(await testEndpoint(namespace, '/v1/auctions', {
            state: '0,1,2,3,4',
            max_assets: 1,
            show_blacklisted: false,
            whitelisted_seller_only: false,
            whitelisted_collections_only: false,
            whitelisted_only: false,
            marketplace: 'test',
            maker_marketplace: 'test',
            taker_marketplace: 'test',
            symbol: 'test',
            seller: 'test',
            buyer: 'test',
            min_price: 100,
            max_price: 100,
            owner: 'test',
            collection_name: 'test',
            schema_name: 'test',
            template_id: 1,
            match: 'test',
            page: 1,
            limit: 1,
            order: 'asc',
            sort: 'asset_id',
            'data.test': 'test'
        })).to.equal(200);
        expect(await testEndpoint(namespace, '/v1/auctions/1000000', {})).to.equal(416);

        // sales
        expect(await testEndpoint(namespace, '/v1/sales', {
            state: '0,1,2,3,4',
            max_assets: 1,
            show_blacklisted: false,
            whitelisted_seller_only: false,
            whitelisted_collections_only: false,
            whitelisted_only: false,
            marketplace: 'test',
            maker_marketplace: 'test',
            taker_marketplace: 'test',
            symbol: 'test',
            seller: 'test',
            buyer: 'test',
            min_price: 100,
            max_price: 100,
            owner: 'test',
            collection_name: 'test',
            schema_name: 'test',
            template_id: 1,
            match: 'test',
            page: 1,
            limit: 1,
            order: 'asc',
            sort: 'asset_id',
            'data.test': 'test'
        })).to.equal(200);
        expect(await testEndpoint(namespace, '/v1/sales/1000000', {})).to.equal(416);

        // marketplaces
        expect(await testEndpoint(namespace, '/v1/marketplaces', {})).to.equal(200);
        expect(await testEndpoint(namespace, '/v1/marketplaces/test', {})).to.equal(416);

        // config
        expect(await testEndpoint(namespace, '/v1/config', {})).to.equal(200);

        // prices
        expect(await testEndpoint(namespace, '/v1/prices', {})).to.equal(200);

        // admin
        expect(await testEndpoint(namespace, '/v1/blacklist/collections', {})).to.equal(200);
        expect(await testEndpoint(namespace, '/v1/whitelist/collections', {})).to.equal(200);
        expect(await testEndpoint(namespace, '/v1/blacklist/accounts', {})).to.equal(200);
        expect(await testEndpoint(namespace, '/v1/whitelist/accounts', {})).to.equal(200);

        // assets
        expect(await testEndpoint(namespace, '/v1/assets', {
            owner: 'test',
            collection_name: 'test',
            schema_name: 'test',
            template_id: 1,
            match: 'test',
            authorized_account: 'test',
            page: 1,
            limit: 1,
            order: 'asc',
            sort: 'asset_id',
            'data.test': 'test'
        })).to.equal(200);

        expect(await testEndpoint(namespace, '/v1/assets/1', {})).to.equal(416);
        expect(await testEndpoint(namespace, '/v1/assets/1/logs', {})).to.equal(200);

        // offers
        expect(await testEndpoint(namespace, '/v1/offers', {
            account: 'test',
            sender: 'test',
            recipient: 'test',
            state: '1,2,3,4,5',
            is_recipient_contract: 'false',
            asset_id: 1,
            page: 1,
            limit: 10,
            order: 'asc',
            sort: 'created'
        })).to.equal(200);

        expect(await testEndpoint(namespace, '/v1/offers/10000000000', {})).to.equal(416);

        // transfers
        expect(await testEndpoint(namespace, '/v1/transfers', {
            account: 'test',
            sender: 'test',
            recipient: 'test',
            asset_id: 1,
            page: 1,
            limit: 10,
            order: 'asc',
            sort: 'created'
        })).to.equal(200);
    }).timeout(10000);

    it('atomictools namespace', async () => {
        const namespace = 'atomictools';

        // links
        expect(await testEndpoint(namespace, '/v1/links', {
            creator: 'test',
            claimer: 'test',
            public_key: 'test',
            state: '0,1,2,3',
            page: 1,
            limit: 10,
            order: 'asc',
            sort: 'created'
        })).to.equal(200);
        expect(await testEndpoint(namespace, '/v1/links/100000', {})).to.equal(416);

        // config
        expect(await testEndpoint(namespace, '/v1/config', {})).to.equal(200);
    }).timeout(10000);

    it('atomichub namespace', async () => {
        const namespace = 'atomichub';

        expect(await testEndpoint(namespace, '/v1/notifications/test', {})).to.equal(200);
        expect(await testEndpoint(namespace, '/v1/watchlist/test', {})).to.equal(200);

        expect(await testEndpoint(namespace, '/v1/watchlist/stats', {})).to.equal(200);
        expect(await testEndpoint(namespace, '/v1/sales/trending', {})).to.equal(200);
        expect(await testEndpoint(namespace, '/v1/suggestions', {
            asset_id: 10
        })).to.equal(416);
        expect(await testEndpoint(namespace, '/v1/suggestions', {
            collection_name: 'test',
            template_id: 1,
            schema_name: 'test'
        })).to.equal(200);
        expect(await testEndpoint(namespace, '/v1/avatar/test', {})).to.equal(200);
    }).timeout(10000);
});
