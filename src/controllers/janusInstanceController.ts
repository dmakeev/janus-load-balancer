/**
 * Admin REST API controller for Janus load balancer
 *
 * @author Daniil Makeev / daniil-makeev@yandex.ru
 * @package JanusInstanceController
 */

// import * as config from 'getconfig';
import { JanusInstance, JanusError, Session, JanusPluginInSession } from '../models';

import axios, { AxiosResponse } from 'axios';

export class JanusInstanceController {
    private static instance: JanusInstanceController;
    private static eventListeners: { [key: string]: any } = {};
    private static eventMessages: { [key: string]: any[] } = {};
    public static eventRequested: { [key: string]: boolean } = {};

    public static getInstance() {
        if (!JanusInstanceController.instance) {
            JanusInstanceController.instance = new JanusInstanceController();
        }
        return JanusInstanceController.instance;
    }

    public static startSession(janusInstanceId: number, callback): void {
        new JanusInstance().load(janusInstanceId, (error: JanusError | null, janusInstance: JanusInstance) => {
            if (error) {
                return callback(error);
            }
            const request = {
                janus: 'create',
                transaction: janusInstance.generateTransaction(),
                apisecret: janusInstance.apiSecret,
            };
            JanusInstanceController.janusRequest(janusInstance, '', request, (error: JanusError | null, response) => {
                return callback(error, response && response.data ? response.data.id : null);
            });
        });
    }

    public static attachPlugin(janusInstanceId: number, pluginName: string, sessionId: number, opaqueId: string, callback): void {
        new JanusInstance().load(janusInstanceId, (error: JanusError | null, janusInstance: JanusInstance) => {
            if (error) {
                return callback(error);
            }
            const request = {
                janus: 'attach',
                plugin: pluginName,
                opaque_id: opaqueId,
                transaction: janusInstance.generateTransaction(),
                apisecret: janusInstance.apiSecret,
            };
            JanusInstanceController.janusRequest(janusInstance, `/${sessionId}`, request, (error: JanusError | null, response) => {
                return callback(error, response && response.data ? response.data.id : null);
            });
        });
    }

    public static send(
        janusInstanceId: number,
        publicSessionId: number,
        privateSessionId: number,
        privatePluginId: number,
        input: any,
        callback
    ): void {
        new JanusInstance().load(janusInstanceId, (error: JanusError | null, janusInstance: JanusInstance) => {
            if (error) {
                return callback(error);
            }
            input.apisecret = janusInstance.apiSecret;
            const url = `/${privateSessionId}/${privatePluginId}`;
            if (!JanusInstanceController.eventRequested[privateSessionId]) {
                JanusInstanceController.sendEventRequest(janusInstanceId, publicSessionId, privateSessionId);
            }
            JanusInstanceController.janusRequest(janusInstance, url, input, (error: JanusError | null, response) => {
                if (error) {
                    console.log(`Janus request failed, Janus ID ${janusInstance.id}`, input);
                    console.log(url);
                    console.log(janusInstance);
                    return callback(error);
                }
                return callback(null, response.data);
            });
        });
    }

    public static sendEventRequest(janusInstanceId: number, publicSessionId: number, privateSessionId: number): void {
        new JanusInstance().load(janusInstanceId, (error: JanusError | null, janusInstance: JanusInstance) => {
            if (error) {
                console.log('Stop processing events for the session ${sessionId} - janus instance not found');
                return;
            }
            new Session().load(publicSessionId, (error: JanusError | null, sessionObject: Session) => {
                if (error) {
                    JanusInstanceController.eventRequested[privateSessionId] = false;
                    console.log('Stop processing events for the session ${sessionId} - session not found');
                    return;
                }
                JanusInstanceController.eventRequested[privateSessionId] = true;
                const url = `${janusInstance.urlHttp}/${privateSessionId}?rid=${Date.now()}&maxev=10&apisecret=${encodeURIComponent(
                    janusInstance.apiSecret
                )}`;
                axios
                    .get(url)
                    .then((response: AxiosResponse) => {
                        JanusInstanceController.processEventResult(publicSessionId, privateSessionId, response.data);
                        if (response.data && response.data[0] && response.data[0].janus) {
                            JanusInstanceController.sendEventRequest(janusInstanceId, publicSessionId, privateSessionId);
                        }
                    })
                    .catch((error) => {
                        console.warn(error.message);
                    });
            });
        });
    }

    private static processEventResult(publicSessionId, privateSessionId, events: any[]) {
        new Session().loadList((error: JanusError | null, sessionList: { [key: string]: Session }) => {
            events.every((event) => {
                if (event.janus === 'keepalive') {
                    return false;
                }
                let pluginInSession: JanusPluginInSession = null;
                if (event.sender) {
                    Object.values(sessionList).find((sessionObject: Session) => {
                        return Object.values(sessionObject.plugins).find((plugin: JanusPluginInSession) => {
                            if (plugin.privatePluginId === event.sender) {
                                pluginInSession = plugin;
                                return true;
                            }
                        });
                    });
                    if (!pluginInSession) {
                        Object.values(sessionList).forEach((sessionObject) => console.log(sessionObject));
                        return false;
                    }
                    event.session_id = pluginInSession.publicSessionId;
                    event.sender = pluginInSession.publicPluginId;
                } else {
                    Object.values(sessionList).find((sessionObject: Session) => {
                        return Object.values(sessionObject.plugins).find((plugin: JanusPluginInSession) => {
                            if (plugin.privateSessionId === event.session_id) {
                                pluginInSession = plugin;
                                return true;
                            }
                        });
                    });
                    event.session_id = pluginInSession.publicSessionId;
                }
                return true;
            });
            if (!events.length) {
                return;
            }
            if (JanusInstanceController.eventListeners[publicSessionId]) {
                JanusInstanceController.eventListeners[publicSessionId](null, events);
                delete JanusInstanceController.eventListeners[publicSessionId];
            } else {
                if (typeof JanusInstanceController.eventMessages[publicSessionId] === 'undefined') {
                    JanusInstanceController.eventMessages[publicSessionId] = [];
                }
                events.forEach((event) => {
                    JanusInstanceController.eventMessages[publicSessionId].push(event);
                });
            }
        });
    }

    public static subscribeToEvents(sessionObject: Session, input: any, callback): void {
        JanusInstanceController.eventListeners[sessionObject.id] = callback;
        if (JanusInstanceController.eventMessages[sessionObject.id]) {
            callback(null, JanusInstanceController.eventMessages[sessionObject.id]);
            JanusInstanceController.eventMessages[sessionObject.id] = [];
        }
    }

    public static unsubscribeToEvents(sessionObject: Session): void {
        delete JanusInstanceController.eventListeners[sessionObject.id];
    }

    private static janusRequest(janusInstance: JanusInstance, url, params, callback): void {
        axios
            .post(`${janusInstance.urlHttp}${url}`, params)
            .then((response: AxiosResponse) => {
                if (response.data && response.data.janus === 'error') {
                    callback(response.data.error as JanusError);
                } else {
                    callback(null, response.data);
                }
            })
            .catch((error) => {
                callback({ code: 500, reason: error.message } as JanusError);
            });
    }
}
