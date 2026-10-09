DROP TRIGGER IF EXISTS trg_avatar_saved ON public.avatar_configs;
DROP FUNCTION IF EXISTS public.on_avatar_saved();
DELETE FROM public.user_achievements WHERE achievement_key = 'dress_up';
DELETE FROM public.achievements WHERE key = 'dress_up';