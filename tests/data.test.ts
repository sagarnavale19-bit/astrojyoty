import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({getUser:vi.fn(),transaction:vi.fn(),select:vi.fn(),insert:vi.fn()}));
vi.mock('@netlify/identity',()=>({getUser:mocks.getUser}));
vi.mock('../db/index.js',()=>({db:{transaction:mocks.transaction,select:mocks.select}}));
import handler from '../netlify/functions/data.js';
const origin='https://astrojyoty.netlify.app';
const post=(changes:any[],requestOrigin=origin)=>new Request(origin+'/api/data',{method:'POST',headers:{origin:requestOrigin,'content-type':'application/json'},body:JSON.stringify({changes})});
const customer={id:'customer-1',email:'customer@example.com',confirmedAt:'2026-10-31'};
beforeEach(()=>{vi.resetAllMocks();mocks.getUser.mockResolvedValue(customer);mocks.transaction.mockImplementation(async fn=>fn({select:mocks.select,insert:mocks.insert}));});
describe('private data authorization',()=>{
 it('rejects unauthenticated writes before touching the database',async()=>{mocks.getUser.mockResolvedValue(null);expect((await handler(post([]))).status).toBe(401);expect(mocks.transaction).not.toHaveBeenCalled();});
 it('rejects unconfirmed accounts, including the owner email',async()=>{mocks.getUser.mockResolvedValue({id:'owner',email:'umesh_jotkar@rediffmail.com'});expect((await handler(post([]))).status).toBe(401);});
 it('rejects cross-origin writes',async()=>{expect((await handler(post([],'https://untrusted.example'))).status).toBe(403);expect(mocks.transaction).not.toHaveBeenCalled();});
 it('prevents customers changing another profile',async()=>{expect((await handler(post([{kind:'profile',id:'another-customer',data:{name:'Injected'},version:1}]))).status).toBe(403);expect(mocks.select).not.toHaveBeenCalled();});
 it('prevents customers changing public settings',async()=>{expect((await handler(post([{kind:'setting',id:'services',data:[],version:1}]))).status).toBe(403);});
 it('prevents customers confirming or paying submitted bookings',async()=>{mocks.select.mockReturnValue({from:()=>({where:async()=>[{id:'booking-1',userId:customer.id,data:{},version:1}]})});expect((await handler(post([{kind:'booking',id:'booking-1',data:{payment:'Paid'},version:1}]))).status).toBe(403);});
 it('rejects stale owner updates instead of overwriting newer data',async()=>{
  mocks.getUser.mockResolvedValue({...customer,email:'umesh_jotkar@rediffmail.com'});
  mocks.select.mockReturnValue({from:()=>({where:async()=>[{version:3,data:{}}]})});
  expect((await handler(post([{kind:'setting',id:'site',data:{brand:'Stale'},version:2}]))).status).toBe(409);
 });
 it('does not expose a different customer payment proof',async()=>{
  mocks.select.mockReturnValue({from:()=>({where:async()=>[{userId:'someone-else',data:{proofKey:'private-file'}}]})});
  expect((await handler(new Request(origin+'/api/data?file=another-booking'))).status).toBe(404);
 });
});
