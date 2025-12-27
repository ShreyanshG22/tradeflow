-- Migration: 001_initial_schema
-- Description: Initial database schema with all core tables
-- Created: 2024-12-24
-- Requires: PostgreSQL 15+

-- This migration creates the initial schema for the TradeFlow platform
-- It includes all core tables for users, strategies, portfolios, positions, trades, and analytics

BEGIN;

-- Create migration tracking table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    description TEXT,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    checksum VARCHAR(64)
);

-- Check if this migration has already been applied
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '001_initial_schema') THEN
        RAISE NOTICE 'Migration 001_initial_schema already applied, skipping...';
        ROLLBACK;
        RETURN;
    END IF;
END $$;

-- Apply the core schema
\i /docker-entrypoint-initdb.d/schema/01_core_schema.sql

-- Record this migration
INSERT INTO public.schema_migrations (version, description, checksum) 
VALUES (
    '001_initial_schema', 
    'Initial database schema with all core tables',
    'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6'  -- This would be calculated from file content
);

COMMIT;