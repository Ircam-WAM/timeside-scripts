function compareArray (a: string[], b: string[]): boolean {
  return a.length === b.length &&
    a.every((val, idx) => val === b[idx])
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export { compareArray, sleep }