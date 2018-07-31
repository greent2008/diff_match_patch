import Node from './Node';
import { FSWatcher, watch } from 'chokidar';
import * as Amqp from "amqplib";
import * as child from 'child_process'
import { resolve, join } from 'path';
import * as path from "path";

var config = require('../Config')
/**
 * 生产环境
 * Client class
 */
export class Client implements Node {
    private static instance: Client //单例模式
    role: string = "Client"
    ip: string
    port: string
    userName: string
    watchDir: string
    patchDir: string
    fileWatcher: FSWatcher
    initRelativeDir: string
    amqpUri: string
    private constructor(ip: string, port: string, userName: string, watchDir: string, patchDir: string, amqpUri: string) {
        this.ip = ip
        this.port = port
        this.userName = userName
        this.watchDir = watchDir
        this.patchDir = patchDir
        this.fileWatcher = watch(this.watchDir, {
            persistent: true,
            ignored: ['**/patch/**', /\.md5$/],
            ignoreInitial: true,
            cwd: '.',
            depth: 2,
            awaitWriteFinish: {
                stabilityThreshold: 5000,
                pollInterval: 200
            }
        })
        this.initRelativeDir = config.init_relative_dir
        this.amqpUri = amqpUri
    }

    static getInstance(ip: string, port: string, userName: string, watchDir: string, patchDir: string, amqpUri: string) {
        if (!Client.instance) {
            Client.instance = new Client(ip, port, userName, watchDir, patchDir, amqpUri)
        }
        return Client.instance;
    }

    //监听B文件生成 生成A与B的diff
    monitor() {
        if (process.argv[2] === 'child') {
            process.setMaxListeners(0);
            let that = this
            // 子线程监听父线程传来的消息
            // msg为新增文件的绝对路径
            process.on('message', function (msg) {
                console.log(" [x] Child Process Recieved '%s' From Parent Process", msg);

                // 向task_queue发送消息
                Amqp.connect(that.amqpUri).then(function (conn) {
                    return conn.createChannel().then(function (ch) {
                        var q = 'task_queue'
                        var ok = ch.assertQueue(q, { durable: true })
                        ch.setMaxListeners(0);

                        return ok.then(function () {
                            let patchFile = msg;
                            ch.sendToQueue(q, Buffer.from(patchFile), { deliveryMode: true })
                            return ch.close();
                        });
                    }).finally(function () {
                        conn.close();
                    });
                }).catch(console.warn);

                // 从message_queue获取消息
                Amqp.connect(that.amqpUri).then(function (conn) {
                    process.once('SIGINT', function () { conn.close(); });
                    return conn.createChannel().then(function (ch) {
                        ch.setMaxListeners(0);
                        let ok: any = ch.assertQueue('message_queue', { durable: true })
                        ok = ok.then(function () { ch.prefetch(1); });
                        ok = ok.then(function () {
                            ch.consume('message_queue', doWork, { noAck: false });
                        })
                        return ok;

                        async function doWork(msg) {
                            var body = msg.content.toString();
                            console.log(" [x] Child Process Recieved '%s' From Message Queue", body);
                            ch.ack(msg);
                            (<any>process).send(body);
                        }
                    });
                })
            });
        } else {
            let initRelativeDir: string = this.initRelativeDir
            process.setMaxListeners(0);

            // 子线程监听处理消息队列
            let childProcess = child.fork(__filename, ['child'], {
                execPath: process.execPath
            })

            var that = this
            // 文件夹监控函数
            let listener = function (PATH: string) {
                that.fileWatcher.close();
                PATH = resolve(PATH)
                let dirName = path.dirname(PATH)
                dirName = (dirName.split(/\//).slice(-1))[0]
                let patchName = that.initRelativeDir + '_' + dirName + '.patch'
                try {
                    child.execSync(`cd ${that.patchDir} && diff -ruN -x ".md5" ../${that.initRelativeDir} ../${dirName} > ${patchName}`)
                } catch (error) {

                }
                console.log(` [x] ${that.patchDir}/${patchName} Created`)
                that.initRelativeDir = dirName
                that.fileWatcher = watch(that.watchDir, {
                    persistent: true,
                    ignored: ['**/patch/**', /\.md5$/],
                    ignoreInitial: true,
                    cwd: '.',
                    depth: 2,
                    awaitWriteFinish: {
                        stabilityThreshold: 5000,
                        pollInterval: 200
                    }
                })
                that.fileWatcher.addListener('add', listener);
                childProcess.send(`${that.patchDir}/${patchName}`);
                childProcess.once('message', function (data) {
                    console.log(" [x] Sent %s To Server", data);
                    console.log("--------------------------------------")
                });
            }
            this.fileWatcher.addListener('add', listener);
        }
    }

    //启动程序
    activate() {
        this.monitor()
    }

}

let client = Client.getInstance(
    config.client_ip,
    config.client_port,
    config.client_username,
    config.client_watch_dir,
    config.client_patch_dir,
    config.amqp_uri);
client.activate();