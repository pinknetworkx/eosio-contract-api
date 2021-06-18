export default class QueryBuilder {
    private select: string;
    private where: string[];
    private orderBy: string;
    private groupBy: string[];
    private extra: string;

    private values: any[];
    private varCounter: number;

    constructor(select: string, values: any[] = []) {
        this.values = values;
        this.varCounter = this.values.length;

        this.select = select;
        this.where = [];
        this.groupBy = [];
        this.orderBy = '';
        this.extra = '';

    }

    addVariable(value: any): string {
        this.values.push(value);

        return '$' + ++this.varCounter;
    }

    join(tableA: string, tableB: string, columns: string[]): QueryBuilder {
        for (const column of columns) {
            this.where.push(tableA + '.' + column + ' = ' + tableB + '.' + column);
        }

        return this;
    }

    equal(column: string, value: any): QueryBuilder {
        this.where.push(column + ' = ' + this.addVariable(value));

        return this;
    }

    equalMany(column: string, values: any[]): QueryBuilder {
        if (!Array.isArray(values)) {
            throw new Error('equalMany only accept arrays as value');
        }

        if (values.length === 1) {
            return this.equal(column, values[0]);
        }

        this.where.push(column + ' = ANY(' + this.addVariable(values) + ')');

        return this;
    }

    notNull(column: string): QueryBuilder {
        this.where.push(column + ' IS NOT NULL');

        return this;
    }

    isNull(column: string): QueryBuilder {
        this.where.push(column + ' IS NULL');

        return this;
    }

    addCondition(text: string): QueryBuilder {
        this.where.push(text);

        return this;
    }

    group(columns: string[]): QueryBuilder {
        this.groupBy = [...this.groupBy, ...columns];

        return this;
    }

    append(text: string): QueryBuilder {
        this.extra += text + ' ';

        return this;
    }

    setVars(vars: any[]): QueryBuilder {
        this.values = vars;
        this.varCounter = vars.length;

        return this;
    }

    buildString(): string {
        let queryString = this.select + ' ';

        if (this.where.length > 0) {
            queryString += 'WHERE ' + this.where.join(' AND ') + ' ';
        }

        if (this.groupBy.length > 0) {
            queryString += 'GROUP BY ' + this.groupBy.join(', ') + ' ';
        }

        if (this.orderBy) {
            queryString += 'ORDER BY ' + this.orderBy;
        }

        if (this.extra) {
            queryString += this.extra + ' ';
        }

        return queryString;
    }

    buildValues(): any[] {
        return this.values;
    }
}
