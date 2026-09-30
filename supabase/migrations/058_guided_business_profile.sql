-- Migration: 058_guided_business_profile
-- Add step-by-step guided business profile fields to accounts

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS business_tagline TEXT DEFAULT '';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS product_categories_sold TEXT DEFAULT '';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS target_audience TEXT DEFAULT '';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS customer_relation_style TEXT DEFAULT 'bhaiya_apu'; -- 'bhaiya_apu' | 'sir_madam' | 'casual_warm'

NOTIFY pgrst, 'reload schema';
