ALTER TABLE public.phases
  ADD COLUMN reset_yellow_cards      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN yellow_cards_reset_done BOOLEAN NOT NULL DEFAULT false;
