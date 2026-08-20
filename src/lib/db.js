import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore'
import { db } from '../firebase.js'

// ---- Generic helpers -------------------------------------------------

export function colRef(name) {
  return collection(db, name)
}

export async function listAll(name, sortField = 'createdAt') {
  const snap = await getDocs(query(colRef(name), orderBy(sortField, 'desc')))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export function subscribeAll(name, cb, sortField = 'createdAt') {
  const q = query(colRef(name), orderBy(sortField, 'desc'))
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
}

export async function getOne(name, id) {
  const snap = await getDoc(doc(db, name, id))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

export async function createOne(name, data) {
  const ref = await addDoc(colRef(name), { ...data, createdAt: serverTimestamp() })
  return ref.id
}

export async function updateOne(name, id, data) {
  await updateDoc(doc(db, name, id), data)
}

export async function removeOne(name, id) {
  await deleteDoc(doc(db, name, id))
}

export async function findWhere(name, field, op, value) {
  const snap = await getDocs(query(colRef(name), where(field, op, value)))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export function subscribeWhere(name, field, op, value, cb) {
  const q = query(colRef(name), where(field, op, value))
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
}

export async function batchCreate(name, items) {
  // Firestore batches are capped at 500 writes.
  const chunks = []
  for (let i = 0; i < items.length; i += 450) chunks.push(items.slice(i, i + 450))
  for (const chunk of chunks) {
    const batch = writeBatch(db)
    chunk.forEach((item) => {
      const ref = doc(colRef(name))
      batch.set(ref, { ...item, createdAt: serverTimestamp() })
    })
    await batch.commit()
  }
}

// ---- Domain-specific queries -------------------------------------------------

export const Collections = {
  CLIENTS: 'clients',
  OBRAS: 'obras',
  PROFORMAS: 'proformas',
  PAYMENTS: 'payments',
  PROFORMA_ITEMS: 'proformaItems',
  SETTINGS: 'settings'
}

export async function getObrasByClient(clientId) {
  return findWhere(Collections.OBRAS, 'clientId', '==', clientId)
}

export async function getProformasByObra(obraId) {
  return findWhere(Collections.PROFORMAS, 'obraId', '==', obraId)
}

export async function getPaymentsByObra(obraId) {
  return findWhere(Collections.PAYMENTS, 'obraId', '==', obraId)
}

export async function getPaymentsByClient(clientId) {
  return findWhere(Collections.PAYMENTS, 'clientId', '==', clientId)
}

export async function getSettings() {
  const rows = await listAll(Collections.SETTINGS, 'createdAt').catch(() => [])
  if (rows.length) return rows[0]
  return { id: null, defaultRetentionRate: 6.5, defaultIvaRate: 14 }
}

export async function saveSettings(settingsId, data) {
  if (settingsId) {
    await updateOne(Collections.SETTINGS, settingsId, data)
    return settingsId
  }
  return createOne(Collections.SETTINGS, data)
}
