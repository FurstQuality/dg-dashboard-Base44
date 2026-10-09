import {afterEach,expect,it,vi} from 'vitest';
import {assertOverlayEditor,detectOverlay} from './course-overlay.server';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('requires verified editing access and fails closed on permission errors',async()=>{
 await expect(assertOverlayEditor({rpc:async()=>({data:false,error:new Error('db')})} as never,'user','course')).rejects.toThrow('verify');
 await expect(assertOverlayEditor({rpc:async()=>({data:true,error:null})} as never,'user','course')).resolves.toBeUndefined();
});
it('does not call a vision provider when the key is missing',async()=>{vi.stubEnv('GEMINI_API_KEY','');const fetch=vi.fn();vi.stubGlobal('fetch',fetch);await expect(detectOverlay('data:image/png;base64,AAAA','no-key')).rejects.toThrow('GEMINI_API_KEY');expect(fetch).not.toHaveBeenCalled();});
it('validates candidate coordinates rather than importing untrusted vision output',async()=>{vi.stubEnv('GEMINI_API_KEY','test-key');vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({items:[{kind:'tee',hole:1,name:'Main',color:'#ffffff',x:4,y:.5}]})}]}}]})})));await expect(detectOverlay('data:image/png;base64,AAAA','invalid-candidate')).rejects.toThrow();});
