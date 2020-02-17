module.exports = {
    name: "api",
    script: 'build/main.bundle.js',
    watch: true,
    ignore_watch: ["node_modules"],
    // new feature; increase restart delay each time after every crash or non reachable db per example
    exp_backoff_restart_delay: 100,
    //combine multiple err/out logs in one file for each
    combine_logs: true,
    //calls combine logs
    merge_logs: true,
    //error log file path
    error_file: "logs/err.log", // better be /var/log
    //out log file path
    out_file: "logs/out.log",
    // use time in logs
    time: true,
};
