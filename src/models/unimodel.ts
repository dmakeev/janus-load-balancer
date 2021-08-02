/**
 * Universal model for Janus load balancer
 *
 * @author Daniil Makeev / daniil-makeev@yandex.ru
 * @package Session
 */
import * as config from 'getconfig';

import { RedisController, RedisClient, Lock } from '../controllers';
import { JanusError } from '../models';

export class Unimodel {
    public id: number;
    protected _type: string;

    /**
     * Generate new ID
     *
     */
    public createId() {
        return 1000000000000000 + Math.round(Math.random() * (Number.MAX_SAFE_INTEGER - 1000000000000000));
    }

    /**
     * Load the items from the list
     *
     */
    public loadList(callback?) {
        const self = this;
        const key = `list:${config.redis.prefix}:${self._type}`;
        const redisClient: RedisClient = RedisController.getClient();
        redisClient.hgetall(key, (error, items: { [key: string]: string }) => {
            const result = {};
            for (let key in items) {
                result[key] = JSON.parse(items[key]);
            }
            callback(null, result);
        });
    }

    /**
     * Save the item in the list
     *
     */
    public saveInList(callback?) {
        const self = this;
        if (!self.id) {
            const reason = `Can't save ${self._type} in the list without id`;
            return callback({ code: 400, reason } as JanusError);
        }
        const key = `list:${config.redis.prefix}:${self._type}`;
        const toStore = JSON.stringify({ ...self });
        const redisClient: RedisClient = RedisController.getClient();
        redisClient.hset(key, String(self.id), toStore, (error: Error) => {
            if (error) {
                return callback({ code: 500, reason: error.message } as JanusError);
            }
            callback(null, self);
        });
    }

    /**
     * Delete the item from the list
     *
     */
    public deleteFromList(callback?) {
        const self = this;
        if (!self.id) {
            const reason = `Can't delete ${self._type} from the list without id`;
            return callback({ code: 400, reason } as JanusError);
        }
        const key = `list:${config.redis.prefix}:${self._type}`;
        const toStore = JSON.stringify({ ...self });
        const redisClient: RedisClient = RedisController.getClient();
        redisClient.hdel(key, String(self.id), (error: Error) => {
            if (error) {
                return callback({ code: 500, reason: error.message } as JanusError);
            }
            callback(null, self);
        });
    }

    /**
     * Save the item
     *
     */
    public save(callback?) {
        const self = this;
        if (!self.id) {
            const reason = `Can't save ${self._type} without id`;
            return callback({ code: 400, reason } as JanusError);
        }
        const key = `${config.redis.prefix}:${self._type}:${self.id}`;
        const toStore = JSON.stringify({ ...self });
        const redisClient: RedisClient = RedisController.getClient();
        redisClient.set(key, toStore, (error: Error) => {
            if (error) {
                return callback({ code: 500, reason: error.message } as JanusError);
            }
            callback(null, self);
        });
    }

    /**
     * Save the item and unlock it
     *
     */
    public saveUnlock(lock, callback?) {
        const self = this;
        if (!self.id) {
            const reason = `Can't save ${self._type} without id`;
            lock.unlock(() => {
                return callback({ code: 400, reason } as JanusError);
            });
        }
        const key = `${config.redis.prefix}:${self._type}:${self.id}`;
        const toStore = JSON.stringify({ ...self });
        const redisClient: RedisClient = RedisController.getClient();
        redisClient.set(key, toStore, (error: Error) => {
            if (error) {
                lock.unlock(() => {
                    return callback({ code: 500, reason: error.message } as JanusError);
                });
            }
            lock.unlock(() => {
                callback(null, self);
            });
        });
    }

    /**
     * Load the item
     *
     */
    public load(id, callback?) {
        const self = this;
        if (!callback && id) {
            callback = id;
            id = self.id;
        }
        if (!id) {
            const reason = `Can't load ${self._type} without id`;
            return callback({ code: 400, reason } as JanusError);
        }
        const key = `${config.redis.prefix}:${self._type}:${id}`;
        const redisClient: RedisClient = RedisController.getClient();
        redisClient.get(key, (error: Error, raw: string) => {
            if (error) {
                return callback({ code: 400, reason: error.message } as JanusError);
            }
            try {
                const data: any = JSON.parse(raw);
                for (let key in data) {
                    self[key] = data[key];
                }
            } catch (error) {
                return callback(error);
            }
            callback(null, self);
        });
    }

    /**
     * Load the item and lock it
     *
     */
    public loadLock(id, callback?) {
        const self = this;
        if (!callback && id) {
            callback = id;
            id = self.id;
        }
        if (!id) {
            const reason = `Can't load and lock ${self._type} without id`;
            return callback({ code: 400, reason } as JanusError);
        }
        const key = `${config.redis.prefix}:${self._type}:${id}`;
        const redisClient: RedisClient = RedisController.getClient();
        const redlock = RedisController.getLock();
        redlock.lock(`locks:${key}`, 1000, (error, lock) => {
            if (error) {
                return callback({ code: 500, reason: error.message } as JanusError);
            }
            redisClient.get(key, (error: Error, raw: string) => {
                if (error) {
                    return callback({ code: 400, reason: error.message } as JanusError);
                }
                try {
                    const data: any = JSON.parse(raw);
                    for (let key in data) {
                        self[key] = data[key];
                    }
                } catch (error) {
                    return callback(error);
                }
                callback(null, self, lock);
            });
        });
    }
}
