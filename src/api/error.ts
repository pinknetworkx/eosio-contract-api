export class ApiError extends Error {
    showMessage = true;

    code: number;

    constructor(message?: string, code = 500) {
        super(message);
        this.code = code;
    }

}
