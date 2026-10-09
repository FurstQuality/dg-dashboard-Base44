-- Tier codes were dropped whenever PDGA hyphenated the label ("Pro-Am C-Tier").
UPDATE public.event_directory
SET tier = CASE
    WHEN sanctioning ~* 'elite series' THEN 'ES'
    WHEN sanctioning ~* 'national tour' THEN 'NT'
    WHEN sanctioning ~* 'silver' THEN 'SS'
    WHEN sanctioning ~* 'major' THEN CASE WHEN sanctioning ~* 'experimental' THEN 'XM' ELSE 'M' END
    WHEN sanctioning ~* 'league' THEN 'L'
    WHEN sanctioning ~* 'unsanctioned' THEN 'UNS'
    WHEN sanctioning ~* '\ma[[:space:]/-]*tier' THEN CASE WHEN sanctioning ~* 'experimental' THEN 'XA' ELSE 'A' END
    WHEN sanctioning ~* '\mb[[:space:]/-]*tier' OR sanctioning ~* '[ab][[:space:]/-]*b[[:space:]/-]*tier' THEN CASE WHEN sanctioning ~* 'experimental' THEN 'XB' ELSE 'B' END
    WHEN sanctioning ~* 'c[[:space:]/-]*tier' THEN CASE WHEN sanctioning ~* 'experimental' THEN 'XC' ELSE 'C' END
    ELSE tier
  END
WHERE source = 'pdga' AND tier IS NULL AND sanctioning IS NOT NULL;

-- A bare two-letter province code is a region, never a country.
UPDATE public.event_directory
SET state = country, country = 'Canada'
WHERE country IN ('AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT')
  AND (state IS NULL OR state = '');