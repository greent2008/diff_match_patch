import Node from './Node';
import * as Amqp from "amqplib";
import * as fs from "fs";
import * as child from 'child_process'
import { join } from 'path';

var config = require('../Config')
var Client = require('ssh2-sftp-client');
var sftp = new Client();

/**
 * 灾备
 * Server class
 */
export class Server implements Node {
    private static instance: Server
    role: string = "Server"
    ip: string
    port: string
    userName: string
    watchDir: string
    initRelativeDir: string
    amqpUri: string
    private constructor(ip: string, port: string, userName: string, watchDir: string, amqpUri: string) {
        this.ip = ip
        this.port = port
        this.userName = userName
        this.watchDir = watchDir
        this.initRelativeDir = config.init_relative_dir
        this.amqpUri = amqpUri
    }
    static getInstance(ip: string, port: string, userName: string, watchDir: string, amqpUri: string) {
        if (!Server.instance) {
            Server.instance = new Server(ip, port, userName, watchDir, amqpUri)
        }
        return Server.instance
    }

    //监听B文件生成 生成A与B的diff
    async monitor() {
        var that = this

        Amqp.connect(that.amqpUri).then(function (conn) {
            process.once('SIGINT', function () { conn.close(); });
            return conn.createChannel().then(function (ch) {
                let ok: any = ch.assertQueue('task_queue', { durable: true })
                ok = ok.then(function () { ch.prefetch(1); });
                ok = ok.then(function () {
                    ch.consume('task_queue', doWork, { noAck: false });
                    console.log(" [*] Waiting for messages. To exit press CTRL+C");
                })
                return ok;

                async function doWork(msg) {
                    var body = msg.content.toString();
                    console.log(" [x] Received '%s'", body);
                    let patchFileName = body.split(/[\\\/]/).slice(-1)[0];

                    await that.pullFile(
                        config.client_ip,
                        config.client_username,
                        body,
                        join(that.watchDir, patchFileName));

                    console.log(" [x] Server Completely Downloaded Patch File");

                    that.patchDiff(patchFileName);
                    ch.ack(msg);
                    ch.sendToQueue('message_queue', Buffer.from(body));
                }
            });
        })
    }

    //从生产环境sftp diff_patch 到本地灾备
    pullFile(hostName: string, userName: string, remotePath: string, localPath: string): any {
        return sftp.connect({
            host: hostName,
            port: 22,
            username: userName,
            privateKey: fs.readFileSync(config.privateKey, "utf8")
        }).then(async () => {
            await sftp.fastGet(remotePath, localPath)
                .catch((err) => {
                    console.log(err);
                });
        });
    }

    //patch A与B的diff到 A_Prime生成B_Prime
    patchDiff(patchFileName: string) {
        let newDir = (patchFileName.split(/[\.\_\\\/]/).slice(-2))[0]
        child.execSync(`cd ${this.watchDir} && patch -p1 < ${patchFileName} && mv ${this.initRelativeDir} ${newDir}`)
        this.initRelativeDir = newDir
    }

    //启动程序
    activate() {
        this.monitor()
    }

}

let server = Server.getInstance(
    config.server_ip,
    config.server_port,
    config.server_username,
    config.server_watch_dir,
    config.amqp_uri);
server.activate();