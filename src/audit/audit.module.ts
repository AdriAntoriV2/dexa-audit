import { Module } from '@nestjs/common';
import { AuditConsumerService } from './audit-consumer.service.js';
import { AuditDatabaseService } from './audit-database.service.js';

@Module({
  providers: [AuditDatabaseService, AuditConsumerService],
})
export class AuditModule {}