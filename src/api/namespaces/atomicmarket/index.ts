import * as express from 'express';
import * as path from 'path';
import * as swagger from 'swagger-ui-express';

import { ApiNamespace } from '../interfaces';
import { HTTPServer } from '../../server';
import { getOpenApiDescription } from '../../docs';
import { AssetApi } from '../atomicassets/routes/assets';
import { OfferApi } from '../atomicassets/routes/offers';
import { TransferApi } from '../atomicassets/routes/transfers';
import logger from '../../../utils/winston';
import { auctionsEndpoints, auctionSockets } from './routes/auctions';
import { salesEndpoints, salesSockets } from './routes/sales';
import { atomicmarketComponents } from './openapi';
import { configEndpoints } from './routes/config';
import { marketplacesEndpoints } from './routes/marketplaces';
import { formatOffer, formatTransfer } from '../atomicassets/format';
import { formatListingAsset } from './format';
import { pricesEndpoints } from './routes/prices';
import { statsEndpoints } from './routes/stats';

export type AtomicMarketNamespaceArgs = {
    atomicmarket_account: string
    // optional
    atomicassets_account: string,
    delphioracle_account: string,

    connected_reader: string
};

export enum SaleApiState {
    WAITING = 0,
    LISTED = 1,
    CANCELED = 2,
    SOLD = 3,
    INVALID = 4
}

export enum AuctionApiState {
    WAITING = 0, // Auction created but assets were not transferred yet
    LISTED = 1, // Auction pending and open to bids
    CANCELED = 2, // Auction was canceled
    SOLD = 3, // Auction has been sold
    INVALID = 4 // Auction ended but no bid was made
}

export class AtomicMarketNamespace extends ApiNamespace {
    static namespaceName = 'atomicmarket';

    args: AtomicMarketNamespaceArgs;

    async init(): Promise<void> {
        if (typeof this.args.atomicmarket_account !== 'string') {
            throw new Error('Argument missing in atomicmarket api namespace: atomicmarket_account');
        }

        const query = await this.connection.database.query(
            'SELECT * FROM atomicmarket_config WHERE market_contract = $1',
            [this.args.atomicmarket_account]
        );

        if (query.rowCount === 0) {
            if (typeof this.args.atomicassets_account !== 'string' || typeof this.args.delphioracle_account !== 'string') {
                throw new Error('AtomicMarket API is not initialized yet (reader not running)');
            }
        } else {
            this.args.atomicassets_account = query.rows[0].assets_contract;
            this.args.delphioracle_account = query.rows[0].delphi_contract;
        }
    }

    async router(server: HTTPServer): Promise<express.Router> {
        const router = express.Router();

        const documentation: any = {
            openapi: '3.0.0',
            info: {
                description: getOpenApiDescription(server),
                version: '1.0.0',
                title: 'AtomicMarket API'
            },
            servers: [
                {url: 'https://' + server.config.server_name + this.path},
                {url: 'http://' + server.config.server_name + this.path}
            ],
            tags: [],
            paths: {},
            components: {
                securitySchemes: {
                    adminAuth: {
                        type: 'http',
                        scheme: 'bearer'
                    }
                },
                schemas: atomicmarketComponents
            }
        };

        server.web.express.use(this.path + '/v1', server.web.limiter);

        const docs = [];

        docs.push(salesEndpoints(this, server, router));
        docs.push(auctionsEndpoints(this, server, router));
        docs.push(marketplacesEndpoints(this, server, router));
        docs.push(pricesEndpoints(this, server, router));
        docs.push(statsEndpoints(this, server, router));
        docs.push(configEndpoints(this, server, router));

        const assetApi = new AssetApi(
            this, server, 'ListingAsset',
            'atomicmarket_assets_master', formatListingAsset
        );
        const transferApi = new TransferApi(
            this, server, 'ListingTransfer',
            'atomicassets_transfers_master', formatTransfer,
            'atomicmarket_assets_master', formatListingAsset
        );
        const offerApi = new OfferApi(
            this, server, 'ListingOffer',
            'atomicassets_offers_master', formatOffer,
            'atomicmarket_assets_master', formatListingAsset
        );

        docs.push(assetApi.endpoints(router));
        docs.push(transferApi.endpoints(router));
        docs.push(offerApi.endpoints(router));

        for (const doc of docs) {
            Object.assign(documentation.paths, doc.paths);

            if (doc.tag) {
                documentation.tags.push(doc.tag);
            }
        }

        logger.debug('atomicmarket swagger docs', documentation);

        server.web.express.use(this.path + '/docs', express.static(path.resolve(__dirname, '../../../../docs/atomicmarket')));

        server.web.express.use(this.path + '/docs/swagger', swagger.serve, swagger.setup(documentation, {
            customCss: '.topbar { display: none; }',
            customCssUrl: 'https://cdn.jsdelivr.net/npm/swagger-ui-themes@3.0.0/themes/3.x/theme-flattop.min.css'
        }));

        return router;
    }

    async socket(server: HTTPServer): Promise<void> {
        salesSockets(this, server);
        auctionSockets(this, server);

        const chainChannelName = [
            'eosio-contract-api', this.connection.chain.name, this.args.connected_reader, 'chain'
        ].join(':');
        this.connection.redis.ioRedisSub.subscribe(chainChannelName, () => {
            this.connection.redis.ioRedisSub.on('message', async (channel, message) => {
                if (channel !== chainChannelName) {
                    return;
                }

                const msg = JSON.parse(message);

                if (msg.action === 'fork') {
                    server.socket.io.sockets.emit('fork', {block_num: msg.block_num});
                }
            });
        });
    }
}
