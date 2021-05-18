/**
 * Admin REST API controller for Janus load balancer
 *
 * @author Daniil Makeev / daniil-makeev@yandex.ru
 * @package BalanceController
 */

import * as config from 'getconfig';
import { Pool, JanusInstance, JanusInstanceDefinition, JanusError, JanusStatus } from '../models';
import { Lock, LogController } from '../controllers';
import * as WebSocket from 'websocket';
import io from 'socket.io-client';

interface JanusServiceConnection {
    janusId: number;
    added: number;
    toResponder: any;
    toJanus: any;
    janusUrl: string;
    responderUrl: string;
    janusConnected: boolean;
    responderConnected: boolean;
    cpuInterval: ReturnType<typeof setInterval>;
    enabled: boolean;
}

export class BalanceController {
    private static instance: BalanceController;
    private pool: Pool;
    // Used only in master thread
    private connections: { [key: number]: JanusServiceConnection } = {};

    public static getInstance() {
        if (!BalanceController.instance) {
            BalanceController.instance = new BalanceController();
        }
        return BalanceController.instance;
    }

    public initiateMaster(callback): void {
        const self = this;
        self.pool = new Pool();
        setInterval(() => {
            self.pool.load((error: JanusError | null) => {
                if (error && error.reason) {
                    return LogController.error(error.reason);
                }
                Object.keys(self.pool.instances).forEach((janusId) => {
                    if (!self.connections[janusId]) {
                        self.createConnections(Number(janusId));
                    }
                });
            });
        }, 3000);
    }

    public initiateWorker(callback): void {
        const self = this;
        self.pool = new Pool();
        let deep = 0;
        config.janus.forEach((definition: JanusInstanceDefinition) => {
            deep++;
            new JanusInstance().create(definition, (error: JanusError | null, janusInstance: JanusInstance): void => {
                if (error) {
                    return callback(error);
                }
                self.pool.addWithoutSave(janusInstance);
                if (!--deep) {
                    self.pool.save((error: JanusError | null) => {
                        callback(error);
                    });
                }
            });
        });
    }

    public getInstances(callback): void {
        const self = this;
        self.pool.load((error: JanusError | null) => {
            if (error && error.reason) {
                return LogController.error(error.reason);
            }
            callback(error, self.pool.instances);
        });
    }

    public addInstance(definition: JanusInstanceDefinition, callback) {
        const self = this;
        self.pool.load((error: JanusError | null) => {
            if (error && error.reason) {
                return LogController.error(error.reason);
            }
            new JanusInstance().create(definition, (error: JanusError | null, janusInstance: JanusInstance): void => {
                if (error) {
                    return callback(error);
                }
                self.pool.addWithoutSave(janusInstance);
                self.createConnections(Number(janusInstance.id));
                self.pool.save((error: JanusError | null) => {
                    callback(error);
                });
            });
        });
    }

    public updateInstance(id: number, definition: JanusInstanceDefinition, callback) {
        const self = this;
        self.pool.load((error: JanusError | null) => {
            if (error && error.reason) {
                return LogController.error(error.reason);
            }
            new JanusInstance().create(definition, (error: JanusError | null, janusInstance: JanusInstance): void => {
                if (error) {
                    return callback(error);
                }
                self.pool.addWithoutSave(janusInstance);
                self.removeConnections(Number(janusInstance.id));
                self.createConnections(Number(janusInstance.id));
                self.pool.save((error: JanusError | null) => {
                    callback(error);
                });
            });
        });
    }

    private createConnections(janusId: number, reconnect?: boolean) {
        const self = this;
        self.connections[janusId] = {
            janusId,
            toResponder: null,
            toJanus: null,
            added: Date.now(),
            janusConnected: false,
            responderConnected: false,
            enabled: true,
        } as JanusServiceConnection;
        new JanusInstance().load(janusId, (error: JanusError | null, janusInstance) => {
            let protocol = janusInstance.useSSL ? 'wss' : 'ws';
            self.connections[janusId].janusUrl = `${protocol}://${janusInstance.host}:${janusInstance.portWebsocket}`;
            self.connections[janusId].toJanus = new WebSocket.client();
            self.connections[janusId].toJanus
                .on('connect', (connection) => {
                    self.connections[janusId].janusConnected = true;
                    self.updateJanusStatus(janusId);
                    connection
                        .on('close', (event) => {
                            self.connections[janusId].janusConnected = false;
                            self.updateJanusStatus(janusId);
                            LogController.error(`Websocket connection to Janus at ${self.connections[janusId].janusUrl} is closed`);
                            setTimeout(() => {
                                self.createConnections(janusId, true);
                            }, 3000);
                        })
                        .on('error', (event) => {
                            // self.connections[janusId].janusConnected = false;
                        });
                    LogController.message(`Janus websocket at ${self.connections[janusId].janusUrl} is connected`);
                })
                .on('connectFailed', (event) => {
                    self.connections[janusId].janusConnected = false;
                    self.updateJanusStatus(janusId);
                    if (!reconnect) {
                        LogController.error(`Can't connect to Janus at ${self.connections[janusId].janusUrl} via websocket: ${event.code}`);
                    }
                    setTimeout(() => {
                        self.createConnections(janusId, true);
                    }, 3000);
                });
            self.connections[janusId].toJanus.connect(self.connections[janusId].janusUrl, 'janus-protocol');

            // Responder connection - getting the VM metrics
            if (!self.connections[janusId].toResponder) {
                let warnOnError = true;
                protocol = janusInstance.useSSL ? 'https' : 'http';
                self.connections[janusId].responderUrl = `${protocol}://${janusInstance.host}:${janusInstance.portResponder}`;
                self.connections[janusId].toResponder = io(self.connections[janusId].responderUrl);
                self.connections[janusId].toResponder.on('connect', () => {
                    self.connections[janusId].responderConnected = true;
                    self.updateJanusStatus(janusId);
                    self.connections[janusId].cpuInterval = setInterval(
                        () => {
                            self.connections[janusId].toResponder.emit('/v1/load/cpu', {}, (result) => {
                                // self.connections[janusId].cpu result.loadAverage;
                                self.pool.loadLock((error: JanusError | null, fake, lock: Lock) => {
                                    if (error) {
                                        LogController.error(error.reason);
                                        return;
                                    }
                                    self.pool.instances[janusId].cpu = Number(result.loadAverage);
                                    self.pool.saveUnlock(lock, () => {});
                                });
                            });
                        },
                        config.balancing.cpuRequestInterval ? config.balancing.cpuRequestInterval : 5000
                    );
                    warnOnError = true;
                    LogController.message(`Janus responder at ${self.connections[janusId].responderUrl} is connected`);
                });
                self.connections[janusId].toResponder.on('connect_error', (error) => {
                    if (warnOnError) {
                        LogController.error(`Can't connect to Janus responder at ${self.connections[janusId].responderUrl}`);
                        warnOnError = false;
                    }
                });
                self.connections[janusId].toResponder.on('disconnect', (error) => {
                    LogController.error(`Connection to responder at ${self.connections[janusId].responderUrl} is closed`);
                    warnOnError = true;
                });
            }
        });
    }

