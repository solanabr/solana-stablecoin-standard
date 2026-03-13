export function mintCommand(args: string[]): string {
  return `mint:${args.join(":")}`;
}
