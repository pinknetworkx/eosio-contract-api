import { RequestValues } from './utils';
import { isWeakFloat, isWeakInt, toInt } from '../../utils';
import { ApiError } from '../error';

type FilterType = 'string' | 'string[]' | 'int' | 'int[]' | 'float' | 'float[]' | 'bool' | 'bool[]' | 'name' | 'name[]';

type FilterDefinition = {
    type: FilterType,
    min?: number,
    max?: number,
    default?: any,
    allowedValues?: any[]
};

export type FiltersDefinition = {
    [key: string]: FilterDefinition
};
export type FilterValues = RequestValues;
export type FilteredValues = { [key: string]: any };

const string = (value: string, filter: FilterDefinition): string => {
    if (typeof filter.min === 'number' && value.length < filter.min) {
        throw Error();
    }

    if (typeof filter.max === 'number' && value.length > filter.max) {
        throw Error();
    }

    return value;
};

const int = (value: string, filter: FilterDefinition): number => {
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
};

const float = (value: string, filter: FilterDefinition): number => {
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
};

const bool = (value: string, _: FilterDefinition): boolean => {
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
};

const nameRE = /^[.1-5a-z]{1,12}[.1-5a-j]?$/;
const name = (value: string, _: FilterDefinition): string => {

    if (!nameRE.test(value)) {
        throw new Error();
    }

    return value;
};

const validationTypes: {[key: string]: (value: string, filter: FilterDefinition) => any} = {
    string,
    int,
    float,
    bool,
    name,
};

const typeRE = /^(?<type>\w+)(?<array>\[])?$/;
export function filterQueryArgs(values: FilterValues, filter: FiltersDefinition): FilteredValues {
    const keys: string[] = Object.keys(filter);
    const result: RequestValues = {};

    for (const key of keys) {
        const currentValue = values[key];
        const currentFilter = filter[key];

        const {type, array} = currentFilter.type.match(typeRE).groups;

        if (typeof currentValue !== 'string' || currentValue === '') {
            if (array && !Array.isArray(filter[key].default)) {
                result[key] = [];
            } else {
                result[key] = filter[key].default;
            }

            continue;
        }

        // eslint-disable-next-line no-inner-declarations
        function validateValue(value: string): any {
            const result = validationTypes[type](value, currentFilter);

            if (typeof result === 'undefined') {
                return array ? undefined : currentFilter.default;
            }

            if (currentFilter.allowedValues && !currentFilter.allowedValues.includes(result)) {
                throw new Error();
            }

            return result;
        }

        try {
            if (array) {
                result[key] = currentValue.split(',')
                    .map(validateValue)
                    .filter(x => typeof x !== 'undefined');
            } else {
                result[key] = validateValue(currentValue);
            }
        } catch (e) {
            throw new ApiError(`Invalid value for parameter ${key}`, 400);
        }
    }

    return result;
}
