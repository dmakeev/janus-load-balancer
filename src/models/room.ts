/**
 * Room model for Janus load balancer
 *
 * @author Daniil Makeev / daniil-makeev@yandex.ru
 * @package Room
 */

import { Unimodel, JanusError, JanusPlugins } from './';

export class Room extends Unimodel {
    protected _type: string = 'room';
    started: number;
    plugin: JanusPlugins;
    users: number[];

    public create(callback): void {
        const self = this;
        self.id = self.createId();
        self.save((error: JanusError) => {
            callback(error);
        });
    }
}
