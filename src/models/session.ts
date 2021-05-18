/**
 * Session model for Janus load balancer
 *
 * @author Daniil Makeev / daniil-makeev@yandex.ru
 * @package Session
 */

import { Unimodel, JanusError } from './';

import { Lock } from '../controllers';
import * as config from 'getconfig';

export interface JanusPluginInSession {
    publicSessionId: number | undefined;
    publicPluginId: number | undefined;
    privateSessionId: number | undefined;
    privatePluginId: number | undefined;
    plugin: string;
    opaqueId: string;
    data: any;
}

export class Session extends Unimodel {
    id: number;
    _type: string = 'session';
    plugins: { [key: number]: JanusPluginInSession } = {};
    cacheCreate: any;
    cache;

    public create(callback): void {
        const self = this;
        self.id = self.createId();
        self.save((error: JanusError) => {
            self.saveInList((error: JanusError) => {
                callback(error);
            });
        });
    }

    public attachPlugin(input: { [key: string]: string }, callback): void {
        const self = this;
        if (!config.plugins.includes(input.plugin)) {
            return callback({ code: 460, reason: `No such plugin '${input.plugin}'` } as JanusError);
        }
        self.loadLock((error: JanusError | null, sessionObject: Session, lock: Lock) => {
            const publicPluginId = self.createId();
            self.plugins[publicPluginId] = {
                publicSessionId: self.id,
                publicPluginId: publicPluginId,
                privateSessionId: undefined,
                privatePluginId: undefined,
                plugin: input.plugin,
                opaqueId: input.opaque_id,
            } as JanusPluginInSession;
            self.saveInList((error: JanusError) => {
                if (error) {
                    lock.unlock();
                    return callback(error);
                }
                self.saveUnlock(lock, (error: JanusError | null) => {
                    return callback(error, publicPluginId);
                });
            });
        });
    }

    public activatePlugin(publicPluginId: number, privateSessionId: number, privatePluginId: number, data: any, callback) {
        const self = this;
        self.loadLock((error: JanusError | null, sessionObject: Session, lock: Lock) => {
            if (!self.plugins[publicPluginId]) {
                lock.unlock();
                return callback({ code: 500, reason: `Plugin ${publicPluginId} not found` } as JanusError);
            }
            self.plugins[publicPluginId].privateSessionId = privateSessionId;
            self.plugins[publicPluginId].privatePluginId = privatePluginId;
            self.plugins[publicPluginId].data = data;
            self.saveInList((error: JanusError) => {
                if (error) {
                    lock.unlock();
                    return callback(error);
                }
                self.saveUnlock(lock, () => {
                    return callback(null, self.plugins[publicPluginId]);
                });
            });
        });
    }

    // build-essentials
    // nice

    /*
    public attach(input: { [key: string]: string }, callback): void {
        const self = this;
        try {
            if (!availablePlugins.includes(input.plugin)) {
                return callback({ code: 460, reason: `No such plugin '${input.plugin}'` } as JanusError);
            }
            const id = self.createId();
            self.plugins[id] = { id, plugin: input.plugin, opaqueId: input.opaque_id } as JanusPlugin;
            callback(null, id);
        } catch (e) {
            console.log(e);
        }
    }
    */
}
