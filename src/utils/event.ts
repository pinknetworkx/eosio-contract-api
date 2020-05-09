
type EventCallback = (data: any) => any;

export class PromiseEventHandler {
    private listeners: Array<{
        name: string,
        callback: EventCallback,
        limit: number
    }>;

    constructor() {

    }

    on(name: string, callback: EventCallback, limit: number = 0): void {
        this.listeners.push({ name, callback, limit });
    }

    once(name: string, callback: EventCallback): void {
        this.on(name, callback, 1);
    }

    async emit(name: string, data: any): Promise<any[]> {
        const listeners = this.listeners
            .filter((listener) => listener.name === name)
            .map((listener) => listener);

        const result = [];

        for (const listener of listeners) {
            if (listener.limit > 0) {
                listener.limit -= 1;

                this.removeListener(name, listener.callback);
            }

            if (!listener.callback) {
                continue;
            }

            result.push(await listener.callback(data));
        }

        return result;
    }

    removeListener(name: string, callback: EventCallback): void {
        this.listeners = this.listeners
            .filter((listener) => listener.name !== name || listener.callback !== callback);
    }

    removeAllListeners(name: string): void {
        this.listeners = this.listeners
            .filter((listener) => listener.name !== name);
    }
}
