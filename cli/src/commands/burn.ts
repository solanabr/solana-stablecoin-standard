export function burnCommand(args: string[]): string {
  return `burn:${args.join(":")}`;
}
