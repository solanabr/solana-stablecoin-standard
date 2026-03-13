export function blacklistCommand(args: string[]): string {
  return `blacklist:${args.join(":")}`;
}
