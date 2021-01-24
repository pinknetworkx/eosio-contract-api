import { AttributeMap } from './types/actions';

export function convertAttributeMapToObject(data: AttributeMap): {[key: string]: string} {
    const result: {[key: string]: string} = {};
    for (const row of data) {
        if (['uint64', 'int64'].indexOf(row.value[0]) >= 0) {
            result[row.key] = String(row.value[1]);
        } else if (['INT64_VEC', 'UINT64_VEC'].indexOf(row.value[0]) >= 0) {
            result[row.key] = row.value[1].map((data: number) => String(data));
        } else {
            result[row.key] = row.value[1];
        }
    }

    return result;
}
