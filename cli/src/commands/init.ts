export function initCommand(args: string[]): string {
  const preset = args.includes("--preset") ? args[args.indexOf("--preset") + 1] : "sss-1";
  return `initialized:${preset}`;
}
