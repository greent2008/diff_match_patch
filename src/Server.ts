import Node from './Node';
import * as Amqp from "amqplib";
import * as fs from "fs";
import * as child from 'child_process'
import { join } from 'path';

let Client = require('ssh2-sftp-client');
let sftp = new Client();

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
    private constructor(ip: string, port: string, userName: string, watchDir: string) {
        this.ip = ip
        this.port = port
        this.userName = userName
        this.watchDir = watchDir
        this.initRelativeDir = "20180410"
    }
    static getInstance(ip: string, port: string, userName: string, watchDir: string) {
        if (!Server.instance) {
            Server.instance = new Server(ip, port, userName, watchDir)
        }
        return Server.instance
    }

    //监听B文件生成 生成A与B的diff
    async monitor() {
        var that = this

        Amqp.connect('amqp://jianengxi:wsxasd123@180.3.12.141//').then(function (conn) {
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

                    await that.pullFile('180.3.12.141',
                        'jianengxi',
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
            privateKey: fs.readFileSync("/home/tra4/.ssh/jianengxi_ubuntu", "utf8")
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

let server = Server.getInstance('180.2.30.60', '22', 'tra4',
    "/home/tra4/projects/diff_match_patch/test/disaster_recovery");
server.activate();