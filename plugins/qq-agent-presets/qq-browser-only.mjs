import path from 'node:path';
import {fileURLToPath} from 'node:url';
const defaultOutputRoot = fileURLToPath(new URL('../../state/doubao-jobs/', import.meta.url));
export const name = 'qq-browser-only';
export const inject = ['tools'];
const prefix = 'mcp__doubao-browser__';
const names = new Set(['list_pages','new_page','select_page','navigate_page','take_snapshot','click','fill','fill_form','press_key','wait_for','take_screenshot','list_network_requests','get_network_request'].map(n=>prefix+n));
export function browserGuard(exec, outputRoot = defaultOutputRoot) {
  if (!names.has(exec?.name)) return '生图任务仅允许专用浏览器工具';
  const args=exec.arguments || {};
  if (args.url) {
    try { const url=new URL(args.url);if(url.protocol!=='https:' || !(url.hostname==='doubao.com'||url.hostname.endsWith('.doubao.com')))return '生图任务只允许打开豆包网页'; }
    catch { return '无效网页地址'; }
  }
  if (args.requestFilePath) return '不允许保存请求凭据或请求正文';
  for (const field of ['filePath','responseFilePath']) {
    if (!args[field]) continue;
    const target=path.resolve(String(args[field]));
    if (!target.startsWith(path.resolve(outputRoot)+path.sep)) return '文件只能保存到生图任务目录';
  }
}
export function apply(ctx,config = {}) {
  const allowed=ctx.tools.schemas().map(t=>t.name).filter(n=>names.has(n));
  ctx.tools.restrict({allow:allowed});
  ctx.tools.guard(exec=>browserGuard(exec,config.outputRoot));
}
