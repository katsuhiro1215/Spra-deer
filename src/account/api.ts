// Spra Go との通信(設計書 37章)。Tane と同じ入口(/api/auth/token など)を、X-Spra-App: deer で使う。
import { API_BASE, type AccountUser } from './store.ts';

export class ApiError extends Error {
  status: number; code?: string; errors?: Record<string, string[]>;
  constructor(status: number, message: string, code?: string, errors?: Record<string, string[]>) {
    super(message); this.name = 'ApiError'; this.status = status; this.code = code; this.errors = errors;
  }
}
export type Profile = { id: number; name: string; avatar: string | null };
export type LevelRecord = { plays: number; clears: number; stars: number; best_ms: number | null };
export type RankRow = { rank: number; name: string; avatar: string | null; best_ms: number; is_me: boolean };
export type Board = { rows: RankRow[]; me: { rank: number; best_ms: number } | null; total: number };
export type LevelStats = { level: string; plays: number; players: number; clears: number; clear_players: number };
export type Stats = { players: number; plays: number; levels: LevelStats[]; updated_at: string };
export type RegisterForm = { name: string; email: string; password: string; passwordConfirmation: string; terms: boolean; inviteCode?: string };

const FALLBACK: Record<number, string> = { 401: 'ログインが きれました', 403: 'つかえません', 429: 'すこし まってから、もういちど ためしてね' };
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const mapUser = (d: unknown): AccountUser => {
  if (!isRec(d)) throw new Error('invalid user');
  return { id: d.id as number, name: d.name as string, email: d.email as string, termsOutdated: d.terms_outdated === true };
};
export const deviceName = (): string => (typeof navigator !== 'undefined' && navigator.userAgent ? navigator.userAgent.slice(0, 100) : 'spra-deer');

export function createApi(getToken: () => string | null, base = API_BASE, f: typeof fetch = (...a) => fetch(...a)) {
  async function request<T>(path: string, init: RequestInit & { keepalive?: boolean } = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('X-Spra-App', 'deer');
    headers.set('Accept', 'application/json');
    if (init.body) headers.set('Content-Type', 'application/json');
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const res = await f(`${base}${path}`, { ...init, headers, credentials: 'omit' });
    if (res.status === 204) return null as T;
    let data: unknown = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) {
      const errors = isRec(data) && isRec(data.errors) ? data.errors as Record<string, string[]> : undefined;
      const first = errors ? Object.values(errors)[0]?.[0] : undefined;
      const msg = first ?? (isRec(data) && typeof data.message === 'string' ? data.message : null) ?? FALLBACK[res.status] ?? 'つうしんに しっぱいしました';
      throw new ApiError(res.status, msg, isRec(data) && typeof data.code === 'string' ? data.code : undefined, errors);
    }
    return data as T;
  }
  const json = (method: string, body: unknown, keepalive = false): RequestInit & { keepalive?: boolean } => ({ method, body: JSON.stringify(body), keepalive });

  return {
    async login(email: string, password: string) {
      const d = await request<{ token: string; user: unknown }>('/api/auth/token', json('POST', { email, password, device_name: deviceName() }));
      return { token: d.token, user: mapUser(d.user) };
    },
    async register(form: RegisterForm) {
      const d = await request<{ token: string; user: unknown }>('/api/auth/register-token', json('POST', {
        name: form.name, email: form.email, password: form.password, password_confirmation: form.passwordConfirmation, terms: form.terms, device_name: deviceName(),
        ...(form.inviteCode ? { invite_code: form.inviteCode } : {}),
      }));
      return { token: d.token, user: mapUser(d.user) };
    },
    logout: () => request<null>('/api/auth/token', { method: 'DELETE' }),
    async getUser() {
      const d = await request<unknown>('/api/user');
      return { ...mapUser(d), termsVersion: isRec(d) && typeof d.terms_version_current === 'string' ? d.terms_version_current : '' };
    },
    acceptTerms: (version: string) => request<null>('/api/terms/accept', json('POST', { version })),
    registration: () => request<{ open: boolean; invite_required: boolean }>('/api/registration'),
    profiles: () => request<Profile[]>('/api/profiles'),
    createProfile: (name: string) => request<Profile>('/api/profiles', json('POST', { name })),
    records: (profileId: number) => request<{ records: Record<string, LevelRecord> }>(`/api/deer/profiles/${profileId}/records`),
    playStart: (body: { level: string; profile_id?: number; anon_id?: string }) => request<{ id: number }>('/api/deer/plays', json('POST', body)),
    playFinish: (id: number, body: { result: 'clear' | 'fail' | 'quit'; time_ms?: number; stars?: number; anon_id?: string }, keepalive = false) =>
      request<{ verified: boolean; record: LevelRecord | null }>(`/api/deer/plays/${id}/finish`, json('POST', body, keepalive)),
    ranking: (level: string, scope: 'family' | 'all', profileId: number) => request<Board>(`/api/deer/ranking/${level}?scope=${scope}&profile_id=${profileId}`),
    rankingSettings: (profileId: number) => request<{ public: boolean; nickname: string }>(`/api/deer/ranking/settings?profile_id=${profileId}`),
    setRankingPublic: (profileId: number, isPublic: boolean, password?: string) =>
      request<{ public: boolean; nickname: string }>('/api/deer/ranking/settings', json('PUT', { profile_id: profileId, public: isPublic, ...(password ? { password } : {}) })),
    stats: () => request<Stats>('/api/deer/stats'),
  };
}
export type Api = ReturnType<typeof createApi>;
