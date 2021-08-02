/**
 * Redis controller for Janus load balancer
 *
 * @author Daniil Makeev / daniil-makeev@yandex.ru
 * @package RedisController
 */

import * as config from 'getconfig';
import { createClient, RedisClient } from 'redis';
import Redlock from 'redlock';

import { LogController } from './logController';
import { JanusError } from '../models';

export { Lock } from 'redlock';

export { RedisClient };

export class RedisController {
    private static client: RedisClient;
    private static redlock;
    // private static logController: LogController;

    public static getClient() {
        return RedisController.client;
    }

    public static getLock() {
        return RedisController.redlock;
    }

    public static initiate(callback) {
        const self = this;
        // Init Redis
        RedisController.client = createClient({ host: config.redis.host, port: config.redis.port });
        RedisController.client.select(config.redis.database);

        self.client.flushdb();

        // Error handling
        RedisController.client.on('error', (error) => {
            callback({ code: 500, reason: `Can't connect to Redis: ${error}` } as JanusError);
        });

        // Connected? Cool
        RedisController.client.on('connect', () => {
            LogController.message('Redis connected');
            callback();
        });

        RedisController.redlock = new Redlock([RedisController.client], {
            // the expected clock drift; for more details
            // see http://redis.io/topics/distlock
            driftFactor: 0.01, // multiplied by lock ttl to determine drift time

            // the max number of times Redlock will attempt
            // to lock a resource before erroring
            retryCount: 30, // 10

            // the time in ms between attempts
            retryDelay: 200, // time in ms

            // the max time in ms randomly added to retries
            // to improve performance under high contention
            // see https://www.awsarchitectureblog.com/2015/03/backoff.html
            retryJitter: 200, // time in ms
        });
    }
}
