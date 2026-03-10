import { config } from "./config";

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel = LEVELS[config.logLevel as LogLevel] ?? LEVELS.info;

function formatMessage(level: LogLevel, context: string, message: string): string {
  const timestamp = new Date().toISOString();
  return `${timestamp} [${level.toUpperCase()}] [${context}] ${message}`;
}

export function createLogger(context: string) {
  return {
    debug(message: string, data?: unknown) {
      if (currentLevel <= LEVELS.debug) {
        console.debug(formatMessage("debug", context, message), data ?? "");
      }
    },
    info(message: string, data?: unknown) {
      if (currentLevel <= LEVELS.info) {
        console.info(formatMessage("info", context, message), data ?? "");
      }
    },
    warn(message: string, data?: unknown) {
      if (currentLevel <= LEVELS.warn) {
        console.warn(formatMessage("warn", context, message), data ?? "");
      }
    },
    error(message: string, data?: unknown) {
      if (currentLevel <= LEVELS.error) {
        console.error(formatMessage("error", context, message), data ?? "");
      }
    },
  };
}
