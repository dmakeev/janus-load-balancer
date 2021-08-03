/**
 * REST API controller for Janus load balancer
 *
 * @author Daniil Makeev / daniil-makeev@yandex.ru
 * @package JanusRestController
 */

import { Session, JanusError } from '../models';
import { ResponseController, ValidateController, PluginVideoroomController, JanusInstanceController } from './';

export class JanusRestController {
    app: any = null;

    constructor(app) {
        const self = this;
        self.app = app;
        self.initRouting();
    }

    initRouting() {
        const self = this;

        // Validation
        self.app.use((req, res, next) => {
            const input = req.method === 'POST' ? req.body : req.query;
            const error: JanusError | null = ValidateController.validate(input);
            if (error) {
                console.log('ERROR', error);
                const response = ResponseController.error(req.body.transaction, error, input);
                return res.json(response);
            }
            next();
        });

        // Server root
        self.app.post('/janus', (req: any, res: any) => {
            const sessionObject: Session = new Session();
            sessionObject.create((error: JanusError | null): void => {
                if (error) {
                    const response = ResponseController.error(req.body.transaction, error);
                    return res.json(response);
                }
                const response = ResponseController.success(req.body.transaction, null, { id: sessionObject.id });
                return res.json(response);
            });
        });

        // Session level
        self.app.post('/janus/:session', (req: any, res: any) => {
            if (!req.body.janus) {
                const response = ResponseController.error(req.body.transaction, { code: 400, reason: '' } as JanusError);
                return res.json(response);
            }
            new Session().load(req.params.session, (error: JanusError | null, sessionObject: Session) => {
                if (error) {
                    const response = ResponseController.error(req.body.transaction, error);
                    return res.json(response);
                }
                // Attach the plugin
                switch (req.body.janus) {
                    case 'attach':
                        sessionObject.attachPlugin(req.body, (error: JanusError | null, pluginId: number) => {
                            if (error) {
                                const response = ResponseController.error(req.body.transaction, error);
                                return res.json(response);
                            }
                            const response = ResponseController.success(req.body.transaction, sessionObject.id, { id: pluginId });
                            // const response = ResponseController.pluginAttach(req.body.transaction, sessionObject.id, pluginId);
                            return res.json(response);
                        });
                        break;
                    default:
                        const response = ResponseController.error(req.body.transaction, {
                            code: 453,
                            reason: `Unknown request! '${req.body.janus}'`,
                        } as JanusError);
                        return res.json(response);
                }
            });
        });

        // Plugin level
        self.app.post('/janus/:session/:plugin', (req: any, res: any) => {
            new Session().load(req.params.session, (error: JanusError | null, sessionObject: Session) => {
                if (error) {
                    const response = ResponseController.error(req.body.transaction, error);
                    return res.json(response);
                }
                PluginVideoroomController.processMessage(
                    sessionObject,
                    req.params.plugin,
                    req.body,
                    (error: JanusError | null, data: any) => {
                        let response;
                        if (error) {
                            response = ResponseController.error(req.body.transaction, error);
                        } else {
                            response = ResponseController.data(req.body.transaction, data);
                        }
                        return res.json(response);
                    }
                );
                /*
                switch (req.body.janus) {
                    case 'message':
                    case 'trickle':
                    case 'start':
                        PluginVideoroomController.processMessage(
                            sessionObject,
                            req.params.plugin,
                            req.body,
                            (error: JanusError | null, data: any) => {
                                let response;
                                if (error) {
                                    response = ResponseController.error(req.body.transaction, error);
                                } else {
                                    // response = ResponseController.success(req.body.transaction, null, data);
                                    response = ResponseController.ack(req.body.transaction, req.params.session);
                                }
                                return res.json(response);
                            }
                        );
                        break;
                    default:
                        const response = ResponseController.error(req.body.transaction, {
                            code: 453,
                            reason: `Unknown request! '${req.body.janus}'`,
                        } as JanusError);
                        return res.json(response);
                }
                */
            });
        });

        // GET
        self.app.get('/janus/:session', (req: any, res: any) => {
            new Session().load(req.params.session, (error: JanusError | null, sessionObject: Session) => {
                if (error) {
                    const response = ResponseController.error(req.body.transaction, error);
                    return res.json(response);
                }
                if (!Object.values(sessionObject.plugins).length) {
                    setTimeout(() => {
                        res.json([
                            {
                                janus: 'keepalive',
                            },
                        ]);
                    }, 2000);
                    return;
                }
                const timeout = setTimeout(() => {
                    JanusInstanceController.unsubscribeToEvents(sessionObject);
                    return res.json([
                        {
                            janus: 'keepalive',
                        },
                    ]);
                }, 90000);
                JanusInstanceController.subscribeToEvents(sessionObject, req.query, (error: JanusError | null, events: any[]) => {
                    clearTimeout(timeout);
                    JanusInstanceController.unsubscribeToEvents(sessionObject);
                    return res.json(events);
                });
            });
        });
        
        // Health check
        self.app.get('/', (req: any, res: any) => {
            res.send('Ok');
        });
    }
}
