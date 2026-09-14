const DASHBOARD_ROOT = '/app'

export function safeDashboardReturnTo(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value
  if (!candidate) return DASHBOARD_ROOT
  if (candidate === DASHBOARD_ROOT || candidate.startsWith(`${DASHBOARD_ROOT}/`)) return candidate
  return DASHBOARD_ROOT
}
