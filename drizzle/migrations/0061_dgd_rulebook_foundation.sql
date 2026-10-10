CREATE TYPE public.rule_status AS ENUM ('draft','proposed','under_review','approved','published','superseded','retired');

CREATE TABLE public.rule_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  title text NOT NULL,
  summary text NOT NULL,
  sort int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.rule_document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.rule_documents(id),
  version_label text NOT NULL,
  status public.rule_status NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  effective_at timestamptz,
  changelog text,
  supersedes_id uuid REFERENCES public.rule_document_versions(id),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version_label)
);
CREATE INDEX ON public.rule_document_versions (document_id, status);

CREATE TABLE public.rule_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.rule_document_versions(id),
  number text NOT NULL,
  parent_number text,
  kind text NOT NULL DEFAULT 'rule' CHECK (kind IN ('section','rule','definition','note')),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  is_protected boolean NOT NULL DEFAULT false,
  sort int NOT NULL DEFAULT 0,
  UNIQUE (version_id, number)
);
CREATE INDEX ON public.rule_entries (version_id, sort);

-- Published history is immutable; only drafts may be deleted or edited.
CREATE OR REPLACE FUNCTION public.rule_version_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'Only draft rule versions can be deleted'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status IN ('published','superseded','retired') THEN
    IF NEW.version_label <> OLD.version_label OR NEW.document_id <> OLD.document_id
       OR NEW.published_at IS DISTINCT FROM OLD.published_at
       OR NEW.effective_at IS DISTINCT FROM OLD.effective_at
       OR NOT (NEW.status IN ('published','superseded','retired')) THEN
      RAISE EXCEPTION 'Published rule versions are frozen; only supersede or retire them';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rule_version_guard BEFORE UPDATE OR DELETE ON public.rule_document_versions
  FOR EACH ROW EXECUTE FUNCTION public.rule_version_guard();

CREATE OR REPLACE FUNCTION public.rule_entry_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE s public.rule_status;
BEGIN
  SELECT status INTO s FROM public.rule_document_versions
   WHERE id = COALESCE(NEW.version_id, OLD.version_id);
  IF s NOT IN ('draft','proposed','under_review') THEN
    RAISE EXCEPTION 'Rules in an approved or published version cannot change';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER rule_entry_guard BEFORE INSERT OR UPDATE OR DELETE ON public.rule_entries
  FOR EACH ROW EXECUTE FUNCTION public.rule_entry_guard();

ALTER TABLE public.rule_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rule_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rule_entries ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.rule_documents, public.rule_document_versions, public.rule_entries TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.rule_documents, public.rule_document_versions, public.rule_entries TO authenticated;
GRANT ALL ON public.rule_documents, public.rule_document_versions, public.rule_entries TO service_role;

CREATE POLICY "Anyone reads rule documents" ON public.rule_documents FOR SELECT USING (true);
CREATE POLICY "Super admins edit rule documents" ON public.rule_documents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "Public reads non-draft versions" ON public.rule_document_versions FOR SELECT
  USING (status <> 'draft' OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "Super admins manage versions" ON public.rule_document_versions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "Public reads rules of visible versions" ON public.rule_entries FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.rule_document_versions v WHERE v.id = version_id
                 AND (v.status <> 'draft' OR public.has_role(auth.uid(),'super_admin'))));
CREATE POLICY "Super admins manage rules" ON public.rule_entries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- Event ruleset binding + pinning.
ALTER TABLE public.tournaments
  ADD COLUMN governing_ruleset text NOT NULL DEFAULT 'custom' CHECK (governing_ruleset IN ('dgd','pdga','custom')),
  ADD COLUMN rules_version_id uuid REFERENCES public.rule_document_versions(id);
ALTER TABLE public.leagues
  ADD COLUMN governing_ruleset text NOT NULL DEFAULT 'custom' CHECK (governing_ruleset IN ('dgd','pdga','custom')),
  ADD COLUMN rules_version_id uuid REFERENCES public.rule_document_versions(id);
UPDATE public.tournaments SET governing_ruleset='pdga' WHERE pdga_sanctioned;
UPDATE public.leagues SET governing_ruleset='pdga' WHERE pdga_sanctioned;

-- Seed documents.
INSERT INTO public.rule_documents (code,title,summary,sort) VALUES
 ('rules_of_play','DGD Rules of Play','How the game is played: throws, lies, obstacles, out-of-bounds, scoring and rulings.',10),
 ('competition_code','DGD Competition Code','How organized events run: registration, check-in, cards, delays, scorecards, ties and results.',20),
 ('rating_standard','DGD Rating Standard','What counts toward a DGD Rating, how rounds are weighed and how the public scale works.',30),
 ('division_standard','DGD Division & Eligibility Standard','Which divisions exist and who may enter them.',40),
 ('payout_standard','DGD Payout & Player Value Standard','Minimum payouts, rounding, curves and side funds.',50),
 ('sanctioning_standard','DGD Tour & Sanctioning Standard','Event tiers and what each tier must provide.',60),
 ('course_standard','DGD Course & Layout Standard','What a sanctioned layout must document.',70),
 ('equipment_standard','DGD Equipment Standard','Discs, baskets and tech allowed in sanctioned play.',80),
 ('series_league_standard','DGD Series & League Standard','How series points, leagues and finales are governed.',90),
 ('officials_standard','DGD Officials Standard','Who may make rulings and how officials are certified.',100),
 ('conduct_code','DGD Conduct & Discipline Code','Expected behavior, penalties and appeals.',110),
 ('safety_standard','DGD Safety Standard','Weather, hazards and keeping players and the public safe.',120);