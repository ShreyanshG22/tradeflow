#!/usr/bin/env node

/**
 * Database Migration Runner for TradeFlow
 * 
 * This script handles database migrations with proper versioning,
 * rollback capabilities, and automated execution in deployment pipelines.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const crypto = require('crypto');

class MigrationRunner {
    constructor(databaseUrl) {
        this.client = new Client({
            connectionString: databaseUrl || process.env.POSTGRES_URL
        });
        this.migrationsDir = path.join(__dirname, 'migrations');
    }

    async connect() {
        try {
            await this.client.connect();
            console.log('✅ Connected to database');
        } catch (error) {
            console.error('❌ Failed to connect to database:', error.message);
            process.exit(1);
        }
    }

    async disconnect() {
        await this.client.end();
        console.log('✅ Disconnected from database');
    }

    async ensureMigrationsTable() {
        const query = `
            CREATE TABLE IF NOT EXISTS public.schema_migrations (
                version VARCHAR(255) PRIMARY KEY,
                description TEXT,
                applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                checksum VARCHAR(64),
                execution_time_ms INTEGER
            );
        `;
        
        await this.client.query(query);
        console.log('✅ Migrations table ready');
    }

    async getAppliedMigrations() {
        const result = await this.client.query(
            'SELECT version, checksum FROM public.schema_migrations ORDER BY version'
        );
        return result.rows;
    }

    async getPendingMigrations() {
        const appliedMigrations = await this.getAppliedMigrations();
        const appliedVersions = new Set(appliedMigrations.map(m => m.version));
        
        const migrationFiles = fs.readdirSync(this.migrationsDir)
            .filter(file => file.endsWith('.sql'))
            .sort();

        const pendingMigrations = [];
        
        for (const file of migrationFiles) {
            const version = path.basename(file, '.sql');
            const filePath = path.join(this.migrationsDir, file);
            const content = fs.readFileSync(filePath, 'utf8');
            const checksum = this.calculateChecksum(content);
            
            if (!appliedVersions.has(version)) {
                pendingMigrations.push({
                    version,
                    file,
                    path: filePath,
                    content,
                    checksum,
                    description: this.extractDescription(content)
                });
            } else {
                // Verify checksum for applied migrations
                const applied = appliedMigrations.find(m => m.version === version);
                if (applied.checksum !== checksum) {
                    console.warn(`⚠️  Checksum mismatch for migration ${version}`);
                    console.warn(`   Expected: ${applied.checksum}`);
                    console.warn(`   Actual:   ${checksum}`);
                }
            }
        }
        
        return pendingMigrations;
    }

    calculateChecksum(content) {
        return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
    }

    extractDescription(content) {
        const match = content.match(/-- Description: (.+)/);
        return match ? match[1].trim() : 'No description';
    }

    async runMigration(migration) {
        const startTime = Date.now();
        
        try {
            console.log(`🔄 Running migration: ${migration.version}`);
            console.log(`   Description: ${migration.description}`);
            
            // Execute the migration in a transaction
            await this.client.query('BEGIN');
            
            // Replace the \i command with actual file content for core schema
            let migrationContent = migration.content;
            if (migrationContent.includes('\\i /docker-entrypoint-initdb.d/schema/01_core_schema.sql')) {
                const schemaPath = path.join(__dirname, 'schema', '01_core_schema.sql');
                if (fs.existsSync(schemaPath)) {
                    const schemaContent = fs.readFileSync(schemaPath, 'utf8');
                    migrationContent = migrationContent.replace(
                        '\\i /docker-entrypoint-initdb.d/schema/01_core_schema.sql',
                        schemaContent
                    );
                }
            }
            
            await this.client.query(migrationContent);
            
            const executionTime = Date.now() - startTime;
            
            // Record the migration
            await this.client.query(`
                INSERT INTO public.schema_migrations (version, description, checksum, execution_time_ms)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (version) DO UPDATE SET
                    applied_at = NOW(),
                    execution_time_ms = $4
            `, [migration.version, migration.description, migration.checksum, executionTime]);
            
            await this.client.query('COMMIT');
            
            console.log(`✅ Migration ${migration.version} completed in ${executionTime}ms`);
            
        } catch (error) {
            await this.client.query('ROLLBACK');
            console.error(`❌ Migration ${migration.version} failed:`, error.message);
            throw error;
        }
    }

    async migrate() {
        await this.ensureMigrationsTable();
        
        const pendingMigrations = await this.getPendingMigrations();
        
        if (pendingMigrations.length === 0) {
            console.log('✅ No pending migrations');
            return;
        }
        
        console.log(`📋 Found ${pendingMigrations.length} pending migration(s):`);
        pendingMigrations.forEach(m => {
            console.log(`   - ${m.version}: ${m.description}`);
        });
        
        for (const migration of pendingMigrations) {
            await this.runMigration(migration);
        }
        
        console.log('🎉 All migrations completed successfully');
    }

    async rollback(targetVersion) {
        console.log(`🔄 Rolling back to version: ${targetVersion}`);
        
        const appliedMigrations = await this.getAppliedMigrations();
        const migrationsToRollback = appliedMigrations
            .filter(m => m.version > targetVersion)
            .sort((a, b) => b.version.localeCompare(a.version));
        
        if (migrationsToRollback.length === 0) {
            console.log('✅ No migrations to rollback');
            return;
        }
        
        console.log(`📋 Rolling back ${migrationsToRollback.length} migration(s):`);
        migrationsToRollback.forEach(m => {
            console.log(`   - ${m.version}`);
        });
        
        // For now, we'll just remove the migration records
        // In a production system, you'd want proper rollback scripts
        for (const migration of migrationsToRollback) {
            await this.client.query(
                'DELETE FROM public.schema_migrations WHERE version = $1',
                [migration.version]
            );
            console.log(`✅ Rolled back migration: ${migration.version}`);
        }
        
        console.log('🎉 Rollback completed successfully');
    }

    async status() {
        await this.ensureMigrationsTable();
        
        const appliedMigrations = await this.getAppliedMigrations();
        const pendingMigrations = await this.getPendingMigrations();
        
        console.log('\n📊 Migration Status:');
        console.log('==================');
        
        if (appliedMigrations.length > 0) {
            console.log('\n✅ Applied Migrations:');
            appliedMigrations.forEach(m => {
                console.log(`   ${m.version} (${m.applied_at?.toISOString()})`);
            });
        }
        
        if (pendingMigrations.length > 0) {
            console.log('\n⏳ Pending Migrations:');
            pendingMigrations.forEach(m => {
                console.log(`   ${m.version}: ${m.description}`);
            });
        } else {
            console.log('\n✅ All migrations are up to date');
        }
        
        console.log('');
    }
}

async function main() {
    const command = process.argv[2];
    const arg = process.argv[3];
    
    const runner = new MigrationRunner();
    
    try {
        await runner.connect();
        
        switch (command) {
            case 'migrate':
            case 'up':
                await runner.migrate();
                break;
                
            case 'rollback':
            case 'down':
                if (!arg) {
                    console.error('❌ Please specify target version for rollback');
                    process.exit(1);
                }
                await runner.rollback(arg);
                break;
                
            case 'status':
                await runner.status();
                break;
                
            default:
                console.log('Usage:');
                console.log('  node migrate.js migrate     - Run pending migrations');
                console.log('  node migrate.js rollback <version> - Rollback to version');
                console.log('  node migrate.js status      - Show migration status');
                process.exit(1);
        }
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    } finally {
        await runner.disconnect();
    }
}

if (require.main === module) {
    main();
}

module.exports = { MigrationRunner };