/**
 * Admin REST API controller for Janus load balancer
 *
 * @author Daniil Makeev / daniil-makeev@yandex.ru
 * @package AdminController
 */
import { JanusInstance, JanusInPool, JanusError, JanusInstanceDefinition } from '../models';
import { BalanceController } from '../controllers';

export class ManageController {
    // Express app
    private app;

    constructor(app) {
        const self = this;
        self.app = app;
        self.initRouting();
    }

    initRouting() {
        const self = this;
        self.app.post('/balancer/janus/add', (req, res) => {
            const balanceController = BalanceController.getInstance();
            balanceController.getInstances((error: JanusError | null, instances: JanusInPool[]) => {
                const existing: JanusInPool | null = Object.values(instances).find((item) => item.host === req.body.host);
                if (!existing) {
                    console.log('TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT', instances);
                    console.log('TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT', req.body);
                    balanceController.addInstance(req.body as JanusInstanceDefinition, (error: JanusError | null) => {
                        if (error) {
                            res.json({ success: false, ...error });
                        } else {
                            res.json({ success: true });
                        }
                    });
                } else if (existing.status === 'offline') {
                    balanceController.updateInstance(existing.id, req.body as JanusInstanceDefinition, (error: JanusError | null) => {
                        if (error) {
                            res.json({ success: false, ...error });
                        } else {
                            res.json({ success: true });
                        }
                    });
                } else {
                    res.json({ success: true });
                }
            });
        });
    }
}
