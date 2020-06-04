import * as express from 'express';
import * as swagger from 'swagger-ui-express';

import { ApiNamespace } from '../interfaces';
import { HTTPServer } from '../../server';
import logger from '../../../utils/winston';
import { webpushEndpoints } from './routes/webpush';
import { getOpenApiDescription } from '../../openapi';
import { notificationsEndpoints, notificationsSockets } from './routes/notification';
import { watchlistEndpoints } from './routes/watchlist';

export type AtomicHubNamespaceArgs = {
    atomicassets_contract: string,
    atomicmarket_contract: string,

    vapid_keys: {
        public: string,
        private: string
    },

    notification_title: string
};

export class AtomicHubNamespace extends ApiNamespace {
    static namespaceName = 'atomichub';

    args: AtomicHubNamespaceArgs;

    async init(): Promise<void> {
        if (typeof this.args.atomicassets_contract !== 'string') {
            throw new Error('Argument missing in atomichub api namespace: atomicassets_contract');
        }

        if (typeof this.args.atomicmarket_contract !== 'string') {
            throw new Error('Argument missing in atomichub api namespace: atomicmarket_contract');
        }

        if (
            typeof this.args.vapid_keys !== 'object' ||
            typeof this.args.vapid_keys.private !== 'string' ||
            typeof this.args.vapid_keys.public !== 'string'
        ) {
            throw new Error('Argument missing in atomichub api namespace: vapid_keys');
        }

        if (typeof this.args.notification_title !== 'string') {
            throw new Error('Argument missing in atomichub api namespace: notification_title');
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
                {url: 'https://' + server.config.server_name + this.path}
            ],
            tags: [],
            paths: {},
            components: {
                securitySchemes: {
                    bearerAuth: {
                        type: 'http',
                        scheme: 'bearer'
                    }
                }
            }
        };

        server.web.express.use(this.path + '/v1', server.web.limiter);

        const docs = [];

        docs.push(webpushEndpoints(this, server, router));
        docs.push(notificationsEndpoints(this, server, router));
        docs.push(watchlistEndpoints(this, server, router));

        for (const doc of docs) {
            Object.assign(documentation.paths, doc.paths);

            if (doc.tag) {
                documentation.tags.push(doc.tag);
            }
        }

        logger.debug('AtomicHub swagger docs', documentation);

        server.web.express.use(this.path + '/docs', swagger.serve, swagger.setup(documentation, {
            customCss: '.topbar { display: none; }',
            customCssUrl: 'https://cdn.jsdelivr.net/npm/swagger-ui-themes@3.0.0/themes/3.x/theme-flattop.min.css'
        }));

        return router;
    }

    async socket(server: HTTPServer): Promise<void> {
        notificationsSockets(this, server);
    }
}
