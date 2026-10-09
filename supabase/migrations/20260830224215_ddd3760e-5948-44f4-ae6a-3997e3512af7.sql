CREATE OR REPLACE FUNCTION public.normalize_us_state(_input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  t text;
  code text;
BEGIN
  IF _input IS NULL THEN RETURN NULL; END IF;
  t := lower(regexp_replace(trim(_input), '[.\u2019''`]', '', 'g'));
  t := trim(regexp_replace(t, '[^a-z0-9]+', ' ', 'g'));
  IF t = '' THEN RETURN NULL; END IF;

  -- strip zip codes and take the last comma segment when given "City, State ZIP"
  t := trim(regexp_replace(t, '\s\d{5}(\s\d{4})?$', '', 'g'));

  code := CASE t
    WHEN 'alabama' THEN 'AL' WHEN 'al' THEN 'AL' WHEN 'ala' THEN 'AL'
    WHEN 'alaska' THEN 'AK' WHEN 'ak' THEN 'AK'
    WHEN 'arizona' THEN 'AZ' WHEN 'az' THEN 'AZ' WHEN 'ariz' THEN 'AZ'
    WHEN 'arkansas' THEN 'AR' WHEN 'ar' THEN 'AR' WHEN 'ark' THEN 'AR'
    WHEN 'california' THEN 'CA' WHEN 'ca' THEN 'CA' WHEN 'calif' THEN 'CA' WHEN 'cal' THEN 'CA'
    WHEN 'colorado' THEN 'CO' WHEN 'co' THEN 'CO' WHEN 'colo' THEN 'CO'
    WHEN 'connecticut' THEN 'CT' WHEN 'ct' THEN 'CT' WHEN 'conn' THEN 'CT'
    WHEN 'delaware' THEN 'DE' WHEN 'de' THEN 'DE' WHEN 'del' THEN 'DE'
    WHEN 'district of columbia' THEN 'DC' WHEN 'dc' THEN 'DC' WHEN 'washington dc' THEN 'DC'
    WHEN 'florida' THEN 'FL' WHEN 'fl' THEN 'FL' WHEN 'fla' THEN 'FL'
    WHEN 'georgia' THEN 'GA' WHEN 'ga' THEN 'GA'
    WHEN 'hawaii' THEN 'HI' WHEN 'hi' THEN 'HI'
    WHEN 'idaho' THEN 'ID' WHEN 'id' THEN 'ID'
    WHEN 'illinois' THEN 'IL' WHEN 'il' THEN 'IL' WHEN 'ill' THEN 'IL'
    WHEN 'indiana' THEN 'IN' WHEN 'in' THEN 'IN' WHEN 'ind' THEN 'IN'
    WHEN 'iowa' THEN 'IA' WHEN 'ia' THEN 'IA'
    WHEN 'kansas' THEN 'KS' WHEN 'ks' THEN 'KS' WHEN 'kan' THEN 'KS' WHEN 'kans' THEN 'KS'
    WHEN 'kentucky' THEN 'KY' WHEN 'ky' THEN 'KY' WHEN 'ken' THEN 'KY'
    WHEN 'louisiana' THEN 'LA' WHEN 'la' THEN 'LA'
    WHEN 'maine' THEN 'ME' WHEN 'me' THEN 'ME'
    WHEN 'maryland' THEN 'MD' WHEN 'md' THEN 'MD'
    WHEN 'massachusetts' THEN 'MA' WHEN 'ma' THEN 'MA' WHEN 'mass' THEN 'MA'
    WHEN 'michigan' THEN 'MI' WHEN 'mi' THEN 'MI' WHEN 'mich' THEN 'MI'
    WHEN 'minnesota' THEN 'MN' WHEN 'mn' THEN 'MN' WHEN 'minn' THEN 'MN'
    WHEN 'mississippi' THEN 'MS' WHEN 'ms' THEN 'MS' WHEN 'miss' THEN 'MS'
    WHEN 'missouri' THEN 'MO' WHEN 'mo' THEN 'MO'
    WHEN 'montana' THEN 'MT' WHEN 'mt' THEN 'MT' WHEN 'mont' THEN 'MT'
    WHEN 'nebraska' THEN 'NE' WHEN 'ne' THEN 'NE' WHEN 'neb' THEN 'NE' WHEN 'nebr' THEN 'NE'
    WHEN 'nevada' THEN 'NV' WHEN 'nv' THEN 'NV' WHEN 'nev' THEN 'NV'
    WHEN 'new hampshire' THEN 'NH' WHEN 'nh' THEN 'NH' WHEN 'n hampshire' THEN 'NH'
    WHEN 'new jersey' THEN 'NJ' WHEN 'nj' THEN 'NJ' WHEN 'n jersey' THEN 'NJ'
    WHEN 'new mexico' THEN 'NM' WHEN 'nm' THEN 'NM' WHEN 'n mexico' THEN 'NM'
    WHEN 'new york' THEN 'NY' WHEN 'ny' THEN 'NY' WHEN 'n york' THEN 'NY'
    WHEN 'north carolina' THEN 'NC' WHEN 'nc' THEN 'NC' WHEN 'n carolina' THEN 'NC'
    WHEN 'north dakota' THEN 'ND' WHEN 'nd' THEN 'ND' WHEN 'n dakota' THEN 'ND'
    WHEN 'ohio' THEN 'OH' WHEN 'oh' THEN 'OH'
    WHEN 'oklahoma' THEN 'OK' WHEN 'ok' THEN 'OK' WHEN 'okla' THEN 'OK'
    WHEN 'oregon' THEN 'OR' WHEN 'or' THEN 'OR' WHEN 'ore' THEN 'OR' WHEN 'oreg' THEN 'OR'
    WHEN 'pennsylvania' THEN 'PA' WHEN 'pa' THEN 'PA' WHEN 'penn' THEN 'PA' WHEN 'penna' THEN 'PA'
    WHEN 'puerto rico' THEN 'PR' WHEN 'pr' THEN 'PR'
    WHEN 'rhode island' THEN 'RI' WHEN 'ri' THEN 'RI'
    WHEN 'south carolina' THEN 'SC' WHEN 'sc' THEN 'SC' WHEN 's carolina' THEN 'SC'
    WHEN 'south dakota' THEN 'SD' WHEN 'sd' THEN 'SD' WHEN 's dakota' THEN 'SD'
    WHEN 'tennessee' THEN 'TN' WHEN 'tn' THEN 'TN' WHEN 'tenn' THEN 'TN'
    WHEN 'texas' THEN 'TX' WHEN 'tx' THEN 'TX' WHEN 'tex' THEN 'TX'
    WHEN 'utah' THEN 'UT' WHEN 'ut' THEN 'UT'
    WHEN 'vermont' THEN 'VT' WHEN 'vt' THEN 'VT'
    WHEN 'virginia' THEN 'VA' WHEN 'va' THEN 'VA'
    WHEN 'washington' THEN 'WA' WHEN 'wa' THEN 'WA' WHEN 'wash' THEN 'WA'
    WHEN 'west virginia' THEN 'WV' WHEN 'wv' THEN 'WV' WHEN 'w virginia' THEN 'WV'
    WHEN 'wisconsin' THEN 'WI' WHEN 'wi' THEN 'WI' WHEN 'wis' THEN 'WI' WHEN 'wisc' THEN 'WI'
    WHEN 'wyoming' THEN 'WY' WHEN 'wy' THEN 'WY' WHEN 'wyo' THEN 'WY'
    ELSE NULL
  END;

  IF code IS NOT NULL THEN RETURN code; END IF;

  -- try the trailing segment of a location string, e.g. "carmel indiana"
  IF position(',' in _input) > 0 THEN
    RETURN public.normalize_us_state(split_part(_input, ',', array_length(string_to_array(_input, ','), 1)));
  END IF;

  RETURN NULL;
END;
$$;

-- Keep new and edited rows canonical, whichever surface wrote them.
CREATE OR REPLACE FUNCTION public.normalize_state_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.state := COALESCE(public.normalize_us_state(NEW.state), NEW.state);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_home_state_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.home_state := COALESCE(public.normalize_us_state(NEW.home_state), NEW.home_state);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_courses_normalize_state ON public.courses;
CREATE TRIGGER trg_courses_normalize_state
  BEFORE INSERT OR UPDATE OF state ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.normalize_state_column();

DROP TRIGGER IF EXISTS trg_scheduled_events_normalize_state ON public.scheduled_events;
CREATE TRIGGER trg_scheduled_events_normalize_state
  BEFORE INSERT OR UPDATE OF state ON public.scheduled_events
  FOR EACH ROW EXECUTE FUNCTION public.normalize_state_column();

DROP TRIGGER IF EXISTS trg_pdga_tour_events_normalize_state ON public.pdga_tour_events;
CREATE TRIGGER trg_pdga_tour_events_normalize_state
  BEFORE INSERT OR UPDATE OF state ON public.pdga_tour_events
  FOR EACH ROW EXECUTE FUNCTION public.normalize_state_column();

DROP TRIGGER IF EXISTS trg_dgcr_courses_normalize_state ON public.dgcr_courses;
CREATE TRIGGER trg_dgcr_courses_normalize_state
  BEFORE INSERT OR UPDATE OF state ON public.dgcr_courses
  FOR EACH ROW EXECUTE FUNCTION public.normalize_state_column();

DROP TRIGGER IF EXISTS trg_pdga_kb_courses_normalize_state ON public.pdga_kb_courses;
CREATE TRIGGER trg_pdga_kb_courses_normalize_state
  BEFORE INSERT OR UPDATE OF state ON public.pdga_kb_courses
  FOR EACH ROW EXECUTE FUNCTION public.normalize_state_column();

DROP TRIGGER IF EXISTS trg_pdga_kb_events_normalize_state ON public.pdga_kb_events;
CREATE TRIGGER trg_pdga_kb_events_normalize_state
  BEFORE INSERT OR UPDATE OF state ON public.pdga_kb_events
  FOR EACH ROW EXECUTE FUNCTION public.normalize_state_column();

DROP TRIGGER IF EXISTS trg_pdga_kb_players_normalize_state ON public.pdga_kb_players;
CREATE TRIGGER trg_pdga_kb_players_normalize_state
  BEFORE INSERT OR UPDATE OF state ON public.pdga_kb_players
  FOR EACH ROW EXECUTE FUNCTION public.normalize_state_column();

DROP TRIGGER IF EXISTS trg_pdga_players_normalize_state ON public.pdga_players;
CREATE TRIGGER trg_pdga_players_normalize_state
  BEFORE INSERT OR UPDATE OF state ON public.pdga_players
  FOR EACH ROW EXECUTE FUNCTION public.normalize_state_column();

DROP TRIGGER IF EXISTS trg_profiles_normalize_home_state ON public.profiles;
CREATE TRIGGER trg_profiles_normalize_home_state
  BEFORE INSERT OR UPDATE OF home_state ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.normalize_home_state_column();

-- Backfill every existing row so old and new spellings share one filter value.
UPDATE public.courses SET state = public.normalize_us_state(state)
  WHERE state IS NOT NULL AND public.normalize_us_state(state) IS NOT NULL
    AND public.normalize_us_state(state) <> state;
UPDATE public.scheduled_events SET state = public.normalize_us_state(state)
  WHERE state IS NOT NULL AND public.normalize_us_state(state) IS NOT NULL
    AND public.normalize_us_state(state) <> state;
UPDATE public.pdga_tour_events SET state = public.normalize_us_state(state)
  WHERE state IS NOT NULL AND public.normalize_us_state(state) IS NOT NULL
    AND public.normalize_us_state(state) <> state;
UPDATE public.dgcr_courses SET state = public.normalize_us_state(state)
  WHERE state IS NOT NULL AND public.normalize_us_state(state) IS NOT NULL
    AND public.normalize_us_state(state) <> state;
UPDATE public.pdga_kb_courses SET state = public.normalize_us_state(state)
  WHERE state IS NOT NULL AND public.normalize_us_state(state) IS NOT NULL
    AND public.normalize_us_state(state) <> state;
UPDATE public.pdga_kb_events SET state = public.normalize_us_state(state)
  WHERE state IS NOT NULL AND public.normalize_us_state(state) IS NOT NULL
    AND public.normalize_us_state(state) <> state;
UPDATE public.pdga_kb_players SET state = public.normalize_us_state(state)
  WHERE state IS NOT NULL AND public.normalize_us_state(state) IS NOT NULL
    AND public.normalize_us_state(state) <> state;
UPDATE public.pdga_players SET state = public.normalize_us_state(state)
  WHERE state IS NOT NULL AND public.normalize_us_state(state) IS NOT NULL
    AND public.normalize_us_state(state) <> state;
UPDATE public.profiles SET home_state = public.normalize_us_state(home_state)
  WHERE home_state IS NOT NULL AND public.normalize_us_state(home_state) IS NOT NULL
    AND public.normalize_us_state(home_state) <> home_state;