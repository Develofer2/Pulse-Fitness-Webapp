const enc = new TextEncoder()
const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b as ArrayBuffer)].map((x) => x.toString(16).padStart(2, '0')).join('')

/** Salted PBKDF2 hash. The PIN itself is never stored. */
export async function hashPin(pin: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 120000, hash: 'SHA-256' }, key, 256)
  return hex(bits)
}
export const newSalt = () => hex(crypto.getRandomValues(new Uint8Array(16)))
