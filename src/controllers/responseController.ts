/**
 * REST API controller for Janus load balancer
 *
 * @author Daniil Makeev / daniil-makeev@yandex.ru
 * @package JanusRestController
 */
import { JanusError } from '../models';

export class ResponseController {
    public static ack(transaction: string, sessionId: number) {
        return {
            janus: 'ack',
            session_id: sessionId,
            transaction,
        };
    }

    public static success(transaction: string, sessionId: number | null, data: any) {
        const result: any = { janus: 'success', transaction, data };
        if (sessionId) {
            result.session_id = sessionId;
        }
        return result;
    }

    public static data(transaction: string, data: any) {
        return { ...data, transaction };
    }

    public static error(transaction: string, error: JanusError, input?: any) {
        return {
            janus: 'error',
            transaction,
            error: error,
        };
    }
}
