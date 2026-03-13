export function freezeCommand(args: string[]): string {
  return `freeze:${args.join(":")}`;
}
