import * as express from 'express';
import fetch from 'node-fetch';

import { AtomicHubNamespace } from '../index';
import { HTTPServer } from '../../../server';
import logger from '../../../../utils/winston';

export function utilsEndpoints(core: AtomicHubNamespace, server: HTTPServer, router: express.Router): any {
    router.get('/v1/avatar/:account', server.web.caching({expire: 60}), async (req, res) => {
        try {
            const resp = await core.connection.chain.rpc.get_table_rows({
                json: true, ...core.args.avatar.contract, lower_bound: req.params.account, upper_bound: req.params.account
            });

            if (resp.rows.length > 0) {
                const url = core.args.ipfs_node + '/ipfs/' + resp.rows[0][core.args.avatar.ipfs_key_name];

                const ipfsImage = await fetch(url, {
                    timeout: 5000,
                    size: 5 * 1024 * 1024
                });

                if (['image/png', 'image/jpeg'].indexOf(ipfsImage.headers.get('content-type')) >= 0) {
                    return res.contentType(ipfsImage.headers.get('content-type'))
                        .send(Buffer.from(await ipfsImage.arrayBuffer()));
                }
            }
        } catch (e) {
            logger.debug('Avatar error', e);
        }

        const defaultImage = await fetch(core.args.avatar.default);

        return res.contentType(defaultImage.headers.get('content-type'))
            .send(Buffer.from(await defaultImage.arrayBuffer()));
    });

    return {
        tag: {
            name: 'utils',
            description: 'Utilities'
        },
        paths: {
            '/v1/avatar/{account}': {
                get: {
                    tags: ['utils'],
                    summary: 'Get the avatar from a specific user by name',
                    parameters: [
                        {
                            in: 'path',
                            name: 'account',
                            required: true,
                            schema: {type: 'string'},
                            description: 'Account Name'
                        }
                    ],
                    responses: {
                        '200': {
                            description: 'OK',
                            content: {
                                'image/png': { },
                                'image/jpeg': { }
                            }
                        }
                    }
                }
            }
        }
    };
}
