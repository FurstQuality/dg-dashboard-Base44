INSERT INTO public.rule_documents (code,title,summary,sort) VALUES
 ('founding_standard','DGD Founding Standard','The player-first promises every other DGD standard must follow: free ratings, no membership tax, cash for amateurs and the 30+ division.',5);

INSERT INTO public.rule_document_versions (document_id,version_label,status,changelog)
SELECT id,'1.0 Draft','proposed','First founding principles, open for review. Not yet in effect.' FROM public.rule_documents WHERE code='founding_standard';
INSERT INTO public.rule_document_versions (document_id,version_label,status,changelog)
SELECT id,'1.0 Draft','proposed','First division structure and age rule, open for review. Not yet in effect.' FROM public.rule_documents WHERE code='division_standard';

INSERT INTO public.rule_entries (version_id,number,parent_number,kind,title,body,is_protected,sort)
SELECT (SELECT v.id FROM public.rule_document_versions v JOIN public.rule_documents d ON d.id=v.document_id WHERE d.code='founding_standard' AND v.version_label='1.0 Draft'), x.* FROM (VALUES
('F1',NULL,'section','Free for every player','',false,100),
('F1.1','F1','rule','Free Player ID and Rating','Every player gets a DGD Player ID, DGD Rating, round ratings, rating history, public results, the rulebook, event discovery and series standings at no cost.',true,101),
('F1.2','F1','rule','No mandatory membership','No player needs a paid membership to receive or keep a DGD Rating, appear in official standings, play a rating-eligible event or accept a payout.',true,102),
('F1.3','F1','rule','No non-member surcharge','Events may not charge a player more because they have not bought an association membership. Entry fees stay under the event director''s control.',true,103),
('F1.4','F1','rule','Optional supporter membership','A future supporter membership may offer badges, merchandise, discounts or recognition. It can never buy rating, division, cash or registration eligibility.',true,104),
('F2',NULL,'section','Amateurs and cash','',false,200),
('F2.1','F2','rule','Amateur is a skill class, not a prize type','Amateur describes who a player competes against. Amateurs may win cash, merchandise, credit, trophies or any mix.',true,201),
('F2.2','F2','rule','Cash does not change status','Accepting cash at a DGD event never turns an amateur into a professional and never changes which divisions they may enter.',true,202),
('F2.3','F2','rule','Money never changes ratings','How much or what kind of prize a player won has no effect on their DGD Rating.',true,203),
('F3',NULL,'section','Age-protected 30+ division','',false,300),
('F3.1','F3','rule','30+ is a recognized division','30+ is a permanent, official DGD age-protected division, not a custom event tag. Events are not required to offer it.',true,301),
('F4',NULL,'section','Ratings and events','',false,400),
('F4.1','F4','rule','$0-entry events may be rated','Free events and free leagues can be rating-eligible when they meet the DGD event standard. Paying an entry fee is never what makes a round count.',true,401),
('F4.2','F4','rule','Rating integrity is independent of payment','No player or event can pay to raise, protect or freeze a rating.',true,402),
('F4.3','F4','rule','Transparent event money','Every sanctioned event shows players where their entry goes: payout, prizes, course or club, costs and any association fee.',true,403)
) AS x(number,parent_number,kind,title,body,is_protected,sort);

INSERT INTO public.rule_entries (version_id,number,parent_number,kind,title,body,is_protected,sort)
SELECT (SELECT v.id FROM public.rule_document_versions v JOIN public.rule_documents d ON d.id=v.document_id WHERE d.code='division_standard' AND v.version_label='1.0 Draft'), x.* FROM (VALUES
('D100',NULL,'section','Division structure','',false,100),
('D100.1','D100','rule','Independent dimensions','Every division combines a competition class (Open or Amateur), an optional skill band and an optional age band, so events can offer pairings such as 30+ Open or 40+ Amateur.',true,101),
('D100.2','D100','rule','Division codes','Codes such as O, A1–A4 and A30 are working names and may change before this standard takes effect. Eligibility always comes from the division''s stored limits, never from its code.',false,102),
('D200',NULL,'section','Age eligibility','',false,200),
('D200.1','D200','rule','Calendar-year age rule','A player is eligible for an age-protected division for the whole calendar year in which they reach that age.',true,201),
('D200.2','D200','rule','Supported age bands','30+, 40+, 50+, 55+, 60+, 65+, 70+, 75+ and 80+.',false,202),
('D300',NULL,'section','Playing up and down','',false,300),
('D300.1','D300','rule','Players may play up','A player may always enter a division with a higher skill band or a lower age minimum than they qualify for.',true,301),
('D300.2','D300','rule','Players may not play down','A player may not enter a skill band below their DGD Rating at the event''s eligibility snapshot, or an age band they have not reached.',true,302),
('D300.3','D300','rule','Cash does not affect eligibility','Past cash winnings never decide which divisions a player may enter.',true,303)
) AS x(number,parent_number,kind,title,body,is_protected,sort);

CREATE TABLE public.dgd_divisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.rule_document_versions(id),
  code text NOT NULL,
  name text NOT NULL,
  competitive_class text NOT NULL CHECK (competitive_class IN ('open','amateur','junior')),
  skill_min int,
  skill_max int,
  age_min int,
  age_max int,
  cash_allowed boolean NOT NULL DEFAULT true,
  sort int NOT NULL DEFAULT 0,
  UNIQUE (version_id, code)
);
ALTER TABLE public.dgd_divisions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.dgd_divisions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.dgd_divisions TO authenticated;
GRANT ALL ON public.dgd_divisions TO service_role;
CREATE POLICY "Public reads divisions of visible standards" ON public.dgd_divisions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.rule_document_versions v WHERE v.id = version_id
                 AND (v.status <> 'draft' OR public.has_role(auth.uid(),'super_admin'))));
CREATE POLICY "Super admins manage divisions" ON public.dgd_divisions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER dgd_divisions_guard BEFORE INSERT OR UPDATE OR DELETE ON public.dgd_divisions
  FOR EACH ROW EXECUTE FUNCTION public.rule_entry_guard();

INSERT INTO public.dgd_divisions (version_id,code,name,competitive_class,age_min,sort)
SELECT (SELECT v.id FROM public.rule_document_versions v JOIN public.rule_documents d ON d.id=v.document_id WHERE d.code='division_standard' AND v.version_label='1.0 Draft'), x.* FROM (VALUES
 ('O','Open','open',NULL::int,10),('A1','Amateur 1','amateur',NULL,20),('A2','Amateur 2','amateur',NULL,30),('A3','Amateur 3','amateur',NULL,40),('A4','Amateur 4','amateur',NULL,50),
 ('O30','30+ Open','open',30,60),('A30','30+ Amateur','amateur',30,70),('O40','40+ Open','open',40,80),('A40','40+ Amateur','amateur',40,90),
 ('O50','50+ Open','open',50,100),('O55','55+ Open','open',55,110),('O60','60+ Open','open',60,120),('O65','65+ Open','open',65,130),
 ('O70','70+ Open','open',70,140),('O75','75+ Open','open',75,150),('O80','80+ Open','open',80,160)
) AS x(code,name,competitive_class,age_min,sort);