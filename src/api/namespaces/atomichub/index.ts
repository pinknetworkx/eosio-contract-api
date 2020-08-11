import * as express from 'express';
import * as swagger from 'swagger-ui-express';
import * as path from 'path';

import { ApiNamespace } from '../interfaces';
import { HTTPServer } from '../../server';
import logger from '../../../utils/winston';
import { webpushEndpoints } from './routes/webpush';
import { getOpenApiDescription } from '../../docs';
import { notificationsEndpoints, notificationsSockets } from './routes/notification';
import { watchlistEndpoints } from './routes/watchlist';
import { statsEndpoints } from './routes/stats';
import { utilsEndpoints } from './routes/utils';
import { atomicmarketComponents } from '../atomicmarket/openapi';

export type AtomicHubNamespaceArgs = {
    atomicassets_account: string,
    atomicmarket_account: string,

    default_symbol: string,
    connected_reader: string,

    ipfs_node: string,

    vapid_keys: {
        public: string,
        private: string
    },

    notification_title: string,

    avatar: {
        enable: boolean,
        contract: {
            code: string,
            table: string,
            scope: string
        },
        ipfs_key_name: string,
        default: string
    }
};

export class AtomicHubNamespace extends ApiNamespace {
    static namespaceName = 'atomichub';

    args: AtomicHubNamespaceArgs;

    async init(): Promise<void> {
        if (typeof this.args.atomicassets_account !== 'string') {
            throw new Error('Argument missing in atomichub api namespace: atomicassets_account');
        }

        if (typeof this.args.atomicmarket_account !== 'string') {
            throw new Error('Argument missing in atomichub api namespace: atomicmarket_account');
        }

        if (typeof this.args.default_symbol !== 'string') {
            throw new Error('Argument missing in atomichub api namespace: default_symbol');
        }

        if (
            typeof this.args.vapid_keys !== 'object' ||
            typeof this.args.vapid_keys.private !== 'string' ||
            typeof this.args.vapid_keys.public !== 'string'
        ) {
            throw new Error('Argument missing or invalid in atomichub api namespace: vapid_keys');
        }

        if (typeof this.args.notification_title !== 'string') {
            throw new Error('Argument missing in atomichub api namespace: notification_title');
        }

        if (typeof this.args.ipfs_node !== 'string') {
            throw new Error('Argument missing in atomichub api namespace: ipfs_node');
        }

        if (
            typeof this.args.avatar !== 'object' ||
            typeof this.args.avatar.enable !== 'boolean' ||
            typeof this.args.avatar.ipfs_key_name !== 'string' ||
            typeof this.args.avatar.default !== 'string' ||
            typeof this.args.avatar.contract !== 'object' ||
            typeof this.args.avatar.contract.code !== 'string' ||
            typeof this.args.avatar.contract.table !== 'string' ||
            typeof this.args.avatar.contract.scope !== 'string'
        ) {
            throw new Error('Argument missing or invalid in atomichub api namespace: avatar');
        }
    }

    async router(server: HTTPServer): Promise<express.Router> {
        const router = express.Router();

        const documentation: any = {
            openapi: '3.0.0',
            info: {
                description: getOpenApiDescription(server),
                version: '1.0.0',
                title: 'AtomicHub API'
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
                schemas: {
                    Sale: atomicmarketComponents.Sale,
                    Auction: atomicmarketComponents.Auction,
                    Asset: atomicmarketComponents.Asset,
                    ListingAsset: atomicmarketComponents.ListingAsset
                }
            }
        };

        server.web.express.use(this.path + '/v1', server.web.limiter);

        const docs = [];

        docs.push(notificationsEndpoints(this, server, router));
        docs.push(watchlistEndpoints(this, server, router));
        docs.push(statsEndpoints(this, server, router));
        docs.push(webpushEndpoints(this, server, router));
        docs.push(utilsEndpoints(this, server, router));

        for (const doc of docs) {
            Object.assign(documentation.paths, doc.paths);

            if (doc.tag) {
                documentation.tags.push(doc.tag);
            }
        }

        logger.debug('AtomicHub swagger docs', documentation);

        server.web.express.use(this.path + '/docs', express.static(path.resolve(__dirname, '../../../../docs/atomichub')));

        server.web.express.use(this.path + '/docs/swagger', swagger.serve, swagger.setup(documentation, {
            customCss: '.topbar { display: none; }',
            customCssUrl: 'https://cdn.jsdelivr.net/npm/swagger-ui-themes@3.0.0/themes/3.x/theme-flattop.min.css'
        }));

        return router;
    }

    async socket(server: HTTPServer): Promise<void> {
        notificationsSockets(this, server);
    }
}
