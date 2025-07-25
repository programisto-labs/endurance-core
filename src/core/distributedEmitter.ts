import mongoose from 'mongoose';
import logger from './logger.js';
import { enduranceEmitter } from './emitter.js';

let isDistributed = false;
const replicatedEvents = new WeakSet<object>();

export const setupDistributedEmitter = async (db: mongoose.mongo.Db) => {
    try {
        const instanceId = `instance_${Math.random().toString(36).slice(2)}`;
        const collection = db.collection('endurance_events');

        enduranceEmitter.onAny((event, ...payload) => {
            const maybeWrapper = payload.at(-1);
            if (maybeWrapper && typeof maybeWrapper === 'object' && replicatedEvents.has(maybeWrapper)) return;

            collection.insertOne({
                event,
                payload,
                source: instanceId,
                createdAt: new Date()
            }).catch(err =>
                logger.error('[emitter] Failed to write event to MongoDB', err)
            );
        });

        const changeStream = collection.watch([], { fullDocument: 'updateLookup' });
        changeStream.on('change', change => {
            if (change.operationType === 'insert') {
                const doc = change.fullDocument;
                if (doc.source !== instanceId) {
                    const eventWrapper = { event: doc.event, payload: doc.payload };
                    replicatedEvents.add(eventWrapper);
                    enduranceEmitter.emit(doc.event, ...doc.payload, eventWrapper);
                }
            }
        });
        isDistributed = true;
    } catch (err) {
        logger.warn('[emitter] Failed to set up distributed emitter', err);
    }
};

export const IS_DISTRIBUTED_EMITTER = () => isDistributed;
