/**
 * Device Flagging — Multi-storage persistence
 *
 * Stores a flag across cookies, localStorage, and IndexedDB.
 * If any one storage survives a clear, it repopulates the others.
 * Used to require email verification from flagged devices.
 */

const FLAG_KEY = '_cf_v'
const FLAG_VALUE = '1'
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60 // 1 year in seconds

// ── Cookie ──────────────────────────────────────────────

function setCookie(): void {
  document.cookie = `${FLAG_KEY}=${FLAG_VALUE}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`
}

function getCookie(): boolean {
  return document.cookie.split(';').some(c => c.trim().startsWith(`${FLAG_KEY}=`))
}

// ── localStorage ────────────────────────────────────────

function setLocal(): void {
  try {
    localStorage.setItem(FLAG_KEY, FLAG_VALUE)
  } catch { /* quota or private mode */ }
}

function getLocal(): boolean {
  try {
    return localStorage.getItem(FLAG_KEY) === FLAG_VALUE
  } catch {
    return false
  }
}

// ── IndexedDB ───────────────────────────────────────────

const DB_NAME = '_cf_store'
const STORE_NAME = 'flags'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function setIDB(): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(FLAG_VALUE, FLAG_KEY)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject()
    })
    db.close()
  } catch { /* IDB unavailable */ }
}

async function getIDB(): Promise<boolean> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).get(FLAG_KEY)
    const result = await new Promise<boolean>((resolve) => {
      request.onsuccess = () => resolve(request.result === FLAG_VALUE)
      request.onerror = () => resolve(false)
    })
    db.close()
    return result
  } catch {
    return false
  }
}

// ── Public API ──────────────────────────────────────────

/**
 * Flag this device. Writes to all three stores.
 */
export async function flagDevice(): Promise<void> {
  setCookie()
  setLocal()
  await setIDB()
}

/**
 * Check if this device is flagged.
 * If any store has the flag, re-populate the others.
 */
export async function isDeviceFlagged(): Promise<boolean> {
  const cookie = getCookie()
  const local = getLocal()
  let idb = false
  try {
    idb = await getIDB()
  } catch { /* IDB unavailable */ }

  const flagged = cookie || local || idb

  // Re-populate any missing stores
  if (flagged) {
    if (!cookie) setCookie()
    if (!local) setLocal()
    if (!idb) {
      try { await setIDB() } catch { /* ignore */ }
    }
  }

  return flagged
}
