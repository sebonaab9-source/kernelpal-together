CREATE TABLE IF NOT EXISTS public.questions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question text NOT NULL,
  option_a text NOT NULL,
  option_b text NOT NULL,
  option_c text NOT NULL,
  option_d text NOT NULL,
  correct_answer text,
  category text NOT NULL DEFAULT 'Genel Kültür',
  difficulty text NOT NULL DEFAULT 'Kolay',
  time_limit int NOT NULL DEFAULT 20,
  question_type text NOT NULL DEFAULT 'multiple',
  correct_answer_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.questions TO service_role;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.rooms (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'WAITING',
  current_question int NOT NULL DEFAULT 0,
  rope_position int NOT NULL DEFAULT 0,
  winner text,
  question_ids uuid[] NOT NULL DEFAULT '{}',
  question_started_at timestamptz,
  reveal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.rooms TO anon, authenticated;
GRANT ALL ON public.rooms TO service_role;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rooms_public_read" ON public.rooms;
CREATE POLICY "rooms_public_read" ON public.rooms FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.players (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  name text NOT NULL,
  team int NOT NULL CHECK (team IN (1,2)),
  connected boolean NOT NULL DEFAULT true,
  last_seen timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, team)
);
GRANT SELECT ON public.players TO anon, authenticated;
GRANT ALL ON public.players TO service_role;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "players_public_read" ON public.players;
CREATE POLICY "players_public_read" ON public.players FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.answers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id),
  answer text,
  answer_text text,
  is_correct boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, question_id)
);
GRANT ALL ON public.answers TO service_role;
ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.question_sets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.question_sets TO service_role;
ALTER TABLE public.question_sets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS set_id uuid REFERENCES public.question_sets(id) ON DELETE CASCADE;
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS set_id uuid REFERENCES public.question_sets(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='rooms') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='players') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.players;
  END IF;
END $$;

INSERT INTO public.question_sets (title, description)
SELECT 'Genel Kültür Seti', 'Hazır sorular'
WHERE NOT EXISTS (SELECT 1 FROM public.question_sets);

INSERT INTO public.questions (question, option_a, option_b, option_c, option_d, correct_answer, correct_answer_text, category, difficulty, time_limit, set_id)
SELECT v.question, v.a, v.b, v.c, v.d, v.ans, v.ans, v.cat, v.diff, 20, (SELECT id FROM public.question_sets ORDER BY created_at LIMIT 1)
FROM (VALUES
('Türkiye''nin başkenti neresidir?', 'İstanbul', 'Ankara', 'İzmir', 'Bursa', 'B', 'Genel Kültür', 'Kolay'),
('Güneş sistemimizde kaç gezegen bulunur?', '7', '8', '9', '10', 'B', 'Genel Kültür', 'Kolay'),
('"Çalışkan" kelimesinin zıt anlamlısı hangisidir?', 'Gayretli', 'Tembel', 'Hızlı', 'Güçlü', 'B', 'Türkçe', 'Kolay'),
('Aşağıdakilerden hangisi bir sıfattır?', 'Koşmak', 'Kırmızı', 'Kitap', 'Hızlıca', 'B', 'Türkçe', 'Kolay'),
('İstiklal Marşı''nın söz yazarı kimdir?', 'Namık Kemal', 'Mehmet Akif Ersoy', 'Ziya Gökalp', 'Yahya Kemal', 'B', 'Genel Kültür', 'Kolay'),
('"Göz" kelimesi "Gözden düşmek" deyiminde hangi anlamda kullanılır?', 'Gerçek anlam', 'Mecaz anlam', 'Terim anlam', 'Eş anlam', 'B', 'Türkçe', 'Orta'),
('Türkiye''nin en uzun nehri hangisidir?', 'Sakarya', 'Kızılırmak', 'Fırat', 'Dicle', 'B', 'Genel Kültür', 'Orta'),
('Bir üçgenin iç açıları toplamı kaç derecedir?', '90', '180', '270', '360', 'B', 'Matematik', 'Kolay'),
('"Kitapları masaya koydum." cümlesinde altı çizili olabilecek nesne hangisidir?', 'masaya', 'kitapları', 'koydum', 'ben', 'B', 'Türkçe', 'Orta'),
('Atatürk hangi yılda Cumhurbaşkanı seçilmiştir?', '1920', '1923', '1925', '1930', 'B', 'Genel Kültür', 'Orta'),
('Suyun kaynama noktası kaç derecedir?', '50', '100', '150', '200', 'B', 'Fen Bilgisi', 'Kolay'),
('"Sevinç" kelimesinin eş anlamlısı hangisidir?', 'Üzüntü', 'Neşe', 'Korku', 'Öfke', 'B', 'Türkçe', 'Kolay')
) AS v(question, a, b, c, d, ans, cat, diff)
WHERE NOT EXISTS (SELECT 1 FROM public.questions);

CREATE POLICY "questions_server_only" ON public.questions FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "answers_server_only" ON public.answers FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "question_sets_server_only" ON public.question_sets FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);