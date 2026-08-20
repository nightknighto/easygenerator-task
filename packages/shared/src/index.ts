export const SHARED_PACKAGE_NAME = '@app/shared'

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string }
