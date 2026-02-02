export function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(" ");
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
