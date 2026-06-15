-- Migration Script: Asaas Pix Columns Integration

-- 1. Add asaas_customer_id to public.profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS asaas_customer_id text;

-- 2. Add Asaas payment details to public.room_participants table
ALTER TABLE public.room_participants 
ADD COLUMN IF NOT EXISTS asaas_payment_id text,
ADD COLUMN IF NOT EXISTS pix_qr_code text,
ADD COLUMN IF NOT EXISTS pix_copia_e_cola text;
