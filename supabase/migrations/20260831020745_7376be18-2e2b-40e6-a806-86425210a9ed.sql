-- 1. Merge duplicate Axiom brand ------------------------------------------------
DO $$
DECLARE dup uuid; keep uuid;
BEGIN
  SELECT id INTO dup FROM public.disc_manufacturers WHERE name = 'Axiom';
  SELECT id INTO keep FROM public.disc_manufacturers WHERE name = 'Axiom Discs';
  IF dup IS NOT NULL AND keep IS NOT NULL THEN
    -- Repoint bagged discs from duplicate molds onto the surviving mold of the same name.
    UPDATE public.user_discs u
       SET mold_id = k.id
      FROM public.disc_molds dupm
      JOIN public.disc_molds k ON k.manufacturer_id = keep AND k.name = dupm.name
     WHERE dupm.manufacturer_id = dup AND u.mold_id = dupm.id;
    -- Move molds that have no counterpart under the surviving brand.
    UPDATE public.disc_molds d SET manufacturer_id = keep
     WHERE d.manufacturer_id = dup
       AND NOT EXISTS (SELECT 1 FROM public.disc_molds k WHERE k.manufacturer_id = keep AND k.name = d.name);
    UPDATE public.disc_plastics p SET manufacturer_id = keep
     WHERE p.manufacturer_id = dup
       AND NOT EXISTS (SELECT 1 FROM public.disc_plastics k WHERE k.manufacturer_id = keep AND k.name = p.name);
    DELETE FROM public.disc_molds WHERE manufacturer_id = dup;
    DELETE FROM public.disc_manufacturers WHERE id = dup;
  END IF;
END $$;

-- 2. Plastic line-ups ----------------------------------------------------------
INSERT INTO public.disc_plastics (manufacturer_id, name, tier, durability, grip)
SELECT m.id, v.plastic, v.tier::disc_plastic_tier, v.durability, v.grip
FROM (VALUES
  ('Innova','DX','base',3,8),('Innova','Pro','premium',6,7),('Innova','Champion','premium',9,5),
  ('Innova','Star','premium',8,7),('Innova','GStar','premium',7,8),('Innova','XT','base',5,8),
  ('Innova','KC Pro','premium',7,7),('Innova','JK Pro','premium',6,7),('Innova','R-Pro','base',4,9),
  ('Innova','Metal Flake Champion','premium',8,6),('Innova','Blizzard Champion','premium',8,5),
  ('Innova','Halo Star','premium',9,6),('Innova','Shimmer Star','premium',8,7),
  ('Innova','Glow Champion','premium_glow',9,5),('Innova','Luster Champion','premium',9,5),
  ('Innova','Echo Star','premium',7,8),('Innova','Nexus','base',4,9),
  ('Discraft','X','base',5,7),('Discraft','Z Lite','premium',8,5),('Discraft','Big Z','premium',8,6),
  ('Discraft','CryZtal Z','premium',9,5),('Discraft','CryZtal FLX','premium',8,7),
  ('Discraft','ESP FLX','premium',7,8),('Discraft','ESP Swirl','premium',8,7),
  ('Discraft','Jawbreaker','base',6,9),('Discraft','Jawbreaker Z FLX','premium',7,9),
  ('Discraft','Elite Z Glo','premium_glow',8,5),('Discraft','Z Glo Sparkle','premium_glow',8,5),
  ('Discraft','Rubber Blend','base',4,9),('Discraft','UV Z','special',9,5),
  ('MVP','Electron','base',4,9),('MVP','Electron Firm','base',5,8),('MVP','Electron Soft','base',3,9),
  ('MVP','Fission','premium',7,7),('MVP','Eclipse 2.0 Glow','premium_glow',8,6),
  ('MVP','Cosmic Neutron','premium',8,7),('MVP','Cosmic Electron','base',5,9),
  ('MVP','Total Eclipse','premium_glow',8,6),
  ('Axiom Discs','Neutron','premium',8,6),('Axiom Discs','Proton','premium',7,7),
  ('Axiom Discs','Plasma','premium_glow',7,6),('Axiom Discs','Electron','base',4,9),
  ('Axiom Discs','Electron Firm','base',5,8),('Axiom Discs','Electron Soft','base',3,9),
  ('Axiom Discs','Fission','premium',7,7),('Axiom Discs','Eclipse 2.0 Glow','premium_glow',8,6),
  ('Axiom Discs','Cosmic Neutron','premium',8,7),('Axiom Discs','Cosmic Electron','base',5,9),
  ('Axiom Discs','Prism Neutron','premium',8,7),('Axiom Discs','Prism Plasma','premium_glow',7,6),
  ('Streamline','Proton','premium',7,7),('Streamline','Electron','base',4,9),
  ('Streamline','Cosmic Neutron','premium',8,7),('Streamline','Eclipse 2.0 Glow','premium_glow',8,6),
  ('Latitude 64','Opto Air','premium',7,6),('Latitude 64','Opto Ice','premium',9,5),
  ('Latitude 64','Frost','premium',8,6),('Latitude 64','Retro','base',4,8),
  ('Latitude 64','Retro Burst','base',4,8),('Latitude 64','Grand','premium',8,7),
  ('Latitude 64','Grand Orbit','premium',8,7),('Latitude 64','Royal Grand','premium',8,7),
  ('Latitude 64','Royal Grand Orbit','premium',8,7),('Latitude 64','Moonshine','premium_glow',8,6),
  ('Latitude 64','Gold Line Orbit','premium',7,7),('Latitude 64','Zero Hard','base',5,7),
  ('Latitude 64','Zero Medium','base',4,8),('Latitude 64','Zero Soft','base',3,9),
  ('Latitude 64','Recycled','base',5,7),
  ('Dynamic Discs','Classic','base',4,8),('Dynamic Discs','Classic Blend','base',4,9),
  ('Dynamic Discs','Classic Soft','base',3,9),('Dynamic Discs','Fluid','base',3,9),
  ('Dynamic Discs','Prime Burst','base',4,7),('Dynamic Discs','Biofuzion','premium',7,7),
  ('Dynamic Discs','Lucid-X','premium',9,5),('Dynamic Discs','Lucid Air','premium',7,6),
  ('Dynamic Discs','Lucid Ice','premium',9,5),('Dynamic Discs','Fuzion Burst','premium',8,6),
  ('Dynamic Discs','Fuzion Orbit','premium',8,6),('Dynamic Discs','Moonshine','premium_glow',8,6),
  ('Dynamic Discs','Supreme','premium',8,7),
  ('Gateway','Suregrip Soft','base',3,9),('Gateway','Suregrip Firm','base',5,8),
  ('Gateway','Diamond','premium',8,6),('Gateway','Hyper-D','premium',8,6),
  ('Gateway','Evolution','premium',7,7),('Gateway','Platinum','premium',9,5),
  ('Gateway','Glow','premium_glow',7,7),('Gateway','Organic','base',4,9),
  ('Thought Space Athletics','Aura','base',4,9),('Thought Space Athletics','Ethos','premium',7,7),
  ('Thought Space Athletics','Nerve','premium',8,6),('Thought Space Athletics','Ethereal','premium',7,7),
  ('Thought Space Athletics','Nebula Ethereal','premium',8,7),
  ('Thought Space Athletics','Nebula Aura','base',5,9),
  ('Thought Space Athletics','Glow Ethereal','premium_glow',7,7),
  ('Westside Discs','Origio','base',4,8),('Westside Discs','Origio Burst','base',4,8),
  ('Westside Discs','VIP-X','premium',9,5),('Westside Discs','VIP Air','premium',7,6),
  ('Westside Discs','Tournament Orbit','tournament',8,7),
  ('Westside Discs','Moonshine','premium_glow',8,6)
) AS v(brand, plastic, tier, durability, grip)
JOIN public.disc_manufacturers m ON m.name = v.brand
ON CONFLICT (manufacturer_id, name) DO UPDATE
  SET tier = EXCLUDED.tier, durability = EXCLUDED.durability, grip = EXCLUDED.grip;

