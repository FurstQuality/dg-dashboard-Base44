import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
const image=z.string().max(8_000_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/);
const candidate=z.object({id:z.string().max(100),kind:z.enum(['tee','basket']),hole:z.number().int().min(1).max(200),name:z.string().max(80),color:z.string().regex(/^#[a-fA-F0-9]{6}$/),x:z.number().min(0).max(1),y:z.number().min(0).max(1),selected:z.boolean()});
const point=z.tuple([z.number().min(-85).max(85),z.number().min(-180).max(180)]);
export const detectCourseOverlay=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({courseId:z.string().uuid(),image})).handler(async({data,context})=>{
 const {detectOverlay,assertOverlayEditor}=await import('./course-overlay.server');await assertOverlayEditor(context.supabase,context.userId,data.courseId);return detectOverlay(data.image,context.userId);
});
export const recordCourseOverlay=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({courseId:z.string().uuid(),image,name:z.string().max(200),anchors:z.tuple([point,point,point]),candidates:z.array(candidate).min(1).max(400)})).handler(async({data,context})=>{
 const {assertOverlayEditor}=await import('./course-overlay.server');await assertOverlayEditor(context.supabase,context.userId,data.courseId);
 const {recordReviewedOverlay}=await import('./course-geometry/harvest.server');return recordReviewedOverlay(data,context.userId);
});
