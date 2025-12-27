-- TradeFlow Database Initialization Script
-- This script initializes the database and applies the core schema

-- Source the complete schema
\i /docker-entrypoint-initdb.d/schema/01_core_schema.sql

-- Grant permissions
GRANT USAGE ON SCHEMA auth TO tradeflow;
GRANT USAGE ON SCHEMA trading TO tradeflow;
GRANT USAGE ON SCHEMA analytics TO tradeflow;
GRANT USAGE ON SCHEMA market_data TO tradeflow;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA auth TO tradeflow;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA trading TO tradeflow;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA analytics TO tradeflow;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA market_data TO tradeflow;

GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA auth TO tradeflow;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA trading TO tradeflow;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA analytics TO tradeflow;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA market_data TO tradeflow;