# Endurance Core

A modular and extensible TypeScript library for building secure, event-driven, Express-based backend systems — with support for authentication, routing, file uploads, Kafka/AMQP consumers, cron tasks, notifications, and Swagger documentation.

## Installation

yarn add endurance-core
# or
npm install endurance-core

## Getting Started

Import and initialize only the components you need. The library is modular and works well with Express, Mongoose/Typegoose, and event-driven architectures.

## Usage Examples

### Authentication Middleware

```
import {
  EnduranceAuthMiddleware,
  EnduranceAccessControl,
  EnduranceAuth
} from 'endurance-core';

class MyAccessControl extends EnduranceAccessControl {
  // Implement your access control logic here
}

class MyAuth extends EnduranceAuth {
  // Implement your authentication logic here
}

const middleware = new EnduranceAuthMiddleware(
  new MyAccessControl(),
  new MyAuth()
);

EnduranceAuthMiddleware.setInstance(middleware);
```

### Custom Router

```
import { EnduranceRouter } from 'endurance-core';

class MyRouter extends EnduranceRouter {
  protected setupRoutes() {
    this.get('/hello', {}, async (req, res) => {
      res.send('Hello World');
    });
  }
}
```

### Schema with Typegoose

```
import { EnduranceSchema, EnduranceModelType } from 'endurance-core';

class User extends EnduranceSchema {
  @EnduranceModelType.prop({ required: true })
  name!: string;
}

const UserModel = User.getModel();
```

### Kafka or AMQP Consumers

```
import { enduranceConsumer } from 'endurance-core';

await enduranceConsumer.createConsumer('kafka', {
  brokers: ['localhost:9092'],
  groupId: 'group',
  topic: 'my-topic',
}, message => {
  console.log('Received message:', message);
});
```

### Cron Jobs

```
import { enduranceCron } from 'endurance-core';

enduranceCron.loadCronJob('cacheClear', '0 * * * *', async () => {
  console.log('Clearing cache...');
});
```

### Event Emitters and Listeners

```
import {
  enduranceEmitter,
  enduranceListener,
  enduranceEventTypes
} from 'endurance-core';

enduranceListener.createListener('MY_EVENT', data => {
  console.log('Received:', data);
});

enduranceEmitter.emit(enduranceEventTypes.MY_EVENT, { hello: 'world' });
```

### Notifications

```
import { enduranceNotificationManager } from 'endurance-core';

enduranceNotificationManager.registerNotification('email', (opts) => {
  console.log('Sending email with:', opts);
});

enduranceNotificationManager.sendNotification('email', {
  to: 'user@example.com',
  subject: 'Welcome!',
});
```

### Swagger Integration

```
import express from 'express';
import { enduranceSwagger } from 'endurance-core';

const app = express();

const spec = await enduranceSwagger.generateSwaggerSpec(['./routes/*.ts']);
enduranceSwagger.setupSwagger(app, spec);
```

## Project Structure

```
src/
├── core/        # Authentication, Routing, Schema, Event system, etc.
├── infra/       # Cron jobs, Swagger, DB access
├── consumers/   # Kafka and AMQP logic
├── index.ts     # Public API
```

## Scripts

# Run tests
```yarn test```

# Build the library
```yarn build```

# Clean build artifacts
```yarn clean```

## License

MIT
