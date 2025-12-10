export function* pairs<T>(arr: T[]): Iterable<[T, T]> {
  if (arr.length < 2) return;

  for (let i = 0; i < arr.length - 1; i++) {
    yield [arr[i] as T, arr[i + 1] as T];
  }
}
