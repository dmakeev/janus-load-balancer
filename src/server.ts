/**
 * Janus load balancer
 *
 * @author Daniil Makeev / daniil-makeev@yandex.ru
 */

import * as config from 'getconfig';
import * as http from 'http';
import * as https from 'https';
import fs from 'fs';
import express from 'express';
import sticky from 'sticky-session';
import cors from 'cors';
import * as bodyParser from 'body-parser';

import { LogController, JanusRestController, RedisController, BalanceController, ManageController } from './controllers';
import { JanusError } from './models';

class JanusLoadBalancer {
    constructor() {
        const self = this;
        // Init Express
        const appHttp = express();
        appHttp.use(bodyParser.json());
        appHttp.use(bodyParser.urlencoded({ extended: false }));
        appHttp.use(cors());
        appHttp.use(
            bodyParser.urlencoded({
                extended: true,
            })
        );

        const appWebsocket = express();

        const appAdmin = express();
        appAdmin.use(bodyParser.json());
        appAdmin.use(bodyParser.urlencoded({ extended: false }));
        appAdmin.use(cors());
        appAdmin.use(
            bodyParser.urlencoded({
                extended: true,
            })
        );

        const appManage = express();
        appManage.use(bodyParser.json());
        appManage.use(bodyParser.urlencoded({ extended: false }));
        appManage.use(cors());
        appManage.use(
            bodyParser.urlencoded({
                extended: true,
            })
        );

        let serverHttp;
        let serverWebsocket;
        let serverAdmin;
        let serverManage;

        if (config.server.useSSL) {
            const credentials = {
                key: fs.readFileSync(config.server.key, 'utf8'),
                cert: fs.readFileSync(config.server.cert, 'utf8'),
                ca: config.server.ca ? fs.readFileSync(config.server.ca, 'utf8') : '',
            };
            serverHttp = https.createServer(credentials, appHttp);
            serverWebsocket = https.createServer(credentials, appWebsocket);
            serverAdmin = https.createServer(credentials, appAdmin);
            serverManage = https.createServer(credentials, appManage);
        } else {
            serverHttp = http.createServer(appHttp);
            serverWebsocket = http.createServer(appWebsocket);
            serverAdmin = http.createServer(appAdmin);
            serverManage = http.createServer(appManage);
        }

        // Master code
        if (!sticky.listen(serverHttp, config.server.portHttp)) {
            // Enable managing endpoint
            new ManageController(appManage);
            appManage.listen(config.server.portManage, () => {
                LogController.message(`Managing endpoint started at ${config.server.portManage} port`);
            });
            RedisController.initiate((error: JanusError | null) => {
                if (error) {
                    LogController.error(`Can't load Janus instances from the config file: ${error.reason}`);
                }
                BalanceController.getInstance().initiateMaster((error: JanusError | null) => {
                    if (error) {
                        LogController.error(`Can't initiate load balancer: ${error.reason}`);
                    }
                });
            });
            // Worker code
        } else {
            RedisController.initiate((error: JanusError | null) => {
                if (error) {
                    LogController.error(`Can't load Janus instances from the config file: ${error.reason}`);
                }
                BalanceController.getInstance().initiateWorker((error: JanusError | null) => {
                    if (error) {
                        LogController.error(`Can't load Janus instances from the config file: ${error.reason}`);
                    }
                });
            });
            // Initiate Janus HTTP REST API
            new JanusRestController(appHttp);
            LogController.message('Janus HTTP endpoint started at ' + config.server.portHttp + ' port');
        }
        // Catch all uncatched exceptions
        process.on('uncaughtException', (e) => {
            LogController.error(e.message);
            console.log(e);
        });
    }
}

new JanusLoadBalancer();
