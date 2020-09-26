import * as express from 'express';

export type FilterDefinition = {
    [key: string]: {
        type: 'string' | 'int' | 'float' | 'bool',
        min?: number,
        max?: number,
        default?: any,
        values?: any[]
    }
};

export function mergeRequestData(req: express.Request): {[key: string]: any} {
    return Object.assign({}, req.query || {}, req.body || {});
}

export function filterQueryArgs(req: express.Request, filter: FilterDefinition, keyType: string = null): {[key: string]: any} {
    const keys = Object.keys(filter);
    const result: {[key: string]: any} = {};
    const merged = mergeRequestData(req);

    for (const key of keys) {
        let data;
        if (keyType) {
            // @ts-ignore
            data = req[keyType] ? req[keyType][key] : undefined;
        } else {
            data = merged[key];
        }

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
                result[key] = filter[key].max;

                continue;
            }

            if (Array.isArray(filter[key].values) && filter[key].values.indexOf(n) === -1) {
                result[key] = filter[key].default;

                continue;
            }

            result[key] = n;
        } else if (filter[key].type === 'bool') {
            if (typeof data === 'undefined') {
                result[key] = filter[key].default || false;
            }

            if (data === 'true' || data === '1') {
                result[key] = true;

                continue;
            }

            if (data === 'false' || data === '0') {
                result[key] = false;

                continue;
            }

            result[key] = !!data;
        }
    }

    return result;
}

export function buildBoundaryFilter(
    req: express.Request, varOffset: number,
    primaryColumn: string, primaryType: 'string' | 'int',
    dateColumn: string | null, blockColumn: string | null
): {values: any[], str: string} {
    const args = filterQueryArgs(req, {
        lower_bound: {type: primaryType, min: 1},
        upper_bound: {type: primaryType, min: 1},
        before: {type: 'int', min: 1},
        after: {type: 'int', min: 1},
        ids: {type: 'string', min: 1}
    });

    let queryString = '';
    const queryValues: any[] = [];
    let varCounter = varOffset;

    const timeThreshold = new Date('1.1.2000').getTime();

    if (primaryColumn && args.ids) {
        queryString += 'AND ' + primaryColumn + ' = ANY ($' + ++varCounter + ') ';
        queryValues.push(args.ids.split(','));
    }

    if (primaryColumn && args.lower_bound) {
        queryString += 'AND ' + primaryColumn + ' >= $' + ++varCounter + ' ';
        queryValues.push(args.lower_bound);
    }

    if (primaryColumn && args.upper_bound) {
        queryString += 'AND ' + primaryColumn + ' < $' + ++varCounter + ' ';
        queryValues.push(args.upper_bound);
    }

    if (args.before) {
        if (dateColumn && args.before > timeThreshold) {
            queryString += 'AND ' + dateColumn + ' < $' + ++varCounter + ' ';
            queryValues.push(args.before);
        } else if (blockColumn) {
            queryString += 'AND ' + blockColumn + ' < $' + ++varCounter + ' ';
            queryValues.push(args.before);
        }
    }

    if (args.after) {
        if (dateColumn && args.after > timeThreshold) {
            queryString += 'AND ' + dateColumn + ' > $' + ++varCounter + ' ';
            queryValues.push(args.after);
        } else if (blockColumn) {
            queryString += 'AND ' + blockColumn + ' > $' + ++varCounter + ' ';
            queryValues.push(args.after);
        }
    }

    return {
        values: queryValues,
        str: queryString
    };
}
