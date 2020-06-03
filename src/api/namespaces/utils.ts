import * as express from 'express';

export type FilterDefinition = {
    [key: string]: {
        type: 'string' | 'int' | 'float',
        min?: number,
        max?: number,
        default?: any,
        values?: any[]
    }
};

export function filterQueryArgs(req: express.Request, filter: FilterDefinition, keyType: string = 'query'): {[key: string]: any} {
    const keys = Object.keys(filter);
    const result: {[key: string]: any} = {};

    for (const key of keys) {
        // @ts-ignore
        const data = req[keyType] ? req[keyType][key] : undefined;

        if (typeof data !== 'string') {
            result[key] = filter[key].default;

            continue;
        }

        if (filter[key].type === 'string') {
            if (typeof filter[key].min === 'number' && data.length < filter[key].min) {
                result[key] = filter[key].default;

                continue;
            }

            if (typeof filter[key].max === 'number' && data.length > filter[key].max) {
                result[key] = filter[key].default;

                continue;
            }

            if (Array.isArray(filter[key].values) && filter[key].values.indexOf(data) === -1) {
                result[key] = filter[key].default;

                continue;
            }

            result[key] = data;
        } else if (filter[key].type === 'int' || filter[key].type === 'float') {
            const n = parseFloat(data);

            if (isNaN(n) || (!Number.isInteger(n) && filter[key].type === 'int')) {
                result[key] = filter[key].default;

                continue;
            }

            if (typeof filter[key].min === 'number' && n < filter[key].min) {
                result[key] = filter[key].default;

                continue;
            }

            if (typeof filter[key].max === 'number' && n > filter[key].max) {
                result[key] = filter[key].default;

                continue;
            }

            if (Array.isArray(filter[key].values) && filter[key].values.indexOf(n) === -1) {
                result[key] = filter[key].default;

                continue;
            }

            result[key] = n;
        }
    }

    return result;
}
