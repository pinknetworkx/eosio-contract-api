export class ApiError extends Error {
    showMessage = true;

    constructor(message?: string) {
        super(message);
    }
}
