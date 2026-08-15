import AsyncStorage from '@react-native-async-storage/async-storage';

export interface MobileAuthUser {
  name?: string;
  email: string;
  picture?: string;
}

export interface MobileAuthState {
  user: MobileAuthUser;
  idToken: string;
}

const AUTH_STORAGE_KEY = 'fintrack_mobile_auth_state';

export function serializeAuthState(user: MobileAuthUser, idToken: string): MobileAuthState {
  return { user, idToken };
}

export function parseStoredAuthState(raw: string | null): MobileAuthState | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<MobileAuthState>;
    if (!parsed?.user?.email || !parsed?.idToken) return null;
    return {
      user: {
        name: parsed.user.name,
        email: parsed.user.email,
        picture: parsed.user.picture,
      },
      idToken: parsed.idToken,
    };
  } catch {
    return null;
  }
}

export async function loadAuthState(): Promise<MobileAuthState | null> {
  const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
  return parseStoredAuthState(raw);
}

export async function saveAuthState(state: MobileAuthState): Promise<void> {
  await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state));
}

export async function clearAuthState(): Promise<void> {
  await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
}
