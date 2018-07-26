import Node from './Node';
import { FSWatcher, watch } from 'chokidar';
import * as Amqp from "amqplib";
import * as child from 'child_process'
import { diff_match_patch } from 'diff-match-patch';
import { resolve } from 'path';
import * as fs from "fs";
// import * as net from "net";

/**
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
    dmp: diff_match_patch
    initFile: string
    private constructor(ip: string, port: string, userName: string, watchDir: string, patchDir: string) {
        this.ip = ip
        this.port = port
        this.userName = userName
        this.watchDir = watchDir
        this.patchDir = patchDir
        this.fileWatcher = watch(this.watchDir, {
            persistent: true,
            ignored: /(^|[\/\\])\../,
            ignoreInitial: true,
            cwd: '.'
        })
        this.dmp = new diff_match_patch()
        this.initFile = watchDir + "\\" + "A.txt"
    }

    static getInstance(ip: string, port: string, userName: string, watchDir: string, patchDir: string) {
        if (!Client.instance) {
            Client.instance = new Client(ip, port, userName, watchDir, patchDir)
        }
        return Client.instance;
    }

    //监听B文件生成 生成A与B的diff
    monitor() {
        if (process.argv[2] === 'child') {
            // let ipc = new net.Socket({ fd: 0 })

            let initFile = this.initFile
            let dmp = this.dmp
            let patchDir = this.patchDir

            // 子线程监听父线程传来的消息
            // msg为新增文件的绝对路径
            process.on('message', function (msg) {
                console.log('in child process recieved ' + msg);

                // create a patch between A and B
                let initFileContent = fs.readFileSync(initFile, 'utf8') //初始A文件
                let latestFileContent = fs.readFileSync(msg, 'utf8')    //父线程监听到的新增的B文件
                let patch = dmp.patch_make(initFileContent, latestFileContent)
                let patchText = dmp.patch_toText(patch)
                let A = (initFile.split(/[\\\/]/).slice(-1))[0];
                A = A.replace(/\.txt/, '')
                let B = (msg.split(/[\\\/]/).slice(-1))[0];
                B = B.replace(/\.txt/, '')
                let patchFile = patchDir + "\\patch_" + A + "_" + B     //patch文件绝对路径
                fs.open(patchFile, 'w', function(err, fd) {
                    if (err) {
                        throw 'error opening file: ' + err;
                    }
                
                    fs.write(fd, patchText, function(err) {
                        if (err) throw 'error writing file: ' + err;
                        fs.close(fd, function() {
                            console.log('patch file written');
                            initFile = msg  //初始文件更新为新增的B文件
                        })
                    });
                })
                
                Amqp.connect('amqp://localhost').then(function (conn) {
                    return conn.createChannel().then(function (ch) {
                        var q = 'task_queue'
                        var ok = ch.assertQueue(q, { durable: true })

                        return ok.then(function () {
                            ch.sendToQueue(q, Buffer.from(patchFile), { deliveryMode: true })
                            return ch.close();
                        });
                    }).finally(function () {
                        conn.close()
                    });
                }).catch(console.warn);
                
                (<any>process).send("child process completed");
            });
        } else {
            // let childProcess = child.spawn(process.execPath, [__filename, 'child'], {
            //     stdio: 'inherit'
            // });

            // 子线程处理生成patch 并发送patch文件绝对路径到消息队列
            let childProcess = child.fork(__filename, ['child'], {
                execPath: process.execPath
            })
            
            this.fileWatcher.on('add', path => {
                path = resolve(path)
                childProcess.send(path) //父线程发送新增文件的绝对路径到子线程

                //父线程监听子线程是否处理完成
                childProcess.once('message', function(data) {
                    if (data.toString() === "child process completed") {
                        console.log(" [x] From child sent '%s' to server", path);
                    }
                });
            });
        }
        // this.fileWatcher.on('add', (event, path) => {
        //     console.log("add")
        //     Amqp.connect('amqp://localhost').then(function (conn) {
        //         return conn.createChannel().then(function (ch) {
        //             var q = 'task_queue'
        //             var ok = ch.assertQueue(q, { durable: true })

        //             return ok.then(function () {
        //                 var msg = "add"
        //                 ch.sendToQueue(q, Buffer.from(msg), { deliveryMode: true })
        //                 console.log(" [x] Sent '%s'", msg)
        //                 return ch.close()
        //             })
        //         }).finally(function () {
        //             conn.close()
        //         })
        //     }).catch(console.warn)
        // })
    }

    // //开启socket通信 通知灾备已经生成A与B的diff
    // openSocket() {}

    //启动程序
    activate() {
        this.monitor()
    }

}

let client = Client.getInstance('127.0.0.1', '22', 'jianengxi', 'E:\\test', 'E:\\patch')
client.activate()