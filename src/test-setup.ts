import { vi } from 'vitest';

// Unit tests never reach the real backend: the client is absent unless a test supplies a fake.
vi.mock('./lib/supabase', () => ({
  supabase: () => null,
  setSupabaseForTests: () => {},
}));
