/**
 * REST API controller for Janus load balancer
 *
 * @author Daniil Makeev / daniil-makeev@yandex.ru
 * @package JanusRestController
 */

import { JanusError, Session, JanusPluginInSession } from '../models';
import { BalanceController, JanusInstanceController } from '.';

export class PluginVideoroomController {
    public static readonly pluginName: string = 'janus.plugin.videoroom';

    public static processMessage(sessionObject: Session, publicPluginId: number, input: any, callback) {
        const balanceController = BalanceController.getInstance();

        balanceController.getJanusByPublicData(sessionObject.id, publicPluginId, (error: JanusError | null, janusInstanceId?: number) => {
            if (janusInstanceId) {
                const pluginInSession: JanusPluginInSession = Object.values(sessionObject.plugins).find(
                    (plugin: JanusPluginInSession) => plugin.publicPluginId === Number(publicPluginId)
                );
                if (pluginInSession && pluginInSession.privateSessionId && pluginInSession.privatePluginId) {
                    JanusInstanceController.send(
                        janusInstanceId,
                        pluginInSession.publicSessionId,
                        pluginInSession.privateSessionId,
                        pluginInSession.privatePluginId,
                        input,
                        (error: JanusError | null, response: any) => {
                            if (error) {
                                return callback(error);
                            }
                            return callback();
                        }
                    );
                    return;
                }
            }
            balanceController.getJanusPerRoom(input.body.room, sessionObject.id, (error: JanusError | null, janusInstanceId?: number) => {
                if (error) {
                    return callback(error);
                }
                JanusInstanceController.startSession(janusInstanceId, (error: JanusError | null, privateSessionId?: number) => {
                    if (error) {
                        return callback(error);
                    }
                    JanusInstanceController.attachPlugin(
                        janusInstanceId,
                        PluginVideoroomController.pluginName,
                        privateSessionId,
                        input.opaque_id,
                        (error: JanusError | null, privatePluginId?: number) => {
                            if (error) {
                                return callback(error);
                            }
                            sessionObject.activatePlugin(
                                publicPluginId,
                                privateSessionId,
                                privatePluginId,
                                input.body,
                                (error: JanusError | null, pluginInSession?: JanusPluginInSession) => {
                                    if (error) {
                                        return callback(error);
                                    }
                                    JanusInstanceController.send(
                                        janusInstanceId,
                                        sessionObject.id,
                                        privateSessionId,
                                        privatePluginId,
                                        input,
                                        (error: JanusError | null) => {
                                            if (error) {
                                                return callback(error);
                                            }
                                            callback(error, { id: pluginInSession.publicPluginId });
                                        }
                                    );
                                }
                            );
                        }
                    );
                });
            });
        });
    }
}
