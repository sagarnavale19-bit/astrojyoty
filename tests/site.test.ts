import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
const html=readFileSync('public/index.html','utf8');
describe('customer interface',()=>{
 it('loads the existing booking UI without script errors or demo authentication',()=>{
  const dom=new JSDOM(html,{url:'https://astrojyoty.netlify.app',runScripts:'outside-only'});
  dom.window.structuredClone=structuredClone;
  const scripts=[...dom.window.document.querySelectorAll('script:not([src])')];
  expect(scripts.length).toBe(1);
  for(const script of scripts)new Script(script.textContent||'').runInContext(dom.getInternalVMContext());
  expect(dom.window.document.querySelectorAll('#serviceCards .card').length).toBe(3);
  expect(dom.window.document.getElementById('regEmail')?.hasAttribute('required')).toBe(true);
  expect(dom.window.document.getElementById('loginPhone')?.getAttribute('type')).toBe('email');
  expect(html).not.toContain('DemoOwner#');
  expect(dom.window.document.getElementById('ownerTools')?.classList.contains('hidden')).toBe(true);
  dom.window.close();
 });
 it('shows only free appointment slots returned by the shared database',()=>{
  const dom=new JSDOM(html,{url:'https://astrojyoty.netlify.app',runScripts:'outside-only'});
  dom.window.structuredClone=structuredClone;
  const source=dom.window.document.querySelector('script:not([src])')!.textContent!;
  new Script(source).runInContext(dom.getInternalVMContext());
  new Script('availability={"2026-11-15":["10:00 AM","11:00 AM"]};window.occupiedSlots=[{appointment:"2026-11-15",slot:"10:00 AM"}];document.getElementById("appointment").value="2026-11-15";refreshSlots();').runInContext(dom.getInternalVMContext());
  expect(dom.window.document.getElementById('slot')?.textContent).not.toContain('10:00 AM');
  expect(dom.window.document.getElementById('slot')?.textContent).toContain('11:00 AM');
  dom.window.close();
 });
});

describe('shared customer synchronization',()=>{
 it('loads a signed-in profile on a second device and saves family changes with a revision',async()=>{
  const profile={id:'customer-1',version:1,data:{name:'Test Customer',phone:'9999999991',email:'customer@example.com',members:[] as any[]}};
  const posts:any[]=[];
  const sdk={signup:vi.fn(),login:vi.fn(),logout:vi.fn(),getUser:async()=>({id:profile.id,email:profile.data.email}),handleAuthCallback:async()=>null,requestPasswordRecovery:vi.fn(),updateUser:vi.fn(),acceptInvite:vi.fn()};
  const fetchMock=async(_url:any,options:any={})=>{
   if(options.method==='POST'){
    const body=JSON.parse(options.body);posts.push(body);
    const change=body.changes.find((c:any)=>c.kind==='profile');
    if(change){profile.data=change.data;profile.version++;}
    return Response.json({ok:true});
   }
   return Response.json({owner:false,userId:profile.id,occupied:[],profiles:[profile],bookings:[],settings:[]});
  };
  async function device(){
   const dom=new JSDOM(html,{url:'https://astrojyoty.netlify.app',runScripts:'outside-only'});
   Object.assign(dom.window,{structuredClone,fetch:fetchMock,__sdk:sdk,setInterval:()=>0});
   new Script(dom.window.document.querySelector('script:not([src])')!.textContent!).runInContext(dom.getInternalVMContext());
   const module=readFileSync('public/live.js','utf8').replace(/^import .*?;\n/,'const {signup,login,logout,getUser,handleAuthCallback,requestPasswordRecovery,updateUser,acceptInvite}=window.__sdk;\n');
   await new Script('(async()=>{'+module+'})()').runInContext(dom.getInternalVMContext());
   return dom;
  }
  const first=await device();
  new Script('customers[0].members.push({id:"M1",name:"Family Member",relation:"Sibling"});').runInContext(first.getInternalVMContext());
  expect(await (first.window as any).cloudSave()).toBe(true);
  expect(posts[0].changes[0].version).toBe(1);
  const second=await device();
  expect(second.window.document.getElementById('familyPanel')?.textContent).toContain('Family Member');
  expect(second.window.document.getElementById('customerProfile')?.textContent).toContain('Test Customer');
  first.window.close();second.window.close();
 });
});
