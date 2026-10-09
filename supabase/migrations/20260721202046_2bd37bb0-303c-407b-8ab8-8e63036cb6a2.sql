
ALTER TYPE public.course_feature_type ADD VALUE IF NOT EXISTS 'ob_reference';

ALTER TABLE public.course_features
  ADD COLUMN IF NOT EXISTS ref_feature_id UUID REFERENCES public.course_features(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS course_features_ref_feature_id_idx ON public.course_features(ref_feature_id);
