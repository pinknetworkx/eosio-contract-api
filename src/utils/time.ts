export function formatSecondsLeft(n: number): string {
    if (n < 0) {
        return 'never';
    }

    const hours = Math.floor(n / 3600);
    const minutes = Math.floor((n % 3600) / 60);
    const seconds = Math.floor(n % 60);

    let str = 'in';

    if (hours > 0) {
        str += ' ' + hours + ' hours';
    }

    if ((minutes > 0 || hours > 0) && hours < 10) {
        str += ' ' + minutes + ' minutes';
    }

    if (hours === 0 && minutes === 0 && seconds > 30) {
        str += ' less than a minute';
    } else if (hours === 0 && minutes === 0 && seconds <= 30) {
        str += ' a few seconds';
    }

    return str;
}
