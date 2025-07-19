import mongoose from 'mongoose';
import session from 'express-session';
import logger from '../core/logger.js';

const isMongo42OrHigher = process.env.IS_MONGO_42_OR_HIGHER !== undefined ? process.env.IS_MONGO_42_OR_HIGHER : true;

const connectMongoDBSession = isMongo42OrHigher
  ? (await import('connect-mongodb-session')).default
  : (await import('connect-mongodb-session-legacy')).default;

const MongoDBStore = connectMongoDBSession(session);

/* eslint-disable no-var, no-unused-vars */
declare global {
  var __MONGO_CONNECTED__: boolean | undefined;
}
/* eslint-enable no-var, no-unused-vars */

class EnduranceDatabase {
  private requiredEnvVars: string[] = [
    'MONGODB_HOST',
    'MONGODB_DATABASE'
  ];

  public checkRequiredEnvVars(): void {
    this.requiredEnvVars.forEach((envVar) => {
      if (!process.env[envVar]) {
        throw new Error(`${envVar} environment variable not set`);
      }
    });
  }

  private getDbConnectionString(): string {
    this.checkRequiredEnvVars();

    const {
      MONGODB_USERNAME,
      MONGODB_PASSWORD,
      MONGODB_HOST,
      MONGODB_DATABASE,
      MONGODB_AUTH
    } = process.env;

    const MONGODB_PROTOCOL = process.env.MONGODB_PROTOCOL || 'mongodb+srv';
    if (MONGODB_AUTH !== 'false') {
      return `${MONGODB_PROTOCOL}://${MONGODB_USERNAME}:${MONGODB_PASSWORD}@${MONGODB_HOST}/${MONGODB_DATABASE}`;
    }
    return `${MONGODB_PROTOCOL}://${MONGODB_HOST}/${MONGODB_DATABASE}`;
  }

  public async connect(): Promise<{ conn: mongoose.Connection }> {
    const connectionString = this.getDbConnectionString();
    const host = new URL(connectionString).host;

    logger.info('[endurance-core] Connexion à MongoDB sur :', host);

    if (
      (mongoose.connection.readyState !== 0 && mongoose.connection.readyState !== 3) ||
      global.__MONGO_CONNECTED__
    ) {
      logger.info('[endurance-core] Connexion MongoDB déjà établie. Skip.');
      return { conn: mongoose.connection };
    }

    try {
      const conn = await mongoose.connect(connectionString);
      global.__MONGO_CONNECTED__ = true;
      logger.info('[endurance-core] ✅ MongoDB connecté avec succès');
      return { conn: conn.connection };
    } catch (err) {
      logger.error('[endurance-core] ❌ Échec connexion MongoDB :', err);
      throw err;
    }
  }

  public createStore(): session.Store {
    const uri = this.getDbConnectionString();

    const store = new MongoDBStore({
      uri,
      collection: 'sessions'
    });

    store.on('error', (error: Error) => {
      logger.error('[endurance-core] Erreur du store de session MongoDB :', error);
    });

    return store;
  }
}

export const enduranceDatabase = new EnduranceDatabase();
