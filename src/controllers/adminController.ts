/**
 * Admin REST API controller for Janus load balancer
 *
 * @author Daniil Makeev / daniil-makeev@yandex.ru
 * @package AdminController
 */

export class AdminController {
    // Express app
    app;

    constructor(app) {
        const self = this;
        self.app = app;
    }
}
