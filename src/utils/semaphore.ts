export default class Semaphore {
    readonly max: number;

    private counter: number;
    private waiting: Array<{resolve: () => void; reject: (err: any) => void}>;

    constructor(max: number) {
        this.max = max;
        this.waiting = [];
        this.counter = 0;
    }

    async acquire(): Promise<void> {
        if(this.counter < this.max) {
            this.counter++;

            return Promise.resolve();
        } else {
            return new Promise((resolve, reject) => {
                this.waiting.push({resolve, reject});
            });
        }
    }

    release(): void {
        this.counter--;

        this.take();
    }

    purge(): number {
        const unresolved = this.waiting.length;

        for (let i = 0; i < unresolved; i++) {
            this.waiting[i].reject('Task has been purged.');
        }

        this.counter = 0;
        this.waiting = [];

        return unresolved;
    }

    take(): void {
        if (this.waiting.length > 0 && this.counter < this.max){
            this.counter++;

            const promise = this.waiting.shift();
            promise.resolve();
        }
    }
}
