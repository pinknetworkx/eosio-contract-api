/* eslint-disable */
module.exports = {
    rawTraceFilter: (blockNum, tx, trace) => {
        if (trace.act.account === 'atomicassets' && trace.act.name === 'logsetdata') {
            const mining = tx.traces.find(trace => trace.act.account === 'm.federation' && trace.act.name === 'mine');

            if (mining) {
                return false;
            }
        }

        return true;
    }
};
