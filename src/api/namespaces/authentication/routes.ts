import * as express from 'express';
// @ts-ignore
import * as ecc from 'eosjs-ecc';
import * as crypto from 'crypto';

import { AuthenticationNamespace } from './index';
import { HTTPServer } from '../../server';
import logger from '../../../utils/winston';
import { bearerToken } from './middleware';
import { getOpenAPI3Responses } from '../../docs';

export function authenticationEndpoints(core: AuthenticationNamespace, server: HTTPServer, router: express.Router): any {
    router.post('/v1/token', (async (req, res) => {
        const blockNum: number = parseInt(req.body.block_num, 10);

        if (isNaN(blockNum) || blockNum <= 0) {
            return res.status(500).json({success: false, message: 'Invalid block num received'});
        }

        if (typeof req.body.nonce !== 'string' || req.body.nonce.length > 64) {
            return res.status(500).json({success: false, message: 'Invalid nonce provided'});
        }

        if (typeof req.body.account !== 'string' || req.body.nonce.account > 12) {
            return res.status(500).json({success: false, message: 'Invalid account name provided'});
        }

        if (typeof req.body.permission !== 'string' || req.body.nonce.permission > 12) {
            return res.status(500).json({success: false, message: 'Invalid permission name provided'});
        }

        if (!Array.isArray(req.body.signatures)) {
            return res.status(500).json({success: false, message: 'Invalid signatures provided'});
        }

        const nonce: string = String(req.body.nonce);
        const account: string = String(req.body.account);
        const permission: string = String(req.body.permission);
        const signatures: string[] = req.body.signatures.map((signature: any) => String(signature));

        try {
            const nonceQuery = await server.connection.database.query(
                'SELECT nonce FROM auth_tokens WHERE nonce = $1',
                [Buffer.from(nonce, 'utf8')]
            );

            if (nonceQuery.rowCount > 0) {
                return res.status(500).json({success: false, message: 'Nonce already used'});
            }

            const block = await server.connection.chain.rpc.get_block(blockNum);

            if (Date.now() - new Date(block.timestamp + '+0000').getTime() > 3600 * 24 * 1000) {
                return res.status(500).json({success: false, message: 'Reference block older than a day'});
            }

            const transaction = {
                actions: [{
                    account: core.args.action.account,
                    name: core.args.action.name,
                    authorization: [{
                        actor: account,
                        permission: permission
                    }],
                    data: {
                        nonce: nonce
                    }
                }],
                expiration: block.timestamp,
                ref_block_num: block.block_num & 0xffff,
                ref_block_prefix: block.ref_block_prefix
            };

            const tx = await core.connection.chain.api.transact(transaction, {broadcast: false, sign: false});
            const plaintext = Buffer.concat([
                Buffer.from(core.connection.chain.chainId, 'hex'),
                Buffer.from(tx.serializedTransaction),
                Buffer.from(new Uint8Array(32))
            ]);

            const availableKeys = [];

            for (const signature of signatures) {
                availableKeys.push(ecc.recover(signature, plaintext));
            }

            const resp = await server.connection.chain.post('/v1/chain/get_required_keys', {transaction, available_keys: availableKeys});

            if (resp.error && resp.error.code) {
                return res.json({success: false, message: 'Authentication failed'});
            }

            const token = crypto.randomBytes(32);
            const expire = Date.now() + 24 * 3600 * 30 * 1000;

            const hash = crypto.createHash('sha256').update(token).digest();

            await core.connection.database.query(
                'INSERT INTO auth_tokens (token, account, nonce, created, expire) VALUES ($1, $2, $3, $4, $5)',
                [hash, account, Buffer.from(nonce, 'utf8'), Date.now(), expire]
            );

            return res.json({
                success: true,
                data: {
                    token: token.toString('hex'),
                    expire: expire
                }
            });
        } catch (e) {
            logger.error(e);

            return res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    }));

    router.delete('/v1/token', bearerToken(server.connection), async (req, res) => {
        await core.connection.database.query(
            'UPDATE auth_tokens SET expire = $1 WHERE token = $2',
            [Date.now() - 1000, crypto.createHash('sha256').update(Buffer.from(req.bearerToken, 'hex')).digest()]
        );

        res.json({success: true, data: null});
    });

    return {
        tag: {
            name: 'authentication',
            description: 'Authentication'
        },
        paths: {
            '/v1/token': {
                post: {
                    tags: ['authentication'],
                    summary: 'Create Bearer Tokens for authentication',
                    requestBody: {
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        account: {type: 'string'},
                                        block_num: {type: 'number'},
                                        nonce: {type: 'string'},
                                        permission: {type: 'string'},
                                        signatures: {type: 'array', items: {type: 'string'}}
                                    }
                                },
                                example: {
                                    account: 'account',
                                    block_num: 'number',
                                    nonce: 'string',
                                    permission: 'string',
                                    signatures: ['signature']
                                }
                            }
                        }
                    },
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'object',
                        properties: {
                            token: {type: 'string'},
                            expire: {type: 'number'}
                        }
                    })
                },
                delete: {
                    tags: ['authentication'],
                    security: [
                        {bearerAuth: []}
                    ],
                    summary: 'Revoke existing token',
                    responses: getOpenAPI3Responses([200, 401, 500], {type: 'object', nullable: true})
                }
            }
        }
    };
}
