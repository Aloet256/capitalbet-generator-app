import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

function loadEnvFile() {
  const envPath = resolve(root, '.env')
  try {
    const lines = readFileSync(envPath, 'utf8').split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const index = trimmed.indexOf('=')
      if (index === -1) continue
      const key = trimmed.slice(0, index).trim()
      const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, '')
      if (key && process.env[key] === undefined) process.env[key] = value
    }
  } catch {
    // .env is optional; shell env can provide everything.
  }
}

function readBranchesFromSeed() {
  const seedPath = resolve(root, 'supabase', 'seed.sql')
  const sql = readFileSync(seedPath, 'utf8')
  const values = sql.match(/insert into branches \(name, region, code\) values([\s\S]*?);/i)?.[1]
  if (!values) throw new Error('Could not find branch seed values in supabase/seed.sql')

  const branches = []
  const tuplePattern = /\('([^']+)',\s*'([^']+)',\s*(null|'([^']*)')\)/gi
  let match
  while ((match = tuplePattern.exec(values))) {
    branches.push({
      name: match[1],
      region: match[2],
      code: match[3].toLowerCase() === 'null' ? null : match[4],
    })
  }
  if (branches.length === 0) throw new Error('No branches parsed from supabase/seed.sql')
  return branches
}

async function supabaseFetch(path, { method = 'GET', body, token = serviceRoleKey, headers = {} } = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: token,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let payload = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = text
    }
  }
  if (!response.ok) {
    const message = typeof payload === 'string' ? payload : payload?.message || payload?.msg || JSON.stringify(payload)
    throw new Error(`${method} ${path} failed (${response.status}): ${message}`)
  }
  return payload
}

async function seedBranchesIfEmpty() {
  const existing = await supabaseFetch('/rest/v1/branches?select=id&limit=1')
  if (Array.isArray(existing) && existing.length > 0) {
    console.log('Branches already exist; skipping branch seed.')
    return
  }

  const branches = readBranchesFromSeed()
  await supabaseFetch('/rest/v1/branches', {
    method: 'POST',
    body: branches,
    headers: { Prefer: 'return=minimal' },
  })
  console.log(`Seeded ${branches.length} branches.`)
}

async function findAuthUserByEmail(email) {
  const page = await supabaseFetch('/auth/v1/admin/users?per_page=1000&page=1')
  const users = Array.isArray(page?.users) ? page.users : Array.isArray(page) ? page : []
  return users.find((user) => user.email?.toLowerCase() === email.toLowerCase()) ?? null
}

async function createOrFindAuthUser() {
  const existing = await findAuthUserByEmail(adminEmail)
  if (existing) {
    console.log(`Auth user already exists for ${adminEmail}.`)
    return existing
  }

  const created = await supabaseFetch('/auth/v1/admin/users', {
    method: 'POST',
    body: {
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: { full_name: adminFullName },
    },
  })
  console.log(`Created Auth user for ${adminEmail}.`)
  return created
}

async function linkAdminProfile(authUserId) {
  const encodedEmail = encodeURIComponent(adminEmail)
  const existing = await supabaseFetch(`/rest/v1/admins?select=id,email,auth_user_id&email=eq.${encodedEmail}`)
  const body = {
    auth_user_id: authUserId,
    full_name: adminFullName,
    email: adminEmail,
    must_change_password: false,
  }

  if (Array.isArray(existing) && existing.length > 0) {
    await supabaseFetch(`/rest/v1/admins?id=eq.${existing[0].id}`, {
      method: 'PATCH',
      body,
      headers: { Prefer: 'return=minimal' },
    })
    console.log('Updated existing admin profile.')
    return
  }

  await supabaseFetch('/rest/v1/admins', {
    method: 'POST',
    body,
    headers: { Prefer: 'return=minimal' },
  })
  console.log('Created admin profile.')
}

async function verifyAdminLogin() {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(`Admin login verification failed: ${payload?.error_description || payload?.message || response.status}`)
  }
  console.log(`Verified admin login for username "${adminUsername}" (${adminEmail}).`)
}

loadEnvFile()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const publishableKey = process.env.VITE_SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const adminUsername = process.env.VITE_ADMIN_USERNAME || 'admin'
const adminEmail = process.env.VITE_ADMIN_EMAIL || 'admin@capitalbet.example'
const adminPassword = process.env.SUPABASE_ADMIN_PASSWORD
const adminFullName = process.env.SUPABASE_ADMIN_FULL_NAME || 'Super Admin'

if (!supabaseUrl) throw new Error('Missing VITE_SUPABASE_URL.')
if (!publishableKey) throw new Error('Missing VITE_SUPABASE_ANON_KEY.')
if (!serviceRoleKey) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY. Set it in your shell only; do not put it in frontend .env files.')
}
if (!adminPassword) {
  throw new Error('Missing SUPABASE_ADMIN_PASSWORD. Set a strong temporary password in your shell before provisioning.')
}

await seedBranchesIfEmpty()
const authUser = await createOrFindAuthUser()
await linkAdminProfile(authUser.id)
await verifyAdminLogin()
console.log('Supabase provisioning complete.')
