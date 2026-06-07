/** Strip verbose logs from release builds (Logcat / Metro). */
export function devLog(...args: unknown[]): void {
  if (__DEV__) console.log(...args)
}

export function devWarn(...args: unknown[]): void {
  if (__DEV__) console.warn(...args)
}
