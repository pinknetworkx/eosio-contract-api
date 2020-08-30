import * as express from 'express';

import { AtomicHubNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { filterQueryArgs } from '../../utils';
import { getOpenAPI3Responses } from '../../../docs';
import logger from '../../../../utils/winston';

export function webpushEndpoints(_: AtomicHubNamespace, server: HTTPServer, router: express.Router): any {
    router.post('/v1/webpush', async (req, res) => {
        const args = filterQueryArgs(req, {
            account: {type: 'string', min: 1, max: 12},
            url: {type: 'string', min: 1, max: 256},
            public_key: {type: 'string', min: 1, max: 256},
            secret: {type: 'string', min: 1, max: 256}
        }, 'body');

        if (!args.account || !args.url || !args.public_key || !args.secret) {
            return res.status(500).json({success: false, message: 'Invalid data provided'});
        }

        try {
            const exists = await server.query(
                'SELECT account FROM atomichub_browsers WHERE account = $1 AND url = $2 AND public_key = $3 AND secret = $4',
                [args.account, args.url, args.public_key, args.secret]
            );

            if (exists.rows.length > 0) {
                return res.status(416).json({success: false, data: 'Entry already exists'});
            }

            await server.query(
                'INSERT INTO atomichub_browsers (account, url, public_key, secret, created) VALUES ($1, $2, $3, $4, $5)',
                [args.account, args.url, args.public_key, args.secret, Date.now()]
            );

            return res.json({success: true, data: null});
        } catch (e) {
            return res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    return {
        tag: {
            name: 'webpush',
            description: 'WebPush'
        },
        paths: {
            '/v1/webpush': {
                post: {
                    tags: ['webpush'],
                    summary: 'Get browser notifications for certain events of an account',
                    requestBody: {
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        account: {type: 'string'},
                                        url: {type: 'string'},
                                        public_key: {type: 'string'},
                                        secret: {type: 'string'}
                                    }
                                },
                                example: {
                                    account: 'Account name where you want to receive notifications',
                                    url: 'https://fcm.googleapis.com/fcm/send/...',
                                    public_key: 'F84L28x4d_cd8HwUOoeNHBjT-5djL8tJvLHIrvX0zJOrGcMsvcnPla_uXcTQpoDxxDYEPzB32BDCFB50O013Kfu',
                                    secret: 'Jfk89snJ4J5aNkFgp_gSYU'
                                }
                            }
                        }
                    },
                    responses: getOpenAPI3Responses([200, 500], {type: 'object', nullable: true})
                }
            }
        }
    };
}
