/**
 * Janus model for Janus load balancer
 *
 * @author Daniil Makeev / daniil-makeev@yandex.ru
 * @package Janus
 */

import { Unimodel, JanusError } from '.';

// export const JanusPlugins = ''

// export const JanusPlugins: Array<string> = ['janus.plugin.videoroom', 'janus.plugin.audiobridge'];
export type JanusPlugins = 'janus.plugin.videoroom' | 'janus.plugin.audiobridge';

export interface JanusInstanceDefinition {
    useSSL: boolean;
    host: string;
    portHttp: number;
    portWebsocket: number;
    portResponder: number;
    apiSecret: string;
    enabled: boolean;
}

export type JanusStatus = 'online' | 'offline' | 'disabled';

export class JanusInstance extends Unimodel implements JanusInstanceDefinition {
    public id: number;
    protected _type: string = 'janus';
    public useSSL: boolean;
    public host: string;
    public portHttp: number;
    public portWebsocket: number;
    public portResponder: number;
    public urlHttp: string;
    public urlWebsocket: string;
    public apiSecret: string;
    public enabled: boolean;
    public prefix: string = '/janus';
    private transport: 'http' | 'websocket' = 'http';

    public create(definition: JanusInstanceDefinition, callback): void {
        const self = this;
        self.id = self.createId();
        for (let i in definition) {
            self[i] = definition[i];
        }
        self.urlHttp = `${self.useSSL ? 'https' : 'http'}://${self.host}:${self.portHttp}${self.prefix}`;
        self.urlWebsocket = `${self.useSSL ? 'wss' : 'ws'}://${self.host}:${self.portWebsocket}`;
        console.log('Creating Janus instance', self);
        self.save((error: JanusError) => {
            callback(error, self);
        });
    }

    public update(id, number, definition: JanusInstanceDefinition, callback): void {
        const self = this;
        self.load(id, (error: JanusError | null, janusInstance: JanusInstance) => {
            for (let i in definition) {
                if (typeof self[i] !== 'undefined' && i !== 'id') {
                    self[i] = definition[i];
                }
            }
            self.urlHttp = `${self.useSSL ? 'https' : 'http'}://${self.host}:${self.portHttp}${self.prefix}`;
            self.urlWebsocket = `${self.useSSL ? 'wss' : 'ws'}://${self.host}:${self.portWebsocket}`;
            console.log('Update Janus instance', self);
            self.save((error: JanusError) => {
                callback(error, self);
            });
        });
    }

    public generateTransaction(): string {
        return Math.random().toString(36).slice(2);
    }
}
