import * as express from 'express';
import * as NodeRedis from 'redis';

import logger from './winston';

export type ExpressRedisCacheOptions = { contentType?: string, whitelistedIPs?: string[] };
export type ExpressRedisCacheHandler = (options: ExpressRedisCacheOptions) => express.RequestHandler;

export function expressRedisCache(redis: NodeRedis.RedisClient, prefix: string, expire: number, whitelistedIPs?: string[]): ExpressRedisCacheHandler {
    return (options: ExpressRedisCacheOptions = { }) => {
        return (req: express.Request, res: express.Response, next: express.NextFunction) => {
            if (expire === 0) {
                return next();
            }

            if (options.whitelistedIPs && options.whitelistedIPs.indexOf(req.ip) >= 0) {
                return next();
            }

            if (whitelistedIPs && whitelistedIPs.indexOf(req.ip) >= 0) {
                return next();
            }

            const key = prefix + ':' + req.originalUrl;

            redis.get(key, (_, reply) => {
                if (reply === null) {
                    const sendFn = res.send.bind(res);

                    res.send = (data): express.Response => {
                        sendFn(data);

                        const buffer = Buffer.from(data, 'utf8');

                        redis.set(key, buffer.toString('base64'), () => {
                            redis.expire(key, Math.round(expire));

                            logger.debug('Cache API request');
                        });

                        return res;
                    };

                    next();
                } else {
                    logger.debug('API request was cached, returning cached version');

                    const buffer = Buffer.from(reply, 'base64');

                    if (options.contentType) {
                        res.contentType(options.contentType);
                    }

                    res.status(200).send(buffer.toString('utf8'));
                }
            });
        };
    };
}