-- 3. Published flight numbers for molds that were missing them ------------------
WITH src AS (
  SELECT * FROM (VALUES
    ('Innova','Aviar Putter','putter',2,3,0,1),
    ('Innova','Dolphin','putter',4,5,-2,1),
    ('Innova','Piranha','putter',3,2,0,1),
    ('Innova','Wombat','midrange',5,6,-2,0),
    ('Innova','Wombat 3 (New)','midrange',5,6,-2,0),
    ('Innova','TeeBird L (TL)','fairway_driver',7,6,-2,1),
    ('Innova','Eagle (new)','fairway_driver',7,4,-1,3),
    ('Innova','Eagle (old)','fairway_driver',7,4,-1,3),
    ('Innova','Monster','distance_driver',10,4,0,4),
    ('Discraft','Zone GT (Ringer Top)','putter',4,3,0,3),
    ('Discraft','Zone SS (DIS-0725-P)','putter',4,3,-2,1),
    ('Discraft','Heat (Ace Race 2014)','distance_driver',9,6,-3,1),
    ('Discraft','Malta (Paul McBeth Proto Mid-Range)','midrange',5,4,0,2),
    ('Discraft','Roach (Ace Race 2015)','putter',3,3,0,1),
    ('Discraft','Zeus (renamed from Kong)','distance_driver',12,5,-1,3),
    ('Dynamic Discs','EMAC Truth','midrange',5,5,-1,1),
    ('Dynamic Discs','Supreme Judge','putter',2,4,0,1),
    ('Dynamic Discs','Supreme EMAC Judge','putter',2,4,0,1),
    ('Dynamic Discs','Supreme Escape','fairway_driver',8,5,-1,2),
    ('Dynamic Discs','Freedom','distance_driver',13,6,-2,2),
    ('Latitude 64','River Pro','fairway_driver',7,6,-1,1),
    ('Latitude 64','Recoil','distance_driver',13,5,-1,3),
    ('Latitude 64','Vision','fairway_driver',8,6,-2,1),
    ('MVP','Anode','putter',2,3,0,1),
    ('MVP','Tangent','putter',3,4,-1,1),
    ('MVP','Uplink','putter',3,3,-2,1),
    ('MVP','Switch','fairway_driver',9,5,-1,2),
    ('MVP','Amp','fairway_driver',8,5,-2,2),
    ('Gateway','Wizard (revised)','putter',3,3,0,1)
  ) AS v(brand, mold, category, speed, glide, turn, fade)
)
UPDATE public.disc_molds d
   SET speed = s.speed, glide = s.glide, turn = s.turn, fade = s.fade,
       category = s.category::disc_category,
       stability = (CASE
         WHEN s.turn + s.fade <= -2 THEN 'very_understable'
         WHEN s.turn + s.fade <= -0.5 THEN 'understable'
         WHEN s.turn + s.fade < 1.5 THEN 'stable'
         WHEN s.turn + s.fade < 3 THEN 'overstable'
         ELSE 'very_overstable' END)::disc_stability,
       updated_at = now()
  FROM src s
  JOIN public.disc_manufacturers m ON m.name = s.brand
 WHERE d.manufacturer_id = m.id AND d.name = s.mold AND d.speed IS NULL;