    private removeConnections(janusId: number) {
        const self = this;
        if (!self.connections[janusId]) {
            return false;
        }
        clearInterval(self.connections[janusId].cpuInterval);
        new JanusInstance().load(janusId, (error: JanusError | null, janusInstance) => {
            if (error) {
                return;
            }
            self.connections[janusId].toJanus.close();
            self.updateJanusStatus(janusId);
        });
    }

    private updateJanusStatus(janusId: number, callback?): void {
        const self = this;
        self.pool.loadLock((error: JanusError | null, fake, lock: Lock) => {
            if (!self.pool.instances[janusId]) {
                return;
            }
            let status: JanusStatus;
            if (!self.connections[janusId].enabled) {
                status = 'disabled';
                // } else if (self.connections[janusId].janusConnected && self.connections[janusId].responderConnected) {
            } else if (self.connections[janusId].janusConnected) {
                status = 'online';
            } else {
                status = 'offline';
            }
            if (self.pool.instances[janusId].status === status) {
                return;
            }
            LogController.message(`Janus status at ${self.connections[janusId].janusUrl} is changed to: ${status}`);
            self.pool.instances[janusId].status = status;
            self.pool.saveUnlock(lock, () => {
                callback && callback();
            });
        });
    }

    private enableJanusInstance(janusId: number) {
        const self = this;
        self.connections[janusId].enabled = true;
        self.updateJanusStatus(janusId);
    }

    public getJanusPerRoom(roomId: number, sessionId: number, callback): void {
        const self = this;
        self.pool.loadLock((error: JanusError | null, fake, lock: Lock) => {
            if (error) {
                return callback(error);
            }
            if (self.pool.rooms[roomId]) {
                self.pool.rooms[roomId].sessions[sessionId] = sessionId;
                self.pool.saveUnlock(lock, () => {
                    return callback(null, self.pool.rooms[roomId].janusInstanceId);
                });
                return;
            }
            self.pool.addRoom(roomId);
            let lessCPU: number = 100;
            let bestInstanceId: number | null = null;
            Object.values(self.pool.instances).forEach((item) => {
                if (item.status === 'online' && item.cpu !== null && item.cpu > lessCPU) {
                    bestInstanceId = item.id;
                    lessCPU = item.cpu;
                }
            });
            if (!bestInstanceId) {
                const instancesWithoutCpuValue = Object.values(self.pool.instances).filter(
                    (item) => item.status === 'online' && item.cpu === null
                );
                const bestInstance = instancesWithoutCpuValue[Math.floor(Math.random() * instancesWithoutCpuValue.length)];
                if (!bestInstance) {
                    return callback('There is no instances to use');
                }
                bestInstanceId = bestInstance.id;
            }
            self.pool.rooms[roomId].janusInstanceId = bestInstanceId;
            self.pool.rooms[roomId].sessions[sessionId] = sessionId;
            self.pool.saveUnlock(lock, () => {
                callback(null, bestInstanceId);
            });
        });
    }

    public getJanusByPublicSession(publicSessionId: number, plugin: string, callback): void {
        const self = this;
        self.pool.load((error: JanusError | null) => {
            let janusInstanceId: number = null;
            //TODO: add cache here
            Object.values(self.pool.rooms).every((room) => {
                if (room.sessions[publicSessionId]) {
                    janusInstanceId = room.janusInstanceId;
                    return false;
                }
                return true;
            });
            // TODO: add error handling
            return callback(null, janusInstanceId);
        });
    }

    public getJanusByPublicData(publicSessionId: number, publicPluginId: number, callback, iteration?: number): void {
        const self = this;
        self.pool.load((error: JanusError | null) => {
            let janusInstanceId: number = null;
            //TODO: add cache here
            Object.values(self.pool.rooms).every((room) => {
                if (room.sessions[publicSessionId]) {
                    janusInstanceId = room.janusInstanceId;
                    return false;
                }
                return true;
            });
            if (!janusInstanceId) {
                return callback({ code: 500, reason: 'No Janus instance found for this session' } as JanusError);
            }
            return callback(null, janusInstanceId);
        });
    }
}
