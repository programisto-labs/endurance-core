import mongoose, { ConnectOptions } from "mongoose";
import session from "express-session";
import connectMongoDBSession from "connect-mongodb-session";

const MongoDBStore = connectMongoDBSession(session);

class EnduranceDatabase {
  private requiredEnvVars: string[] = [
    "MONGODB_USERNAME",
    "MONGODB_PASSWORD",
    "MONGODB_HOST",
    "MONGODB_DATABASE",
  ];

  public checkRequiredEnvVars(): void {
    this.requiredEnvVars.forEach((envVar) => {
      if (!process.env[envVar]) {
        throw new Error(`${envVar} environment variable not set`);
      }
    });
  }

  private getDbConnectionString() {
    if (process.env.PLATFORM_RELATIONSHIPS) {
      const relationship = process.env.PLATFORM_RELATIONSHIPS;
      console.log("j ai la variable d'environnement", relationship);

      const relationships = JSON.parse(relationship);
      return relationships.mongo[0].uri;
    }

    const requiredEnvVars = [
      "MONGODB_USERNAME",
      "MONGODB_PASSWORD",
      "MONGODB_HOST",
      "MONGODB_DATABASE",
    ];
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) throw new Error(`${envVar} not set`);
    }
    const {
      MONGODB_USERNAME,
      MONGODB_PASSWORD,
      MONGODB_HOST,
      MONGODB_DATABASE,
    } = process.env;
    return `mongodb+srv://${MONGODB_USERNAME}:${MONGODB_PASSWORD}@${MONGODB_HOST}/${MONGODB_DATABASE}`;
  }

  public connect(): Promise<typeof mongoose> {
    const connectionString = this.getDbConnectionString();

    return mongoose.connect(connectionString, {
      connectTimeoutMS: 30000,
    } as ConnectOptions);
  }

  public createStore(): session.Store {
    const uri = this.getDbConnectionString();

    const store = new MongoDBStore({
      uri,
      collection: "sessions",
    });

    store.on("error", (error: Error) => {
      console.error("Session store error:", error);
    });

    return store;
  }
}

export const enduranceDatabase = new EnduranceDatabase();
