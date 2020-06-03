import * as express from 'express';
import * as fs from 'fs';
import * as swagger from 'swagger-ui-express';

import { ApiNamespace } from '../interfaces';
import { HTTPServer } from '../../server';
import logger from '../../../utils/winston';
import { webpushEndpoints } from './routes/webpush';
import { getOpenApiDescription } from '../../openapi';

export type AtomicHubNamespaceArgs = {
    atomicassets_contract: string,
    atomicmarket_contract: string,

    vapid_keys: {
        public: string,
        private: string
    }
};

export class AtomicHubNamespace extends ApiNamespace {
    static namespaceName = 'atomichub';

    args: AtomicHubNamespaceArgs;

    async init(): Promise<void> {
        try {
            await this.connection.database.query('SELECT * FROM atomichub_watchlist LIMIT 1');
        } catch (e) {
            logger.info('Could not find AtomicHub tables. Create them now...');

            await this.connection.database.query(fs.readFileSync('./definitions/tables/atomichub_tables.sql', {
                encoding: 'utf8'
            }));

            logger.info('AtomicHub tables successfully created');
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

        const doc = webpushEndpoints(this, server, router);

        Object.assign(documentation.paths, doc.paths);

        if (doc.tag) {
            documentation.tags.push(doc.tag);
        }

        logger.debug('AtomicHub swagger docs', documentation);

        server.web.express.use(this.path + '/docs', swagger.serve, swagger.setup(documentation, {
            customCss: '.topbar { display: none; }',
            customCssUrl: 'https://cdn.jsdelivr.net/npm/swagger-ui-themes@3.0.0/themes/3.x/theme-flattop.min.css'
        }));

        return router;
    }

    async socket(server: HTTPServer): Promise<void> {

    }
}
