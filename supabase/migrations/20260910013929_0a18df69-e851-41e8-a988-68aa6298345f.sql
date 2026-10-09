DELETE FROM public.tournament_registrations WHERE tournament_id IN (SELECT id FROM public.tournaments WHERE name ILIKE '%sandbox%');
DELETE FROM public.tournament_rounds WHERE tournament_id IN (SELECT id FROM public.tournaments WHERE name ILIKE '%sandbox%');
DELETE FROM public.tournaments WHERE name ILIKE '%sandbox%';
DELETE FROM public.leagues WHERE name ILIKE '%sandbox%';
DELETE FROM public.course_layouts WHERE course_id IN (SELECT id FROM public.courses WHERE name ILIKE '%sandbox%');
DELETE FROM public.courses WHERE name ILIKE '%sandbox%';
DELETE FROM public.posts WHERE author_id IN (SELECT id FROM public.profiles WHERE username ILIKE '%sandbox%' OR display_name ILIKE '%sandbox%');
DELETE FROM public.profiles WHERE username ILIKE '%sandbox%' OR display_name ILIKE '%sandbox%';
DELETE FROM public.mock_seed_registry WHERE batch = 'chainlink_sandbox';