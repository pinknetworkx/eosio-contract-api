import { isWeakIntArray } from '../utils';

export default class QueryBuilder {
    private baseQuery: string;

    private conditions: string[];
    private aggregations: string[];
    private ending: string;

    private values: any[];
    private varCounter: number;

    constructor(query: string, values: any[] = []) {
        this.values = values;
        this.varCounter = this.values.length;

        this.baseQuery = query;
        this.conditions = [];
        this.aggregations = [];
        this.ending = '';
    }

    addVariable(value: any): string {
        this.values.push(value);

        return '$' + ++this.varCounter;
    }

    join(tableA: string, tableB: string, columns: string[]): QueryBuilder {
        for (const column of columns) {
            this.conditions.push(tableA + '.' + column + ' = ' + tableB + '.' + column);
        }

        return this;
    }

    equal(column: string, value: any): QueryBuilder {
        this.conditions.push(column + ' = ' + this.addVariable(value));

        return this;
    }

    unequal(column: string, value: any): QueryBuilder {
        this.conditions.push(column + ' != ' + this.addVariable(value));

        return this;
    }

    equalMany(column: string, values: any[]): QueryBuilder {
        if (!Array.isArray(values)) {
            throw new Error('equalMany only accepts arrays as value');
        }

        if (values.length === 1) {
            return this.equal(column, values[0]);
        }

        if (values.length > 10) {
            this.conditions.push(`EXISTS (SELECT FROM UNNEST(${this.addVariable(values)}::${isWeakIntArray(values) ? 'BIGINT' : 'TEXT'}[]) u(c) WHERE u.c = ${column})`);
        } else {
            this.conditions.push(`${column} = ANY(${this.addVariable(values)})`);
        }

        return this;
    }

    notMany(column: string, values: any[], includeNull: boolean = false): QueryBuilder {
        if (!Array.isArray(values)) {
            throw new Error('notMany only accepts arrays as value');
        }

        const queryString: string[] = [];

        if (values.length === 1) {
            return this.unequal(column, values[0]);
        }

        if (values.length > 10) {
            queryString.push(`NOT EXISTS (SELECT FROM UNNEST(${this.addVariable(values)}::${isWeakIntArray(values) ? 'BIGINT' : 'TEXT'}[]) u(c) WHERE u.c = ${column})`);
        } else {
            queryString.push(`${column} != ALL(${this.addVariable(values)})`);
        }

        if (includeNull) {
            queryString.push(`${column} IS NULL`);
        }

        this.conditions.push(`(${queryString.join(' OR ')})`);

        return this;
    }

    notNull(column: string): QueryBuilder {
        this.conditions.push(column + ' IS NOT NULL');

        return this;
    }

    isNull(column: string): QueryBuilder {
        this.conditions.push(column + ' IS NULL');

        return this;
    }

    addCondition(text: string): QueryBuilder {
        this.conditions.push(`(${text})`);

        return this;
    }

    group(columns: string[]): QueryBuilder {
        this.aggregations = [...this.aggregations, ...columns];

        return this;
    }

    paginate(page: number, limit: number): QueryBuilder {
        this.append('LIMIT ' + this.addVariable(limit) + ' OFFSET ' + this.addVariable((page - 1) * limit));

        return this;
    }

    append(text: string): QueryBuilder {
        this.ending += text + ' ';

        return this;
    }

    appendToBase(text: string): QueryBuilder {
        this.baseQuery += text + ' ';

        return this;
    }

    setVars(vars: any[]): QueryBuilder {
        this.values = vars;
        this.varCounter = vars.length;

        return this;
    }

    buildString(): string {
        let queryString = this.baseQuery + ' ';

        if (this.conditions.length > 0) {
            queryString += 'WHERE ' + this.conditions.join(' AND ') + ' ';
        }

        if (this.aggregations.length > 0) {
            queryString += 'GROUP BY ' + this.aggregations.join(', ') + ' ';
        }

        if (this.ending) {
            queryString += this.ending + ' ';
        }

        return queryString;
    }

    buildValues(): any[] {
        return this.values;
    }

    debug(plain: boolean = false): void {
        if (plain) {
            const sql = this.buildValues().reduce((s, val, i) => {
                if (Array.isArray(val)) {
                    val = `ARRAY[${val.map(s => `'${s}'`).join(',')}]`;
                } else if (typeof val === 'string') {
                    val = `'${val}'`;
                }
                return s.replace(`$${i + 1}`, val);
            }, this.buildString());
            console.log(sql);
        } else {
            console.log(this.buildString(), this.buildValues());
        }
    }

}
