export function isSafeServerId(value: string): boolean {
  return /^[a-zA-Z0-9_-]{8,64}$/.test(value);
}

export function isSafeRelativePath(value: string): boolean {
  return Boolean(value) && !value.startsWith("/") && !value.includes("\\") && !value.split("/").includes("..");
}
