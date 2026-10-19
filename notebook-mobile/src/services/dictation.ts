export function useDictation(_onText: (text: string) => void, _onError: (text: string) => void) {
  return { supported: false, listening: false, start() {}, stop() {} };
}
