UPDATE public.external_rounds
SET included = false, format = 'doubles'
WHERE source = 'udisc'
  AND notes ~ 'UDisc scorecard for .+ \+ .+'
  AND (included IS NULL OR included = true);