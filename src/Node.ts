import { FSWatcher } from "chokidar";
import { ChildProcess } from "child_process";
/**
 * base class for client and server
 */
export default interface Node {
    role: string    //节点角色(Client: 生产环境    Server: 灾备)
    ip: string  //节点ip
    port: string    //节点端口
    userName: string    //节点用户名
    watchDir: string   //监听文件目录
    patchDir?: string    //节点patch文件目录
    fileWatcher?: FSWatcher //文件监听器
    initRelativeDir: string    //初始目录(目录A)
    amqpUri: string //rabbitmq消息队列地址

    activate(): void    //节点启动方法
}