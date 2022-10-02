import { RequestValues } from './utils';
import { isWeakFloat, isWeakInt, toInt } from '../../utils';
import { ApiError } from '../error';

type FilterType = 'string' | 'string[]' | 'list[string]'
    | 'int' | 'int[]'
    | 'float' | 'float[]'
    | 'bool' | 'bool[]'
    | 'name' | 'name[]' | 'list[name]'
    | 'id' | 'id[]' | 'list[id]';

export type FilterDefinition = {
    type: FilterType,
    min?: number,
    max?: number,
    default?: any,
    allowedValues?: string[]
};

export type FiltersDefinition = {
    [key: string]: FilterDefinition
};
export type FilterValues = RequestValues;
export type FilteredValues<T> = Record<keyof T, any>;

type ValidationFunction = (values: string[], filter: FilterDefinition) => Promise<any[]>;

const validationTypes: {[key: string]: ValidationFunction} = {};

export function addValidationType(name: string, func: ValidationFunction): void {
    validationTypes[name] = func;
}

export async function validateString(values: string[], filter: FilterDefinition): Promise<string[]> {
    return values.map(value => {
        if (typeof filter.min === 'number' && value.length < filter.min) {
            throw Error();
        }

        if (typeof filter.max === 'number' && value.length > filter.max) {
            throw Error();
        }

        if (filter.allowedValues && !filter.allowedValues.includes(value)) {
            throw new Error();
        }

        return value;
    });
}
addValidationType('string', validateString);

async function validateInt(values: string[], filter: FilterDefinition): Promise<number[]> {
    return values.map(value => {
        const n = toInt(value);

        if (!isWeakInt(value) || isNaN(n)) {
            throw new Error();
        }

        if (typeof filter.min === 'number' && n < filter.min) {
            throw new Error();
        }

        if (typeof filter.max === 'number' && n > filter.max) {
            throw new Error();
        }

        return n;
    });
}
addValidationType('int', validateInt);

export async function validateId(values: string[]): Promise<string[]> {
    return values.map(value => {
        if (value.toLowerCase() === 'null') {
            return 'null';
        }

        if (!isWeakInt(value)) {
            throw new Error();
        }

        return value;
    });
}
addValidationType('id', validateId);

async function validateFloat(values: string[], filter: FilterDefinition): Promise<number[]> {
    return values.map(value => {
        const n = parseFloat(value);

        if (!isWeakFloat(value) || isNaN(n)) {
            throw new Error();
        }

        if (typeof filter.min === 'number' && n < filter.min) {
            throw new Error();
        }

        if (typeof filter.max === 'number' && n > filter.max) {
            throw new Error();
        }

        return n;
    });
}
addValidationType('float', validateFloat);

async function validateBool(values: string[]): Promise<boolean[]> {
    return values.map(value => {
        if (value === 'true' || value === '1') {
            return true;
        }
        if (value === 'false' || value === '0') {
            return false;
        }

        if (value === 'empty') {
            return undefined;
        }

        throw new Error();
    });
}
addValidationType('bool', validateBool);

const nameRE = /^[.1-5a-z]{1,12}[.1-5a-j]?$/;
export async function validateName(values: string[]): Promise<string[]> {
    return values.map(value => {

        if (!nameRE.test(value)) {
            throw new Error();
        }

        return value;
    });
}
addValidationType('name', validateName);

const typeRE = /^(?<type>\w+)(?<array>\[(?<innerType>[^\]]*)])?$/;
export function parseTypeString(typeString: string): {type: string, array: boolean, innerType?: string} {
    const {type, array, innerType} = typeString.match(typeRE).groups;

    return {type, array: !!array, innerType};
}

export async function filterQueryArgs<T extends FiltersDefinition>(values: {[K in keyof T]?: any}, filter: T): Promise<FilteredValues<T>> {
    const keys: (keyof T)[] = Object.keys(filter);
    const result: FilteredValues<T> = {} as FilteredValues<T>;

    for (const key of keys) {
        const currentValue = values[key];
        const currentFilter = filter[key];

        const {array} = parseTypeString(currentFilter.type);

        if (typeof currentValue !== 'string' || currentValue === '') {
            if (array && !Array.isArray(filter[key].default)) {
                result[key] = [];
            } else {
                result[key] = filter[key].default;
            }

            continue;
        }

        try {
            if (array) {
                result[key] = await validateValues(currentValue.split(','), currentFilter);
            } else {
                result[key] = (await validateValues([currentValue], currentFilter))[0];
            }
        } catch (e) {
            throw new ApiError(`Invalid value for parameter ${key}`, 400);
        }
    }

    return result;
}

async function validateValues(values: string[], filter: FilterDefinition): Promise<any[]> {
    const {type, array} = parseTypeString(filter.type);

    const result = await validationTypes[type](values, filter);

    if (array) {
        return result.filter(x => x !== undefined);
    } else if (result[0] === undefined) {
        return [filter.default];
    }

    return result;
}
