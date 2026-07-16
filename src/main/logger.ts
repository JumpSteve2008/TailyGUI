import log from 'electron-log';

log.transports.file.level = 'info';
log.transports.console.level = 'debug';

export function createLogger(name: string) {
  return {
    info: (...args: unknown[]) => log.info(`[${name}]`, ...args),
    warn: (...args: unknown[]) => log.warn(`[${name}]`, ...args),
    error: (...args: unknown[]) => log.error(`[${name}]`, ...args),
    debug: (...args: unknown[]) => log.debug(`[${name}]`, ...args),
  };
}