-- 4. Plain-language knowledge for signature molds -------------------------------
WITH notes AS (
  SELECT * FROM (VALUES
    ('Innova','Aviar','The most-thrown putter in disc golf. Straight, predictable, and equally at home putting or throwing short approaches.'),
    ('Innova','Roc','The classic beaded midrange. Beats in slowly and holds a dead-straight line with a dependable finish.'),
    ('Innova','Leopard','A forgiving understable fairway driver that turns over easily — the go-to first fairway for newer arms.'),
    ('Innova','TeeBird','A point-and-shoot fairway driver. Flies where you aim it and finishes with a small, reliable fade.'),
    ('Innova','Firebird','The headwind and flex-shot standard. Very overstable, dependable no matter how hard you throw it.'),
    ('Innova','Destroyer','The most popular tournament distance driver. Long, workable, and gets more useful as it beats in.'),
    ('Discraft','Buzzz','The benchmark straight midrange. Nearly every bag has one because it never surprises you.'),
    ('Discraft','Zone','A short, overstable approach disc for spike hyzers, tight skips, and anything windy.'),
    ('Discraft','Luna','A firm, slightly overstable putter that holds its line into wind and putts with a soft feel.'),
    ('Discraft','Undertaker','A control driver that flies straight with glide, then finishes gently — great for long, tight lines.'),
    ('MVP','Volt','A straight, workable fairway driver with the overmold rim keeping the flight stable at high speed.'),
    ('MVP','Photon','A wide-rim distance driver with a long, gliding flight and a controlled finish.'),
    ('MVP','Watt','An overstable fairway driver built for forehands, flex lines, and heavy wind.'),
    ('Axiom Discs','Envy','A firm, dead-straight approach putter with a low profile that resists turning over.'),
    ('Axiom Discs','Crave','A beginner-friendly fairway driver that flies straight with plenty of glide.'),
    ('Axiom Discs','Insanity','An understable distance driver made for turnover lines and long, sweeping right-to-left finishes.'),
    ('Latitude 64','Diamond','A very lightweight, understable fairway driver — the easiest distance disc for a developing arm.'),
    ('Latitude 64','Explorer','A straight-flying control driver with a gentle finish, ideal for wooded fairways.'),
    ('Latitude 64','Pure','A soft, straight putter with a comfortable low-profile grip for putting and short approaches.'),
    ('Dynamic Discs','Judge','A straight, firm putter with a beaded rim that stays put on windy putts.'),
    ('Dynamic Discs','Escape','A workable fairway driver that holds a long, gentle turn before a modest fade.'),
    ('Dynamic Discs','Truth','A straight midrange with plenty of glide, comfortable in both wooded and open lines.'),
    ('Gateway','Wizard','The Gateway putting standard, available in a wide range of plastic firmnesses for putting feel.'),
    ('Thought Space Athletics','Votum','A straight control driver with reliable glide and a small, predictable finish.'),
    ('Thought Space Athletics','Praxis','A firm putter with a flat top and a straight, dependable flight.'),
    ('Thought Space Athletics','Pathfinder','A neutral midrange that holds whatever line it is given, wooded or open.')
  ) AS v(brand, mold, note)
)
UPDATE public.disc_molds d
   SET description = COALESCE(NULLIF(d.description, ''), n.note), updated_at = now()
  FROM notes n
  JOIN public.disc_manufacturers m ON m.name = n.brand
 WHERE d.manufacturer_id = m.id AND d.name = n.mold;