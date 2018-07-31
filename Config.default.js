/**
 * Config 运行时环境变量配置 (default)
 */

var Config = {
    client_ip: '127.0.0.1',
    client_port: '22',
    client_username: 'jianengxi',
    client_watch_dir: '/home/jianengxi/projects/diff_match_patch/test/production',
    client_patch_dir: '/home/jianengxi/projects/diff_match_patch/test/production/patch',
    
    server_ip: '127.0.0.1',
    server_port: '22',
    server_username: 'jianengxi',
    server_watch_dir: '/home/jianengxi/projects/diff_match_patch/test/disaster_recovery',
    privateKey: '/home/jianengxi/.ssh/jinjiaosuo',
    
    init_relative_dir: '20180410',
    amqp_uri: 'amqp://localhost'
}
module.exports = Config;