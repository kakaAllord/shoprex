// Test environment shared by every mobile test.
//
// The API client is always constructed with an explicit base URL and a fetch
// stub, so no test ever attempts a network call.
//
// The two native modules are replaced here rather than in each test. Neither
// exists outside a real device build: `expo-camera` needs a camera, and
// `expo-secure-store` needs Android's keystore. What is being tested is what
// the app does with their answers, so a fake that answers is enough.

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();

  return {
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

jest.mock('expo-camera', () => {
  const { View } = jest.requireActual('react-native');

  return {
    CameraView: View,
    // Granted by default: a test that wants the refused state overrides this.
    useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
  };
});

export {};
