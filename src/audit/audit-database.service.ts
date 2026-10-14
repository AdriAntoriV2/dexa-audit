import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

export interface AuditLogRecord {
  id: string;
  eventType: string;
  employeeId: string;
  changedFields: string[];
  occurredAt: Date;
}

@Injectable()
export class AuditDatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(AuditDatabaseService.name);
  private readonly pool: Pool;

  constructor() {
    const connectionString = process.env.AUDIT_DATABASE_URL;

    if (!connectionString) {
      throw new Error('AUDIT_DATABASE_URL is required');
    }

    // Use the Neon-provided connection string, including its SSL settings.
    this.pool = new Pool({
      connectionString,
      max: 5,
      connectionTimeoutMillis: 10_000,
    });

    this.pool.on('error', (error) => {
      this.logger.error(`Unexpected PostgreSQL pool error: ${error.message}`);
    });
  }

  async save(record: AuditLogRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_logs (
         id, event_type, employee_id, changed_fields, occurred_at
       )
       VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT (id) DO NOTHING`,
      [
        record.id,
        record.eventType,
        record.employeeId,
        JSON.stringify(record.changedFields),
        record.occurredAt,
      ],
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}