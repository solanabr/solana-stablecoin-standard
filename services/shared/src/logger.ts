import pino from "pino";

export function createLogger(service: string, level = "info"): pino.Logger {
  return pino({
    level,
    base: { service },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  });
}

export type Logger = pino.Logger;
