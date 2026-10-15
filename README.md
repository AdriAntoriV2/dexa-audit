# Dexa Audit

Dexa Audit is the event-consumer service for the **Dexa Work-From-Home (WFH) Attendance System**. It receives employee profile-change events from RabbitMQ, validates their payloads, and stores audit records in PostgreSQL.

The service is designed to handle audit events asynchronously, keeping audit persistence separate from the main backend request flow.

## Features

- **Asynchronous event processing** — consumes employee profile-change events through RabbitMQ.
- **Event validation** — checks JSON payloads, UUIDs, event types, changed-field values, and timestamps before processing.
- **Persistent audit records** — stores audit events in PostgreSQL.
- **Duplicate-event protection** — uses the event ID to avoid inserting the same event more than once.
- **Message acknowledgements** — acknowledges successfully persisted events and requeues messages when database persistence fails.
- **Connection recovery** — retries RabbitMQ connections when the broker is unavailable.
- **Dead-letter queue configuration** — declares a dead-letter queue for the profile-change queue.

## Technology Stack

- **Runtime:** Node.js
- **Framework:** NestJS 12
- **Language:** TypeScript
- **Message broker:** RabbitMQ
- **RabbitMQ client:** `amqplib`
- **Database:** PostgreSQL
- **PostgreSQL client:** `pg`
- **Testing:** Vitest and Supertest
- **Code quality:** Oxlint and Prettier

## Architecture

Dexa Audit works alongside the Dexa backend. The backend publishes profile-change events, and this service consumes and persists them.

```text
Dexa Employees / Dexa HR
          |
          v
      Dexa Backend
          |
          | Profile-change event
          v
       RabbitMQ
          |
          | employee.profile.changed
          v
       Dexa Audit
          |
          | Validate event
          | Insert audit record
          v
     PostgreSQL
       audit_logs
```

This is an asynchronous workflow: the backend publishes the event, while Dexa Audit processes it independently.

## Event Contract

The service consumes the `employee.profile.changed` event from the RabbitMQ queue with the same name.

Example payload:

```json
{
  "eventId": "6b2a9b0c-3d4e-4f5a-8b7c-9d0e1f2a3b4c",
  "eventType": "employee.profile.changed",
  "employeeId": "7c3b0a1d-4e5f-4a6b-9c8d-0e1f2a3b4c5d",
  "changedFields": ["fullName", "phoneNumber"],
  "occurredAt": "2026-01-15T08:30:00.000Z"
}
```

The UUIDs and timestamp above are illustrative examples.

| Field | Description |
|---|---|
| `eventId` | Unique event identifier used for duplicate protection. |
| `eventType` | Event type; currently `employee.profile.changed`. |
| `employeeId` | UUID of the employee whose profile changed. |
| `changedFields` | Names of the fields that changed, rather than their old and new values. |
| `occurredAt` | Timestamp representing when the event occurred. |

The consumer validates the payload before attempting to store it.

## RabbitMQ Message Handling

The consumer declares two durable queues:

- `employee.profile.changed` — receives profile-change events.
- `employee.profile.changed.dead` — configured as the dead-letter destination.

The consumer uses manual acknowledgements and a prefetch limit of 10 messages.

| Outcome | Consumer behavior |
|---|---|
| Event is valid and saved | Acknowledges the message. |
| Event contains invalid JSON | Rejects the message without requeueing. |
| Event has an invalid payload | Rejects the message without requeueing. |
| Database persistence fails | Negatively acknowledges the message and requests requeueing. |
| RabbitMQ connection fails | Logs the error and retries after a delay. |

**Delivery note:** RabbitMQ requeueing can cause a message to be delivered more than once. The database insert uses the event ID as its conflict key, making repeated processing of the same event safe against duplicate inserts.

The dead-letter queue is declared and configured on the primary queue. Actual dead-letter routing depends on the broker’s handling of rejected or otherwise dead-lettered messages.

## Database

Dexa Audit uses PostgreSQL to store audit records in the `audit_logs` table.

The SQL script in the repository's `sql/` directory is provided for initial database setup. It is not managed by Prisma, and the service does not automatically create the database schema.

Before starting the service, create the database, run the SQL initialization script, and configure `AUDIT_DATABASE_URL` to point to that database.

### Database setup

Create a PostgreSQL database for the audit service and configure `AUDIT_DATABASE_URL`.

Before starting the service, apply the SQL schema or initialization script provided in the repository's `sql/` directory to create the required `audit_logs` table.

The service expects the table to exist; it does not create the schema automatically.

## RabbitMQ Message Handling

Dexa Audit consumes profile-change events from the `employee.profile.changed` queue.

- Successfully processed events are acknowledged after being saved to PostgreSQL.
- Invalid messages are rejected without being requeued.
- Messages that fail because of a database error are requeued for another processing attempt.
- RabbitMQ connection failures are logged, and the service retries the connection.
- A dead-letter queue, `employee.profile.changed.dead`, is configured to support handling messages that cannot be processed normally.

Messages may be delivered more than once. To prevent duplicate audit records, the database insert uses the event ID to ignore events that have already been recorded.

**Note:** A dead-letter queue is a separate queue for messages that cannot be processed normally. Whether a rejected message is routed there depends on RabbitMQ's queue configuration and rejection behavior.

## Getting Started

### Prerequisites

- Node.js and npm
- A reachable RabbitMQ instance
- A PostgreSQL database
- The `audit_logs` table initialized from the repository's SQL scripts

### 1. Clone the repository

```text
git clone https://github.com/AdriAntoriV2/dexa-audit.git
```

### 2. Install dependencies

```text
npm install
```

### 3. Configure environment variables

Copy `.env.example` to `.env`, then provide the connection details for your environment.

```text
RABBITMQ_URL=amqp://username:password@localhost:5672
AUDIT_DATABASE_URL=postgresql://username:password@localhost:5432/dexa_audit
```

These are example formats. Replace the credentials, host, port, and database name with your actual values. If your PostgreSQL provider requires SSL settings, use the connection string and options supplied by that provider.

Do not commit real credentials or connection strings to version control.

### 4. Start the service

Development mode:

```text
npm run start:dev
```

Build the application:

```text
npm run build
```

Run the compiled application:

```text
npm run start:prod
```

The application listens on port `3000` by default. The port can be changed using the `PORT` environment variable.

## Testing

The project uses Vitest for its test suite.

Run unit tests:

```text
npm run test
```

Run tests in watch mode:

```text
npm run test:watch
```

Run end-to-end tests:

```text
npm run test:e2e
```

Generate test coverage:

```text
npm run test:cov
```

Run linting:

```text
npm run lint
```

Format source and test files:

```text
npm run format
```

## Related Projects

Dexa Audit is part of a multi-repository WFH attendance system:

- [Dexa Employees](https://github.com/AdriAntoriV2/dexa-employees) — employee-facing application.
- [Dexa HR](https://github.com/AdriAntoriV2/dexa-hr) — HR-facing application.
- [Dexa Backend](https://github.com/AdriAntoriV2/dexa-backend) — backend API and event publisher.
- [Dexa Audit](https://github.com/AdriAntoriV2/dexa-audit) — asynchronous audit-event consumer and persistence service.

## Scope and Limitations

Dexa Audit currently handles the profile-change event contract described above. It records the changed field names, not a full before-and-after snapshot of the employee profile.

The service is a background consumer rather than a documented public REST API. Its primary responsibility is to validate incoming events and persist audit records.

## License

This project is currently marked `UNLICENSED` in its package metadata. No open-source license is implied by this README.