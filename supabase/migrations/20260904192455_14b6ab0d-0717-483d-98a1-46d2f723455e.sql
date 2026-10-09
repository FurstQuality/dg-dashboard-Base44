CREATE OR REPLACE FUNCTION public.delete_round(_round_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _owner uuid;
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  SELECT created_by INTO _owner FROM public.rounds WHERE id = _round_id;
  IF _owner IS NULL THEN
    RAISE EXCEPTION 'Round not found';
  END IF;

  IF _owner <> _actor
     AND NOT public.has_role(_actor, 'admin')
     AND NOT public.has_role(_actor, 'super_admin') THEN
    RAISE EXCEPTION 'You can only delete rounds you started';
  END IF;

  DELETE FROM public.round_score_confirmations
   WHERE round_player_id IN (SELECT id FROM public.round_players WHERE round_id = _round_id);
  DELETE FROM public.round_scores WHERE round_id = _round_id;
  DELETE FROM public.round_players WHERE round_id = _round_id;
  DELETE FROM public.rounds WHERE id = _round_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_round(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_round(uuid) TO authenticated;