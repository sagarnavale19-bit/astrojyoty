import { getUser } from '@netlify/identity';
import { getStore } from '@netlify/blobs';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { profiles, bookings, settings } from '../../db/schema.js';
const OWNER = 'umesh_jotkar@rediffmail.com';
const reply = (data: any, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (message: string, status = 400): never => { throw Object.assign(new Error(message), { status }); };
function clean(value: any) {
 if (JSON.stringify(value).length > 3000000) fail('File or record is too large.');
 return JSON.parse(JSON.stringify(value));
}
async function storeImage(data: string, key: string, proof = false) {
 const match = /^data:(image\/(?:png|jpeg|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/.exec(data);
 if (!match || (!proof && match[1] === 'application/pdf')) return fail('Use a PNG, JPEG or WebP image, or a PDF payment proof.');
 const bytes = Buffer.from(match[2], 'base64');
 if (bytes.length > 2 * 1024 * 1024) fail('File must be smaller than 2 MB.');
 await getStore('customer-files').set(key, bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength), { metadata: { type: match[1] } });
 return key;
}
export default async (req: Request) => {
 try {
  const url = new URL(req.url);
  const user = await getUser();
  const owner = !!user?.confirmedAt && user.email?.toLowerCase() === OWNER;
  if (req.method === 'POST' && req.headers.get('origin') !== url.origin) return reply({error:'Request origin rejected.'}, 403);
  const route = url.searchParams.get('file');
  if (route) {
   let key: string | undefined;
   if (route === 'qr') {
    const [row] = await db.select().from(settings).where(eq(settings.id, 'payment'));
    key = row?.data?.qrKey;
   } else {
    if (!user?.confirmedAt) return reply({error:'Please sign in.'}, 401);
    const [b] = await db.select().from(bookings).where(eq(bookings.id, route));
    if (!b || (!owner && b.userId !== user.id)) return reply({error:'File not found.'},404);
    key = b.data.proofKey;
   }
   if (!key) return reply({error:'File not found.'},404);
   const file = await getStore('customer-files').getWithMetadata(key, {type:'arrayBuffer'});
   if (!file) return reply({error:'File not found.'},404);
   return new Response(file.data, {headers:{'Content-Type':String(file.metadata.type),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }
  if (req.method === 'GET') {
   const publicSettings = await db.select().from(settings);
   const authenticated = !!user?.confirmedAt;
   const ps = authenticated ? await db.select().from(profiles).where(owner ? undefined : eq(profiles.id,user!.id)) : [];
   const bs = authenticated ? await db.select().from(bookings).where(owner ? undefined : eq(bookings.userId,user!.id)) : [];
   const occupied = await db.select({appointment:bookings.appointment,slot:bookings.slot}).from(bookings);
   return reply({ occupied, owner, userId: authenticated ? user!.id : null, profiles: ps, bookings: bs, settings: publicSettings });
  }
  if (req.method !== 'POST') return reply({error:'Method not allowed.'},405);
  if (!user?.confirmedAt) return reply({error:'Please sign in with a confirmed email address.'},401);
  const raw = await req.text();
  if (raw.length > 3500000) return reply({error:'Upload too large.'},413);
  const body = JSON.parse(raw);
  if (!Array.isArray(body.changes) || body.changes.length > 100) fail('Invalid update.');
  await db.transaction(async tx => {
   for (const change of body.changes) {
    const {kind,id,version} = change;
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) fail('Invalid record ID.');
    let data = clean(change.data);
    if (!data || typeof data !== 'object') fail('Invalid record.');
    if (kind === 'profile') {
     if (!owner && id !== user.id) fail('Access denied.',403);
     const [old] = await tx.select().from(profiles).where(eq(profiles.id,id));
     const phone = String(data.phone || '').replace(/\D/g,'');
     if (!/^\d{8,15}$/.test(phone) || !String(data.name || '').trim() || !Array.isArray(data.members || []) || (data.members || []).length > 6) fail('A name, valid phone number and up to six family members are required.');
     // Identity is the source of account email; never accept passwords or roles in profile data.
     const safe = {name: String(data.name).slice(0,150),phone,email:old?.data.email || user.email,members:data.members || []};
     if (old) {
      if (old.version !== version) fail('This profile changed on another device. Refresh and try again.',409);
      const rows = await tx.update(profiles).set({data:safe,phone,version:sql`${profiles.version}+1`}).where(and(eq(profiles.id,id),eq(profiles.version,version))).returning();
      if (!rows.length) fail('Profile changed. Refresh and retry.',409);
     } else await tx.insert(profiles).values({id,phone,data:safe});
    } else if (kind === 'booking') {
     const [old] = await tx.select().from(bookings).where(eq(bookings.id,id));
     if (old && !owner) fail('Only the owner can change submitted bookings.',403);
     const [profile] = await tx.select().from(profiles).where(eq(profiles.id,old?.userId || user.id));
     if (!profile) fail('Complete your profile before booking.');
     if (!old) {
      const allowed=['memberId','name','relation','gender','serviceId','dob','birthtime','birthplace','birthLat','birthLng','appointment','slot','language','notes','proofData','proofName','paymentMethod'];
      data=Object.fromEntries(Object.entries(data).filter(([k])=>allowed.includes(k)));
      for(const coord of ['birthLat','birthLng']) { const n=Number(data[coord]); if(data[coord] && (!Number.isFinite(n)||Math.abs(n)>(coord==='birthLat'?90:180))) fail('Invalid map coordinates.');data[coord]=data[coord]?String(n):''; }
      data.id=id;
      const [serviceSettings] = await tx.select().from(settings).where(eq(settings.id,'services'));
      const defaults = [{id:'panchang',name:'Panchang & Muhurat',price:499},{id:'patrika',name:'Janma Patrika / Kundali',price:1499},{id:'personal',name:'Personalised Astrology Report',price:999}];
      const service = (serviceSettings?.data || defaults).find((s:any)=>s.id===data.serviceId);
      const [av] = await tx.select().from(settings).where(eq(settings.id,'availability'));
      if (!service || !(av?.data?.[data.appointment] || []).includes(data.slot)) fail('This service or appointment is no longer available. Refresh and select another slot.',409);
      if (!data.name || !/^\d{4}-\d{2}-\d{2}$/.test(data.dob || '') || !/^\d{2}:\d{2}$/.test(data.birthtime || '') || !data.birthplace) fail('Complete the required birth details.');
      Object.assign(data,{service:service.name,price:service.price,phone:profile.phone,customerPhone:profile.phone,email:profile.data.email,payment:'Pending',status:'Pending',reports:[],created:new Date().toISOString()});
     } else {
      if (old.version !== version) fail('This booking changed on another device. Refresh and try again.',409);
      // Owner actions change status, payment verification and report metadata only.
      const {status,payment,reports} = data;
      Object.assign(data,old.data,{status,payment,reports});
     }
     if (data.proofData) { data.proofKey = await storeImage(data.proofData,`proof/${user.id}/${id}`,true); delete data.proofData; }
     if (old) {
      const rows = await tx.update(bookings).set({data,version:sql`${bookings.version}+1`}).where(and(eq(bookings.id,id),eq(bookings.version,version))).returning();
      if (!rows.length) fail('Booking changed. Refresh and retry.',409);
     } else await tx.insert(bookings).values({id,userId:user.id,appointment:data.appointment,slot:data.slot,data});
    } else if (kind === 'setting') {
     if (!owner || !['site','services','availability','payment'].includes(id)) fail('Access denied.',403);
     const [old] = await tx.select().from(settings).where(eq(settings.id,id));
     if ((old?.version || 0) !== version) fail('Settings changed on another device. Refresh and retry.',409);
     if (id==='payment') {
      data.mode='upi';data.razorpayKey='';
      if (data.qr?.startsWith('data:')) data.qrKey=await storeImage(data.qr,`qr/${crypto.randomUUID()}`);
      delete data.qr;
     }
     if (old) {
      const rows=await tx.update(settings).set({data,version:sql`${settings.version}+1`}).where(and(eq(settings.id,id),eq(settings.version,version))).returning();
      if(!rows.length) fail('Settings changed. Refresh and retry.',409);
     } else await tx.insert(settings).values({id,data});
    } else fail('Invalid update type.');
   }
  });
  return reply({ok:true});
 } catch (error:any) {
  const code=error.code || error.cause?.code;
  if(code==='23505') return reply({error:'That phone number or appointment slot is already registered. Refresh and try again.'},409);
  return reply({error:error.status ? error.message : 'Data could not be saved. Please try again.'},error.status || 503);
 }
};
export const config = { path: '/api/data' };
