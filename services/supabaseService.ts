import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';

// Local storage keys
const URL_STORAGE_KEY = 'context7_supabase_url';
const ANON_KEY_STORAGE_KEY = 'context7_supabase_anon_key';

let supabaseInstance: SupabaseClient | null = null;

// Memory fallback store if localStorage is blocked/sandboxed inside iframes
const memoryStore: Record<string, string> = {};

const safeGetItem = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return memoryStore[key] || null;
  }
};

const safeSetItem = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    memoryStore[key] = value;
  }
};

const safeRemoveItem = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    delete memoryStore[key];
  }
};

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

// Get configurations from localStorage or fallback to environment variables
export const getSupabaseConfig = (): SupabaseConfig => {
  const url = safeGetItem(URL_STORAGE_KEY) || (import.meta as any).env?.VITE_SUPABASE_URL || '';
  const anonKey = safeGetItem(ANON_KEY_STORAGE_KEY) || (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';
  return { url, anonKey };
};

// Save configurations to localStorage and reset the client instance
export const saveSupabaseConfig = (url: string, anonKey: string) => {
  safeSetItem(URL_STORAGE_KEY, url);
  safeSetItem(ANON_KEY_STORAGE_KEY, anonKey);
  supabaseInstance = null; // Forces recreation on next access
};

// Clear configurations
export const clearSupabaseConfig = () => {
  safeRemoveItem(URL_STORAGE_KEY);
  safeRemoveItem(ANON_KEY_STORAGE_KEY);
  supabaseInstance = null;
};

// Lazy initialization of Supabase Client
export const getSupabaseClient = (): SupabaseClient | null => {
  if (supabaseInstance) return supabaseInstance;

  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) return null;

  try {
    // Custom storage backend that works beautifully inside iframe environments
    const customAuthStorage = {
      getItem: (key: string) => safeGetItem(key),
      setItem: (key: string, value: string) => safeSetItem(key, value),
      removeItem: (key: string) => safeRemoveItem(key)
    };

    supabaseInstance = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: customAuthStorage
      }
    });
    return supabaseInstance;
  } catch (error) {
    console.error('Failed to initialize Supabase client:', error);
    return null;
  }
};

// User Authorization utilities
export const signUpUser = async (email: string, password: string) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase Client is not configured. Please add URL and Anon Key.');
  
  const { data, error } = await client.auth.signUp({
    email,
    password
  });
  
  if (error) throw error;
  return data;
};

export const signInUser = async (email: string, password: string) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase Client is not configured. Please add URL and Anon Key.');
  
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password
  });
  
  if (error) throw error;
  return data;
};

export const signOutUser = async () => {
  const client = getSupabaseClient();
  if (!client) return;
  
  const { error } = await client.auth.signOut();
  if (error) throw error;
};

export const getSupabaseSession = async (): Promise<Session | null> => {
  const client = getSupabaseClient();
  if (!client) return null;
  
  const { data: { session }, error } = await client.auth.getSession();
  if (error) {
    console.error('Error fetching Supabase session:', error);
    return null;
  }
  return session;
};

export const getSupabaseUser = async (): Promise<User | null> => {
  const client = getSupabaseClient();
  if (!client) return null;
  
  const { data: { user }, error } = await client.auth.getUser();
  if (error) {
    console.error('Error fetching Supabase user:', error);
    return null;
  }
  return user;
};

// Check if client is initialized
export const isSupabaseConfigured = (): boolean => {
  const { url, anonKey } = getSupabaseConfig();
  return !!url && !!anonKey;
};
