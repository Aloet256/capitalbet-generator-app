// Device fingerprinting + branch-lock persistence.
//
// The branch interface has no login. Instead:
//  1. On first visit, we generate a random UUID ("device fingerprint") and
//     store it permanently in localStorage.
//  2. Once the user picks a branch, we store that branch id in localStorage
//     too, and insert a `devices` row (status = pending) for that fingerprint.
//  3. Until an admin approves the device, the branch UI shows a
//     "waiting for approval" screen. Once approved, RLS allows this device
//     (identified via the x-device-fingerprint header) to read/write that
//     branch's operational data.
//  4. A page refresh must NOT clear the lock — everything lives in
//     localStorage, not memory/session state.

const FINGERPRINT_KEY = 'cb_device_fingerprint'
const LOCKED_BRANCH_KEY = 'cb_locked_branch_id'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  // Fallback UUID v4 generator
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function isSafeFingerprint(value: string | null): value is string {
  return Boolean(value && UUID_RE.test(value))
}

export function getDeviceFingerprint(): string {
  let fp = localStorage.getItem(FINGERPRINT_KEY)
  if (!isSafeFingerprint(fp)) {
    fp = uuid()
    localStorage.setItem(FINGERPRINT_KEY, fp)
  }
  return fp
}

export function getLockedBranchId(): string | null {
  return localStorage.getItem(LOCKED_BRANCH_KEY)
}

export function setLockedBranchId(branchId: string) {
  localStorage.setItem(LOCKED_BRANCH_KEY, branchId)
}

export function clearLockedBranchId() {
  localStorage.removeItem(LOCKED_BRANCH_KEY)
}


export function describeDevice(): string {
  const ua = navigator.userAgent
  let browser = 'Browser'
  if (ua.includes('Edg/')) browser = 'Edge'
  else if (ua.includes('Chrome/')) browser = 'Chrome'
  else if (ua.includes('Firefox/')) browser = 'Firefox'
  else if (ua.includes('Safari/')) browser = 'Safari'

  let os = 'Unknown OS'
  if (ua.includes('Windows')) os = 'Windows'
  else if (ua.includes('Mac OS')) os = 'macOS'
  else if (ua.includes('Android')) os = 'Android'
  else if (ua.includes('Linux')) os = 'Linux'
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS'

  return `${browser} on ${os}`
}
