import * as express from 'express';
import * as crypto from 'crypto';

import ConnectionManager from '../../../connections/manager';

type BearerTokenOptions = {
    handler?: (req: express.Request, res: express.Response, next: express.NextFunction) => any,
};

declare global {
    namespace Express {
        interface Request {
            authorizedAccount: string;
            bearerToken: string;
        }
    }
}

export function bearerToken(connection: ConnectionManager, options: BearerTokenOptions = {}): express.RequestHandler {
    return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
        const header = req.header('authorization');

        if (typeof header === 'string') {
            const token = header.split(' ');

            if (token.length >= 2 && token[0] === 'Bearer') {
                try {
                    const hash = crypto.createHash('sha256').update(Buffer.from(token[1], 'hex')).digest();

                    const query = await connection.database.query(
                        'SELECT account FROM auth_tokens WHERE "token" = $1 AND expire > $2',
                        [hash, Date.now()]
                    );

                    if (query.rowCount > 0) {
                        req.authorizedAccount = query.rows[0].account;
                        req.bearerToken = token[1];

                        return next();
                    }
                } catch (e) { }
            }
        }

        if (options.handler) {
            options.handler(req, res, next);
        } else {
            res.status(401);
            res.json({success: false, message: 'unauthorized'});
        }
    };
}
