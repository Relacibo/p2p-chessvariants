export function reverseLookup<T>(
  dict: { [key: string]: T },
  lookup: T
) {
  return Object.keys(dict).find((key) => dict[key] === lookup);
}
