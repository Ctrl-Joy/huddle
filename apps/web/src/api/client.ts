// REST client: fetch wrapper with JWT, JSON & multipart, typed ApiError, and an XHR upload path with progress.

const TOKEN_KEY = 'huddle.token';

let token: string | null = (() => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
})();

let unauthorizedHandler: (() => void) | null = null;

export function getToken(): string | null { return token; }
export function setToken(t: string | null): void {
  token = t;
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore */ }
}
export function onUnauthorized(fn: () => void): void { unauthorizedHandler = fn; }
/** For non-REST rejections of the token (the gateway closing with 4004). */
export function notifyUnauthorized(): void { unauthorizedHandler?.(); }

export class ApiError extends Error {
  status: number;
  code: number;
  errors?: Record<string, string>;
  constructor(status: number, message: string, code = 0, errors?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  let url = '/api' + path;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    const s = qs.toString();
    if (s) url += '?' + s;
  }
  return url;
}

async function parseError(res: Response): Promise<ApiError> {
  let message = res.statusText || 'Request failed';
  let code = 0;
  let errors: Record<string, string> | undefined;
  try {
    const data = await res.json();
    if (data && typeof data === 'object') {
      message = data.message || message;
      code = data.code ?? 0;
      errors = data.errors;
    }
  } catch { /* not JSON */ }
  return new ApiError(res.status, message, code, errors);
}

export async function request<T = unknown>(method: Method, path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), { method, headers, body, signal: opts.signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'Network error — is the server running?');
  }
  if (!res.ok) {
    const err = await parseError(res);
    if (res.status === 401 && token && !path.startsWith('/auth/')) unauthorizedHandler?.();
    throw err;
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query'], signal?: AbortSignal) => request<T>('GET', path, { query, signal }),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body }),
  del: <T>(path: string, body?: unknown) => request<T>('DELETE', path, { body }),
};

/** Multipart upload with progress (fetch has no upload progress). */
export function uploadWithProgress<T>(
  path: string,
  form: FormData,
  onProgress?: (fraction: number) => void,
  method: Method = 'POST',
): { promise: Promise<T>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<T>((resolve, reject) => {
    xhr.open(method, buildUrl(path));
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    xhr.onload = () => {
      let data: any = undefined;
      try { data = xhr.responseText ? JSON.parse(xhr.responseText) : undefined; } catch { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
      else {
        if (xhr.status === 401) unauthorizedHandler?.();
        reject(new ApiError(xhr.status, data?.message || xhr.statusText || 'Upload failed', data?.code ?? 0, data?.errors));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, 'Network error during upload'));
    xhr.onabort = () => reject(new ApiError(0, 'Upload cancelled'));
    xhr.send(form);
  });
  return { promise, abort: () => xhr.abort() };
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.errors) {
      const first = Object.values(e.errors)[0];
      if (first) return first;
    }
    return e.message;
  }
  if (e instanceof Error) return e.message;
  return String(e);
}
