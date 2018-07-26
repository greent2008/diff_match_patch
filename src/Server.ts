// import * as child from 'child_process';
import Node from './Node';
import * as Amqp from "amqplib";
import * as SftpClient from "ssh2-sftp-client";
import * as fs from "fs";
// import { patch_obj } from 'diff-match-patch';

var sftp = new SftpClient();

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
    patchDir: string
    initFile: string
    private constructor(ip: string, port: string, userName: string, watchDir: string, patchDir: string) {
        this.ip = ip
        this.port = port
        this.userName = userName
        this.watchDir = watchDir
        this.patchDir = patchDir
        this.initFile = watchDir + "\\" + "A_Prime.txt"
    }
    static getInstance(ip: string, port: string, userName: string, watchDir: string, patchDir: string) {
        if (!Server.instance) {
            Server.instance = new Server(ip, port, userName, watchDir, patchDir)
        }
        return Server.instance
    }

    //监听B文件生成 生成A与B的diff
    monitor() {
        var that = this
        Amqp.connect('amqp://localhost').then(function (conn) {
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
                    // let childProcess = child.fork(__filename, ['child', '127.0.0.1', 'jianengxi', 'wsxasd123', body, that.patchDir], {
                    //     execPath: process.execPath
                    // })
                    // childProcess.on('message', function (data) {
                    //     if (data.toString() === "scp completed") {
                    //         console.log('scp completed');
                    //     }
                    // })
                    // childProcess.kill();
                    let fileName = body.split(/[\\\/]/).slice(-1)[0];
                    await that.pullFile('127.0.0.1', 'jianengxi', 'wsxasd123', body, "E:\\patch_prime\\" + fileName);
                    var secs = body.split('.').length - 1;
                    //console.log(" [x] Task takes %d seconds", secs);
                    setTimeout(function () {
                        console.log(" [x] Done");
                        ch.ack(msg);
                    }, secs * 1000);
                }
            });
        })
    }

    //从生产环境scp diff_patch 到本地灾备
    async pullFile(hostName: string, userName: string, passWord: string, remotePath: string, localPath: string) {
        await sftp.connect({
            host: hostName,
            port: 22,
            username: userName,
            privateKey: fs.readFileSync("C:\\Users\\jianengxi\\.ssh\\jinjiaosuo")
        }).then(() => {
            sftp.get(remotePath, false, 'utf8').then((stream) => {
                stream.pipe(fs.createWriteStream(localPath, {
                    flags: 'w',
                    mode: 777
                }))
                    .on('close', () => console.log('completely passed file'));
            }).catch((err) => {
                console.log(err)
            });
        })
        // return new Promise((resolve, reject) => {
        //     scp2.scp({
        //         host: hostName,
        //         username: userName,
        //         password: passWord,
        //         path: remotePath,
        //     }, localPath, function (err) {
        //         if (err) {
        //             // throw 'error pullFile: ' + err;
        //             return;
        //         }
        //     });
        // })
    }

    //patch A与B的diff到 A_Prime生成B_Prime
    patchDiff() { }

    //启动程序
    activate() {
        this.monitor()
    }

}

let server = Server.getInstance('127.0.0.1', '22', 'jianengxi', "E:\\test_prime", "E:\\patch_prime\\patch_A_B")
if (process.argv[2] === "child") {
    console.log("server in child process");
    server.pullFile(process.argv[3], process.argv[4], process.argv[5], process.argv[6], process.argv[7]);
    (<any>process).send("scp completed");
} else {
    server.activate()
}