import {
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';
import amqp, {
    type Channel,
    type ChannelModel,
    type ConsumeMessage,
} from 'amqplib';
import { AuditDatabaseService } from './audit-database.service.js'
import {
    isProfileChangedEvent,
    PROFILE_CHANGED_DEAD_QUEUE,
    PROFILE_CHANGED_QUEUE,
} from './audit-event.js'

@Injectable()
export class AuditConsumerService
    implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(AuditConsumerService.name);
    private stopping = false;
    private connection?: ChannelModel;
    private channel?: Channel;

    constructor(private readonly database: AuditDatabaseService) { }

    onModuleInit(): void {
        // Don't prevent Nest from starting while a hosted broker is unavailable.
        void this.runLoop();
    }

    private async runLoop(): Promise<void> {
        while (!this.stopping) {
            try {
                await this.consumeUntilDisconnected();
            } catch (error) {
                if (!this.stopping) {
                    this.logger.error(
                        `Audit consumer connection failed: ${this.errorMessage(error)}`,
                    );
                }
            } finally {
                await this.closeConnection();
            }

            if (!this.stopping) {
                await new Promise((resolve) => setTimeout(resolve, 3000));
            }
        }
    }

    private async consumeUntilDisconnected(): Promise<void> {
        const url = process.env.RABBITMQ_URL;

        if (!url) {
            throw new Error('RABBITMQ_URL is required');
        }

        const connection = await amqp.connect(url);
        this.connection = connection;

        connection.on('error', (error) => {
            this.logger.error(`RabbitMQ connection error: ${error.message}`);
        });

        const channel = await connection.createChannel();
        this.channel = channel;

        channel.on('error', (error) => {
            this.logger.error(`RabbitMQ channel error: ${error.message}`);
        });

        await channel.assertQueue(PROFILE_CHANGED_DEAD_QUEUE, {
            durable: true,
        });

        await channel.assertQueue(PROFILE_CHANGED_QUEUE, {
            durable: true,
            arguments: {
                'x-dead-letter-exchange': '',
                'x-dead-letter-routing-key': PROFILE_CHANGED_DEAD_QUEUE,
            },
        });

        await channel.prefetch(10);

        await channel.consume(
            PROFILE_CHANGED_QUEUE,
            (message) => {
                if (message) {
                    void this.handleMessage(channel, message);
                }
            },
            { noAck: false },
        );

        this.logger.log(`Consuming queue: ${PROFILE_CHANGED_QUEUE}`);

        // Keep this connection alive until the broker closes it or shutdown begins.
        await new Promise<void>((resolve) => {
            connection.once('close', resolve);
        });
    }

    private async handleMessage(
        channel: Channel,
        message: ConsumeMessage,
    ): Promise<void> {
        let parsed: unknown;

        try {
            parsed = JSON.parse(message.content.toString('utf8'));
        } catch {
            channel.nack(message, false, false);
            this.logger.warn('Rejected invalid JSON audit event');
            return;
        }

        if (!isProfileChangedEvent(parsed)) {
            channel.nack(message, false, false);
            this.logger.warn('Rejected malformed profile-change event');
            return;
        }

        try {
            await this.database.save({
                id: parsed.eventId,
                eventType: parsed.eventType,
                employeeId: parsed.employeeId,
                changedFields: parsed.changedFields,
                occurredAt: new Date(parsed.occurredAt),
            });

            channel.ack(message);
        } catch (error) {
            this.logger.error(
                `Could not persist audit event: ${this.errorMessage(error)}`,
            );

            try {
                channel.nack(message, false, true);
            } catch (nackError) {
                this.logger.error(
                    `Could not negatively acknowledge message: ${this.errorMessage(nackError)}`,
                );
            }
        }
    }

    private async closeConnection(): Promise<void> {
        const channel = this.channel;
        const connection = this.connection;

        this.channel = undefined;
        this.connection = undefined;

        try {
            await channel?.close();
        } catch {
            // It may already have been closed by the broker.
        }

        try {
            await connection?.close();
        } catch {
            // It may already have been closed by the broker.
        }
    }

    private errorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }

    async onModuleDestroy(): Promise<void> {
        this.stopping = true;
        await this.closeConnection();
    }
}