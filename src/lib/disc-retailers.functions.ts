import {createServerFn} from '@tanstack/react-start';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
export const listDiscRetailers=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async()=>{
 const {loadDiscRetailers}=await import('./disc-retailers.server');return loadDiscRetailers();
});
