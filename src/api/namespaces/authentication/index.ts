import * as express from 'express';
import * as swagger from 'swagger-ui-express';
import * as fs from 'fs';

import { ApiNamespace } from '../interfaces';
import { HTTPServer } from '../../server';
import logger from '../../../utils/winston';
import { authenticationEndpoints } from './routes';

export type AuthenticationNamespaceArgs = {
    action: {
        account: string,
        name: string
    }
};

export class AuthenticationNamespace extends ApiNamespace {
    static namespaceName = 'authentication';

    args: AuthenticationNamespaceArgs;

    async init(): Promise<void> {
        try {
            await this.connection.database.query('SELECT * FROM auth_tokens LIMIT 1');
        } catch (e) {
            logger.info('Could not find Authentication tables. Create them now...');

            await this.connection.database.query(fs.readFileSync('./definitions/tables/authentication_tables.sql', {
                encoding: 'utf8'
            }));

            logger.info('AtomicAssets tables successfully created');
        }
    }

    async router(server: HTTPServer): Promise<express.Router> {
        const router = express.Router();

        const documentation: any = {
            swagger: '2.0',
            info: {
                description: this.buildDescription(server),
                version: '1.0.0',
                title: 'Authentication API'
            },
            host: server.config.server_name,
            basePath: this.path,
            schemes: ['https'],
            securityDefinitions: {
                bearerAuth: {
                    type: 'apiKey',
                    name: 'Authorization',
                    in: 'header'
                }
            },
            consumes: ['application/json'],
            produces: ['application/json'],
            tags: [],
            paths: {},
            definitions: {}
        };

        server.web.express.use(this.path + '/v1', server.web.limiter);

        const doc = authenticationEndpoints(this, server, router);

        Object.assign(documentation.paths, doc.paths);
        Object.assign(documentation.definitions, doc.definitions);

        logger.debug('authentication swagger docs', documentation);

        server.web.express.use(this.path + '/docs', swagger.serve, swagger.setup(documentation, {
            customCss: '.topbar { display: none; }',
            customCssUrl: 'https://cdn.jsdelivr.net/npm/swagger-ui-themes@3.0.0/themes/3.x/theme-flattop.min.css'
        }));

        return router;
    }

    async socket(server: HTTPServer): Promise<void> {

    }

    private buildDescription(server: HTTPServer): string {
        return '### EOSIO Contract API\n' +
            '*Made with ♥️ by [pink.network](https://pink.network/)*\n' +
            '#### Current Chain: ' + server.connection.chain.name + '\n' +
            `#### Provided by: [${server.config.provider_name}](${server.config.provider_url})`;
    }
}
