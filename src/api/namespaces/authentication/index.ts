import * as express from 'express';
import * as swagger from 'swagger-ui-express';
import * as fs from 'fs';

import { ApiNamespace } from '../interfaces';
import { HTTPServer } from '../../server';
import logger from '../../../utils/winston';
import { authenticationEndpoints } from './routes';
import { getOpenApiDescription } from '../../docs';

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
        if (typeof this.args.action !== 'object') {
            throw new Error('Argument missing in authentication api namespace: action');
        }

        if (typeof this.args.action.account !== 'string') {
            throw new Error('Argument missing in authentication api namespace: action.account');
        }

        if (typeof this.args.action.name !== 'string') {
            throw new Error('Argument missing in authentication api namespace: action.name');
        }

        const existsQuery = await this.connection.database.query(
            'SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2)',
            [await this.connection.database.schema(), 'auth_tokens']
        );

        if (!existsQuery.rows[0].exists) {
            logger.info('Could not find Authentication tables. Create them now...');

            await this.connection.database.query(fs.readFileSync('./definitions/tables/authentication_tables.sql', {
                encoding: 'utf8'
            }));

            logger.info('Authentication tables successfully created');
        }
    }

    async router(server: HTTPServer): Promise<express.Router> {
        const router = express.Router();

        const documentation: any = {
            openapi: '3.0.0',
            info: {
                description: getOpenApiDescription(server),
                version: '1.0.0',
                title: 'Authentication API'
            },
            servers: [
                {url: 'https://' + server.config.server_name + this.path},
                {url: 'http://' + server.config.server_name + this.path}
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

        const doc = authenticationEndpoints(this, server, router);

        Object.assign(documentation.paths, doc.paths);

        if (doc.tag) {
            documentation.tags.push(doc.tag);
        }

        logger.debug('authentication swagger docs', documentation);

        server.web.express.use(this.path + '/docs', swagger.serve, swagger.setup(documentation, {
            customCss: '.topbar { display: none; }',
            customCssUrl: 'https://cdn.jsdelivr.net/npm/swagger-ui-themes@3.0.0/themes/3.x/theme-flattop.min.css'
        }));

        return router;
    }

    async socket(_: HTTPServer): Promise<void> {

    }
}
