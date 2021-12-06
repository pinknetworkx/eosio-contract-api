import {DB} from '../../server';
import {FillerHook} from '../atomicassets/filler';
import {formatTemplate} from '../atomicassets/format';

export class TemplateFiller {
    private templates: Promise<{[key: string]: any}> | null;

    constructor(
        readonly db: DB,
        readonly contract: string,
        readonly templateIds: string[],
        readonly formatter: (_: any) => any,
        readonly view: string,
        readonly hook?: FillerHook
    ) {
        this.templates = null;
    }

    async fill(templateIds: string[]): Promise<any[]> {
        this.query();

        const data = await this.templates;

        return templateIds.map((templateId) => data[String(templateId)] || String(templateId));
    }

    query(): void {
        if (this.templates !== null) {
            return;
        }

        this.templates = new Promise(async (resolve, reject) => {
            if (this.templateIds.length === 0) {
                return resolve({});
            }

            try {
                const query = await this.db.query(
                    'SELECT * FROM ' + this.view + ' WHERE contract = $1 AND template_id = ANY ($2)',
                    [this.contract, this.templateIds]
                );

                const rows = this.hook ? await this.hook(this.db, this.contract, query.rows) : query.rows;
                const result: {[key: string]: any} = {};

                for (const row of rows) {
                    result[String(row.template_id)] = this.formatter(row);
                }

                return resolve(result);
            } catch (e) {
                return reject(e);
            }
        });
    }
}

export async function fillDrops(db: DB, assetContract: string, drops: any[]): Promise<any[]> {
    const templateIds: string[] = [];

    for (const drop of drops) {
        templateIds.push(...drop.templates);
    }

    const filler = new TemplateFiller(db, assetContract, templateIds, formatTemplate, 'atomicassets_templates_master');

    return await Promise.all(drops.map(async (drop) => {
        drop.templates = await filler.fill(drop.templates);
        return drop;
    }));
}
