export function seizeCommand(args: string[]): string {
  return `seize:${args.join(":")}`;
}
