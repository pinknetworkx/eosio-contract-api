export class PromiseEvent {
    constructor() {

    }

    on(name: string, callback: (data: any) => any) {

    }

    once(name: string, callback: (data: any) => any) {

    }

    async emit(name: string, data: any): Promise<any[]> {
        return [];
    }

    removeListener(name: string, callback: (data: any) => any) {

    }

    removeAllListeners(name: string) {

    }
}
