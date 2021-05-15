/**
 * Log module for signaling server
 *
 * @author Daniil Makeev / daniil-makeev@yandex.ru
 * @package LogController
 */

import fs from 'fs';

export class LogController {
    /**
     * Store log message
     *
     * @param    {string}   message   Message to log
     * @param    {string}   socket    User IP of User object
     * @returns  void
     */
    public static message(message: string, socket?: string): void {
        const self = this;
        try {
            message = self.prepareMessage(message);
            const row = new Date().toLocaleString('ru-RU') + '\t' + (socket ? socket : '\t\t') + '\t' + message;
            fs.appendFile('/opt/janus-load-balancer/logs/server.log', row + '\r\n', (err) => {
                if (err) {
                    console.error(err);
                }
            });
            console.log(row);
        } catch (e) {
            self.error('Error in self.message: ' + e.message, socket);
        }
    }

    /**
     * Store log notification
     *
     * @param    {string}   message   Message to log
     * @param    {string}   socket    User IP of User object
     * @returns  void
     */
    public static notification(message: string, socket?: string) {
        const self = this;
        message = self.prepareMessage(message);
        self.message(message, socket);
    }

    /**
     * Store log error
     *
     * @param    {string}   message   Message to log
     * @param    {string}   socket    User IP of User object
     * @returns  void
     */
    public static error(message: string, socket?: string) {
        const self = this;
        message = self.prepareMessage(message);
        self.message(message, socket);
        const row = new Date().toLocaleString('ru-RU') + '\t' + (socket ? socket : '\t\t') + '\t' + message;
        fs.appendFile('/opt/janus-load-balancer/logs/error.log', row + '\r\n', (err) => {});
    }

    /**
     * Prepare log message
     *
     * @param    {string}               message   Message to log
     * @returns  string
     */
    private static prepareMessage(message: string): string {
        const self = this;
        try {
            if (message && typeof message === 'object') {
                const cache = [];
                message = JSON.stringify(message, (key, value) => {
                    if (typeof value === 'object' && value !== null) {
                        if (cache.indexOf(value) !== -1) {
                            // Circular reference found, discard key
                            return;
                        }
                        // Store value in our collection
                        cache.push(value);
                    }
                    return value;
                });
                message = JSON.stringify(message);
            }
            message = typeof message == 'string' ? message.substr(0, 2000) : '';
            return message;
        } catch (e) {
            self.error('Error in prepareMessage: ' + e.message);
        }
    }
}
