export function mintersCommand(args: string[]): string {
  return `minters:${args.join(":")}`;
}
