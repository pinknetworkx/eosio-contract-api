import * as express from 'express';
import QueryBuilder from '../builder';
import { filterQueryArgs, FilterValues } from './validation';

export type SortColumn = {column: string, nullable?: boolean, numericIndex?: boolean};
export type SortColumnMapping = {[key: string]: SortColumn};

export type RequestValues = {[key: string]: any};

export function mergeRequestData(req: express.Request): RequestValues {
    return {...req.query, ...req.body};
}

export function buildBoundaryFilter(
    values: FilterValues, query: QueryBuilder,
    primaryColumn: string, primaryType: 'string' | 'int',
    dateColumn: string | null
): void {
    const args = filterQueryArgs(values, {
        lower_bound: {type: primaryType, min: 1},
        upper_bound: {type: primaryType, min: 1},
        before: {type: 'int', min: 1},
        after: {type: 'int', min: 1},
        ids: {type: 'string', min: 1}
    });

    if (primaryColumn && args.ids) {
        query.equalMany(primaryColumn, args.ids.split(','));
    }

    if (primaryColumn && args.lower_bound) {
        query.addCondition(primaryColumn + ' >= ' + query.addVariable(args.lower_bound));
    }

    if (primaryColumn && args.upper_bound) {
        query.addCondition(primaryColumn + ' < ' + query.addVariable(args.upper_bound));
    }

    if (dateColumn && args.before) {
        query.addCondition(dateColumn + ' < ' + query.addVariable(args.before) + '::BIGINT');
    }

    if (dateColumn && args.after) {
        query.addCondition(dateColumn + ' > ' + query.addVariable(args.after) + '::BIGINT');
    }
}
