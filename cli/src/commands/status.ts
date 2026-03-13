export function statusCommand(args: string[]): string {
  return `status:${args.join(":")}`;
}
