/**
 * Janus balancing pool model for Janus load balancer
 *
 * @author Daniil Makeev / daniil-makeev@yandex.ru
 * @package Pool
 */

import { Unimodel, JanusInstance, JanusError, JanusStatus } from './';

export interface JanusInPool {
    id: number;
    host: string;
    status: JanusStatus;
    cpu: number | null;
}

export interface RoomInPool {
    id: number;
    users: number;
    created: number;
    janusInstanceId: number | null;
    sessions: { [key: number]: number };
}

export class Pool extends Unimodel {
    // TODO: add several loading pools support
    public id: number = 1;
    protected _type: string = 'pool';
    public instances: { [key: number]: JanusInPool } = {};
    public rooms: { [key: number]: RoomInPool } = {};

    public addWithoutSave(janus: JanusInstance): void {
        const self = this;
        self.instances[janus.id] = { id: janus.id, host: janus.host, status: 'offline', cpu: null };
    }

    public add(janus: JanusInstance, callback): void {
        const self = this;
        self.load(() => {
            self.addWithoutSave(janus);
            self.save((error: JanusError | null) => {
                callback(error);
            });
        });
    }

    public remove(janusId: number, callback): void {
        const self = this;
        self.load(() => {
            delete self.instances[janusId];
            self.save((error: JanusError | null) => {
                callback(error);
            });
        });
    }

    addRoom(roomId) {
        const self = this;
        self.rooms[roomId] = {
            id: roomId,
            users: 0,
            created: Date.now(),
            janusInstanceId: null,
            sessions: {},
        } as RoomInPool;
    }

    public load(callback) {
        const self = this;
        super.load(() => {
            return callback(null, self);
        });
    }
}
