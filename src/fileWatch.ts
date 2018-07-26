import { FSWatcher, watch } from 'chokidar'

export let fileWatcher = watch('E:\\projects\\diff_match_patch\\test', {
    persistent: true,
    ignored: /(^|[\/\\])\../,
    cwd: '.'
})