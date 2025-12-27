# TradeFlow Database Migration System

This directory contains the database migration system for the TradeFlow algorithmic trading platform. The migration system provides versioned schema management with automated execution capabilities for deployment pipelines.

## Features

- **Versioned Migrations**: Each migration has a unique version and checksum
- **Automated Execution**: Can be run in deployment pipelines
- **Rollback Support**: Ability to rollback to previous versions
- **Transaction Safety**: All migrations run within transactions
- **Checksum Validation**: Ensures migration integrity
- **Docker Support**: Container-based execution for CI/CD

## Directory Structure

```
backend/database/
├── migrations/           # Migration SQL files
├── schema/              # Base schema files
├── migrate.js           # Node.js migration runner
├── migrate.sh           # Shell script wrapper
├── package.json         # Dependencies
├── Dockerfile.migrate   # Docker container for migrations
└── README.md           # This file
```

## Usage

### Local Development

1. **Install dependencies:**
   ```bash
   cd backend/database
   npm install
   ```

2. **Run migrations:**
   ```bash
   # Using Node.js directly
   node migrate.js migrate
   
   # Using shell script
   ./migrate.sh migrate
   
   # Using npm scripts
   npm run migrate
   ```

3. **Check migration status:**
   ```bash
   ./migrate.sh status
   ```

4. **Rollback migrations:**
   ```bash
   ./migrate.sh rollback 001_initial_schema
   ```

### Docker Usage

1. **Build migration container:**
   ```bash
   docker build -f Dockerfile.migrate -t tradeflow-migrate .
   ```

2. **Run migrations:**
   ```bash
   docker run --rm \
     -e POSTGRES_URL="postgresql://user:pass@host:5432/db" \
     tradeflow-migrate
   ```

### CI/CD Pipeline

The migration system is designed for automated execution in deployment pipelines:

```bash
# In your deployment script
cd backend/database
./migrate.sh migrate
```

## Migration Files

### Naming Convention

Migration files should follow this naming pattern:
```
XXX_description.sql
```

Where:
- `XXX` is a zero-padded sequential number (001, 002, etc.)
- `description` is a brief description using underscores

### Migration Template

```sql
-- Migration: 002_add_user_preferences
-- Description: Add user preferences table
-- Created: 2024-12-24
-- Requires: 001_initial_schema

BEGIN;

-- Check if this migration has already been applied
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '002_add_user_preferences') THEN
        RAISE NOTICE 'Migration 002_add_user_preferences already applied, skipping...';
        ROLLBACK;
        RETURN;
    END IF;
END $$;

-- Your migration SQL here
CREATE TABLE auth.user_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    preference_key VARCHAR(100) NOT NULL,
    preference_value JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Record this migration
INSERT INTO public.schema_migrations (version, description, checksum) 
VALUES (
    '002_add_user_preferences', 
    'Add user preferences table',
    'calculated_checksum_here'
);

COMMIT;
```

## Environment Variables

- `POSTGRES_URL`: Database connection string
- `NODE_ENV`: Environment (development, staging, production)

## Commands

### migrate.js Commands

```bash
# Run pending migrations
node migrate.js migrate

# Show migration status
node migrate.js status

# Rollback to specific version
node migrate.js rollback 001_initial_schema
```

### migrate.sh Commands

```bash
# Run migrations (default)
./migrate.sh migrate

# Show status
./migrate.sh status

# Rollback
./migrate.sh rollback 001_initial_schema

# Validate connection only
./migrate.sh validate

# Show help
./migrate.sh help
```

## Best Practices

1. **Always use transactions**: Wrap migrations in BEGIN/COMMIT blocks
2. **Include rollback logic**: Consider how to undo changes if needed
3. **Test migrations**: Run on a copy of production data first
4. **Keep migrations small**: One logical change per migration
5. **Document changes**: Include clear descriptions and comments
6. **Backup before major changes**: Always backup production data

## Troubleshooting

### Common Issues

1. **Connection timeout**: Increase `MAX_RETRIES` in migrate.sh
2. **Permission errors**: Ensure database user has necessary privileges
3. **Checksum mismatch**: Migration file was modified after being applied
4. **Transaction deadlock**: Retry the migration or check for conflicting operations

### Debugging

Enable verbose logging:
```bash
DEBUG=1 ./migrate.sh migrate
```

Check migration table directly:
```sql
SELECT * FROM public.schema_migrations ORDER BY applied_at;
```

## Security Considerations

- Never commit database passwords to version control
- Use environment variables for sensitive configuration
- Limit database user permissions to minimum required
- Audit migration execution in production environments

## Integration with TradeFlow

This migration system integrates with the TradeFlow backend infrastructure:

- **Requirements**: Addresses requirement 8.4 for automated migration execution
- **Docker Integration**: Works with the existing Docker Compose setup
- **CI/CD Ready**: Designed for automated deployment pipelines
- **Monitoring**: Provides status and health check endpoints