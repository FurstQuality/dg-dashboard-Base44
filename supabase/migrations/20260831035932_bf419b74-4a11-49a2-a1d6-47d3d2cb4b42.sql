ALTER TABLE public.field_registry ADD COLUMN IF NOT EXISTS source_key text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'field_registry_entity_field_key_unique'
  ) THEN
    ALTER TABLE public.field_registry
      ADD CONSTRAINT field_registry_entity_field_key_unique UNIQUE (entity_type, field_key);
  END IF;
END $$;