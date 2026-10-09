-- ENUMS
DO $$ BEGIN CREATE TYPE public.wardrobe_slot AS ENUM ('shirt','shorts','pants','shoes','hat','glasses','jacket','accessory','bag','cart'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.wardrobe_rarity AS ENUM ('common','rare','epic','legendary'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.disc_category AS ENUM ('distance_driver','fairway_driver','midrange','putter','approach','specialty'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.disc_stability AS ENUM ('very_overstable','overstable','stable','understable','very_understable'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.disc_plastic_tier AS ENUM ('base','premium','premium_glow','tournament','special'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.disc_condition AS ENUM ('new','beat_in','worn','retired'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- WARDROBE
CREATE TABLE public.wardrobe_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot public.wardrobe_slot NOT NULL,
  style_key text NOT NULL,
  name text NOT NULL,
  description text,
  palette jsonb NOT NULL DEFAULT '{}'::jsonb,
  rarity public.wardrobe_rarity NOT NULL DEFAULT 'common',
  unlock_rule jsonb NOT NULL DEFAULT '{"type":"default"}'::jsonb,
  is_starter boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slot, style_key)
);
GRANT SELECT ON public.wardrobe_items TO anon, authenticated;
GRANT ALL ON public.wardrobe_items TO service_role;
ALTER TABLE public.wardrobe_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Wardrobe public read" ON public.wardrobe_items FOR SELECT USING (true);
CREATE POLICY "Wardrobe admin write" ON public.wardrobe_items FOR ALL USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE TABLE public.user_wardrobe (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.wardrobe_items(id) ON DELETE CASCADE,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  custom_colors jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (user_id, item_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_wardrobe TO authenticated;
GRANT ALL ON public.user_wardrobe TO service_role;
ALTER TABLE public.user_wardrobe ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own wardrobe" ON public.user_wardrobe FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- AVATAR CONFIG
CREATE TABLE public.avatar_configs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  skin_tone text NOT NULL DEFAULT 'medium',
  hair_style text NOT NULL DEFAULT 'short',
  hair_color text NOT NULL DEFAULT '#3b2a1a',
  eye_shape text NOT NULL DEFAULT 'round',
  eye_color text NOT NULL DEFAULT '#4b6a3b',
  brow_style text NOT NULL DEFAULT 'natural',
  mouth_style text NOT NULL DEFAULT 'smile',
  facial_hair text NOT NULL DEFAULT 'none',
  body_type text NOT NULL DEFAULT 'average',
  height_cm integer NOT NULL DEFAULT 178,
  shirt_item_id uuid REFERENCES public.wardrobe_items(id) ON DELETE SET NULL,
  shorts_item_id uuid REFERENCES public.wardrobe_items(id) ON DELETE SET NULL,
  shoes_item_id uuid REFERENCES public.wardrobe_items(id) ON DELETE SET NULL,
  hat_item_id uuid REFERENCES public.wardrobe_items(id) ON DELETE SET NULL,
  glasses_item_id uuid REFERENCES public.wardrobe_items(id) ON DELETE SET NULL,
  jacket_item_id uuid REFERENCES public.wardrobe_items(id) ON DELETE SET NULL,
  accessory_item_id uuid REFERENCES public.wardrobe_items(id) ON DELETE SET NULL,
  pose text NOT NULL DEFAULT 'hero',
  background text NOT NULL DEFAULT 'course',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avatar_configs TO authenticated;
GRANT SELECT ON public.avatar_configs TO anon;
GRANT ALL ON public.avatar_configs TO service_role;
ALTER TABLE public.avatar_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Avatars public read" ON public.avatar_configs FOR SELECT USING (true);
CREATE POLICY "Own avatar write" ON public.avatar_configs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER avatar_configs_updated BEFORE UPDATE ON public.avatar_configs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- BAG CONFIG
CREATE TABLE public.bag_configs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  bag_item_id uuid REFERENCES public.wardrobe_items(id) ON DELETE SET NULL,
  bag_primary_color text NOT NULL DEFAULT '#1f6b3a',
  bag_secondary_color text NOT NULL DEFAULT '#0f3d21',
  patch_text text,
  cart_item_id uuid REFERENCES public.wardrobe_items(id) ON DELETE SET NULL,
  cart_primary_color text NOT NULL DEFAULT '#1f6b3a',
  cart_secondary_color text NOT NULL DEFAULT '#0f3d21',
  wheel_style text NOT NULL DEFAULT 'standard',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bag_configs TO authenticated;
GRANT SELECT ON public.bag_configs TO anon;
GRANT ALL ON public.bag_configs TO service_role;
ALTER TABLE public.bag_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Bags public read" ON public.bag_configs FOR SELECT USING (true);
CREATE POLICY "Own bag write" ON public.bag_configs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER bag_configs_updated BEFORE UPDATE ON public.bag_configs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- DISC CATALOG
CREATE TABLE public.disc_manufacturers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  country text,
  website text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.disc_manufacturers TO anon, authenticated;
GRANT ALL ON public.disc_manufacturers TO service_role;
ALTER TABLE public.disc_manufacturers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Manufacturers public read" ON public.disc_manufacturers FOR SELECT USING (true);
CREATE POLICY "Manufacturers admin write" ON public.disc_manufacturers FOR ALL USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE TABLE public.disc_molds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer_id uuid NOT NULL REFERENCES public.disc_manufacturers(id) ON DELETE CASCADE,
  name text NOT NULL,
  category public.disc_category NOT NULL,
  speed numeric(3,1) NOT NULL,
  glide numeric(3,1) NOT NULL,
  turn numeric(3,1) NOT NULL,
  fade numeric(3,1) NOT NULL,
  stability public.disc_stability NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (manufacturer_id, name)
);
GRANT SELECT ON public.disc_molds TO anon, authenticated;
GRANT ALL ON public.disc_molds TO service_role;
ALTER TABLE public.disc_molds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Molds public read" ON public.disc_molds FOR SELECT USING (true);
CREATE POLICY "Molds admin write" ON public.disc_molds FOR ALL USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE INDEX disc_molds_manufacturer_idx ON public.disc_molds(manufacturer_id);
CREATE INDEX disc_molds_category_idx ON public.disc_molds(category);

CREATE TABLE public.disc_plastics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer_id uuid NOT NULL REFERENCES public.disc_manufacturers(id) ON DELETE CASCADE,
  name text NOT NULL,
  tier public.disc_plastic_tier NOT NULL DEFAULT 'premium',
  durability integer NOT NULL DEFAULT 5,
  grip integer NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (manufacturer_id, name)
);
GRANT SELECT ON public.disc_plastics TO anon, authenticated;
GRANT ALL ON public.disc_plastics TO service_role;
ALTER TABLE public.disc_plastics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Plastics public read" ON public.disc_plastics FOR SELECT USING (true);
CREATE POLICY "Plastics admin write" ON public.disc_plastics FOR ALL USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE INDEX disc_plastics_manufacturer_idx ON public.disc_plastics(manufacturer_id);

-- USER DISCS
CREATE TABLE public.user_discs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mold_id uuid NOT NULL REFERENCES public.disc_molds(id) ON DELETE RESTRICT,
  plastic_id uuid REFERENCES public.disc_plastics(id) ON DELETE SET NULL,
  weight_g integer,
  color text NOT NULL DEFAULT '#e11d48',
  stamp_note text,
  nickname text,
  condition public.disc_condition NOT NULL DEFAULT 'new',
  is_favorite boolean NOT NULL DEFAULT false,
  slot_order integer NOT NULL DEFAULT 0,
  notes text,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_discs TO authenticated;
GRANT ALL ON public.user_discs TO service_role;
ALTER TABLE public.user_discs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Discs public read" ON public.user_discs FOR SELECT USING (true);
CREATE POLICY "Own discs write" ON public.user_discs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX user_discs_user_idx ON public.user_discs(user_id, slot_order);
CREATE TRIGGER user_discs_updated BEFORE UPDATE ON public.user_discs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- STARTER WARDROBE SEED
INSERT INTO public.wardrobe_items (slot, style_key, name, palette, rarity, unlock_rule, is_starter, sort_order) VALUES
  ('shirt','tee_classic','Classic Tee', '{"primary":"#2563eb"}', 'common', '{"type":"default"}', true, 1),
  ('shirt','tee_stripes','Striped Tee', '{"primary":"#0ea5e9","secondary":"#ffffff"}', 'common', '{"type":"level","value":2}', false, 2),
  ('shirt','polo','Course Polo', '{"primary":"#166534"}', 'common', '{"type":"level","value":3}', false, 3),
  ('shirt','hoodie','Chain Hoodie', '{"primary":"#374151"}', 'rare', '{"type":"level","value":6}', false, 4),
  ('shirt','tank','Sun Tank', '{"primary":"#f59e0b"}', 'common', '{"type":"coins","value":300}', false, 5),
  ('shirt','jersey','Tour Jersey', '{"primary":"#dc2626","secondary":"#ffffff"}', 'epic', '{"type":"level","value":15}', false, 6),
  ('shorts','shorts_classic','Classic Shorts', '{"primary":"#111827"}', 'common', '{"type":"default"}', true, 1),
  ('shorts','shorts_cargo','Cargo Shorts', '{"primary":"#78716c"}', 'common', '{"type":"level","value":3}', false, 2),
  ('shorts','pants_athletic','Athletic Pants', '{"primary":"#1f2937"}', 'common', '{"type":"level","value":4}', false, 3),
  ('shorts','shorts_bright','Bright Shorts', '{"primary":"#0ea5e9"}', 'rare', '{"type":"coins","value":400}', false, 4),
  ('shoes','sneakers','Sneakers', '{"primary":"#ffffff","secondary":"#111827"}', 'common', '{"type":"default"}', true, 1),
  ('shoes','trail','Trail Shoes', '{"primary":"#7c2d12"}', 'common', '{"type":"level","value":4}', false, 2),
  ('shoes','runners','Runners', '{"primary":"#f97316"}', 'common', '{"type":"coins","value":250}', false, 3),
  ('hat','none','No Hat', '{}', 'common', '{"type":"default"}', true, 0),
  ('hat','cap','Ball Cap', '{"primary":"#166534"}', 'common', '{"type":"default"}', true, 1),
  ('hat','trucker','Trucker Hat', '{"primary":"#1f2937","secondary":"#ffffff"}', 'common', '{"type":"level","value":2}', false, 2),
  ('hat','bucket','Bucket Hat', '{"primary":"#84cc16"}', 'rare', '{"type":"level","value":8}', false, 3),
  ('hat','visor','Sun Visor', '{"primary":"#0ea5e9"}', 'common', '{"type":"coins","value":200}', false, 4),
  ('hat','beanie','Beanie', '{"primary":"#7c2d12"}', 'common', '{"type":"achievement","value":"first_ace"}', false, 5),
  ('glasses','none','No Glasses', '{}', 'common', '{"type":"default"}', true, 0),
  ('glasses','shades','Sunglasses', '{"primary":"#111827"}', 'common', '{"type":"level","value":2}', false, 1),
  ('glasses','sport','Sport Shades', '{"primary":"#dc2626"}', 'rare', '{"type":"level","value":10}', false, 2),
  ('jacket','none','No Jacket', '{}', 'common', '{"type":"default"}', true, 0),
  ('jacket','windbreaker','Windbreaker', '{"primary":"#0ea5e9"}', 'rare', '{"type":"level","value":7}', false, 1),
  ('jacket','rain','Rain Jacket', '{"primary":"#f59e0b"}', 'rare', '{"type":"coins","value":600}', false, 2),
  ('accessory','none','None', '{}', 'common', '{"type":"default"}', true, 0),
  ('accessory','towel','Belt Towel', '{"primary":"#0ea5e9"}', 'common', '{"type":"level","value":2}', false, 1),
  ('accessory','glove','Glove', '{"primary":"#111827"}', 'common', '{"type":"achievement","value":"rounds_10"}', false, 2),
  ('bag','bag_starter','Starter Bag', '{"primary":"#1f6b3a","secondary":"#0f3d21"}', 'common', '{"type":"default"}', true, 1),
  ('bag','bag_tour','Tour Bag', '{"primary":"#1f2937","secondary":"#f59e0b"}', 'rare', '{"type":"level","value":5}', false, 2),
  ('bag','bag_backpack','Backpack Bag', '{"primary":"#0f172a","secondary":"#0ea5e9"}', 'epic', '{"type":"level","value":12}', false, 3),
  ('bag','bag_luxury','Pro Tour Bag', '{"primary":"#000000","secondary":"#eab308"}', 'legendary', '{"type":"level","value":25}', false, 4),
  ('cart','cart_none','No Cart', '{}', 'common', '{"type":"default"}', true, 0),
  ('cart','cart_pull','Pull Cart', '{"primary":"#111827","secondary":"#dc2626"}', 'common', '{"type":"level","value":4}', false, 1),
  ('cart','cart_zuca','Rolling Cart', '{"primary":"#0ea5e9","secondary":"#111827"}', 'rare', '{"type":"coins","value":800}', false, 2),
  ('cart','cart_pro','Pro Cart', '{"primary":"#f59e0b","secondary":"#111827"}', 'epic', '{"type":"level","value":18}', false, 3);

-- ACHIEVEMENTS SEED (map style/gear to misc category)
INSERT INTO public.achievements (key, name, description, category, tier, xp_reward, coin_reward, icon) VALUES
  ('dress_up','Dressed to Impress','Save your first custom avatar','misc','bronze', 50, 25, 'shirt'),
  ('fashionista','Fashionista','Own 10 different wardrobe items','misc','silver', 150, 75, 'shirt'),
  ('full_kit','Full Kit','Equip every wardrobe slot','misc','silver', 200, 100, 'sparkles'),
  ('bag_builder','Bag Builder','Add your first disc to your bag','misc','bronze', 50, 25, 'briefcase'),
  ('deep_bag','Deep Bag','Register 15+ discs in your bag','misc','silver', 200, 100, 'briefcase'),
  ('well_rounded','Well Rounded','Carry discs in every core category','misc','silver', 175, 75, 'target'),
  ('collector','Disc Collector','Own discs from 3+ manufacturers','misc','gold', 300, 150, 'trophy')
ON CONFLICT (key) DO NOTHING;

-- STARTER GRANT + TRIGGERS
CREATE OR REPLACE FUNCTION public.grant_starter_wardrobe(_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_wardrobe (user_id, item_id)
  SELECT _user, id FROM public.wardrobe_items WHERE is_starter = true
  ON CONFLICT DO NOTHING;
END; $$;

CREATE OR REPLACE FUNCTION public.on_avatar_saved()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owned integer; equipped_slots integer;
BEGIN
  PERFORM public.grant_starter_wardrobe(NEW.user_id);
  IF TG_OP = 'INSERT' THEN PERFORM public.award_achievement(NEW.user_id, 'dress_up'); END IF;
  SELECT COUNT(*) INTO owned FROM public.user_wardrobe WHERE user_id = NEW.user_id;
  IF owned >= 10 THEN PERFORM public.award_achievement(NEW.user_id, 'fashionista'); END IF;
  equipped_slots := (CASE WHEN NEW.shirt_item_id IS NOT NULL THEN 1 ELSE 0 END)
                  + (CASE WHEN NEW.shorts_item_id IS NOT NULL THEN 1 ELSE 0 END)
                  + (CASE WHEN NEW.shoes_item_id IS NOT NULL THEN 1 ELSE 0 END)
                  + (CASE WHEN NEW.hat_item_id IS NOT NULL THEN 1 ELSE 0 END)
                  + (CASE WHEN NEW.glasses_item_id IS NOT NULL THEN 1 ELSE 0 END)
                  + (CASE WHEN NEW.jacket_item_id IS NOT NULL THEN 1 ELSE 0 END)
                  + (CASE WHEN NEW.accessory_item_id IS NOT NULL THEN 1 ELSE 0 END);
  IF equipped_slots >= 6 THEN PERFORM public.award_achievement(NEW.user_id, 'full_kit'); END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_avatar_saved AFTER INSERT OR UPDATE ON public.avatar_configs FOR EACH ROW EXECUTE FUNCTION public.on_avatar_saved();

CREATE OR REPLACE FUNCTION public.on_user_disc_added()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ct integer; cats integer; mfrs integer;
BEGIN
  PERFORM public.award_achievement(NEW.user_id, 'bag_builder');
  SELECT COUNT(*) INTO ct FROM public.user_discs WHERE user_id = NEW.user_id AND condition <> 'retired';
  IF ct >= 15 THEN PERFORM public.award_achievement(NEW.user_id, 'deep_bag'); END IF;
  SELECT COUNT(DISTINCT m.category) INTO cats FROM public.user_discs ud JOIN public.disc_molds m ON m.id = ud.mold_id
    WHERE ud.user_id = NEW.user_id AND ud.condition <> 'retired' AND m.category IN ('distance_driver','fairway_driver','midrange','putter');
  IF cats >= 4 THEN PERFORM public.award_achievement(NEW.user_id, 'well_rounded'); END IF;
  SELECT COUNT(DISTINCT m.manufacturer_id) INTO mfrs FROM public.user_discs ud JOIN public.disc_molds m ON m.id = ud.mold_id
    WHERE ud.user_id = NEW.user_id AND ud.condition <> 'retired';
  IF mfrs >= 3 THEN PERFORM public.award_achievement(NEW.user_id, 'collector'); END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_user_disc_added AFTER INSERT ON public.user_discs FOR EACH ROW EXECUTE FUNCTION public.on_user_disc_added();
