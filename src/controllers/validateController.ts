/**
 * Validate controller for Janus load balancer
 *
 * @author Daniil Makeev / daniil-makeev@yandex.ru
 * @package ValidateController
 */

import * as config from 'getconfig';

import { JanusError } from '../models';

export class ValidateController {
    public static validate(input: any): JanusError | null {
        // TODO: add request validation
        if (!input.apisecret || input.apisecret !== config.server.apiSecret) {
            return { code: 403, reason: 'Unauthorized request (wrong or missing secret/token)' } as JanusError;
        }
        return null;
    }
}
