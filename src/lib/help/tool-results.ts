import { resolveCitation, readArticle, contentHash } from './docs';
export type HelpSource={uri:string;title:string;appVersion:string;locale:string;contentHash:string};
export type DownloadReceipt={id:number;title:string;status:string;percent:number|null;historical:boolean};
export function mergeSources(before:HelpSource[], incoming:HelpSource[]):HelpSource[]{
  const result=new Map(before.map(source=>[`${source.uri}|${source.locale}|${source.contentHash}`,source]));
  for(const source of incoming)result.set(`${source.uri}|${source.locale}|${source.contentHash}`,source);
  return [...result.values()];
}
export function parseHelpToolResult(content:string):{sources:HelpSource[];download?:DownloadReceipt}{
  try{
    const value=JSON.parse(content);const sources:HelpSource[]=[];
    for(const article of Array.isArray(value)?value:[value]){
      if(!article||typeof article!=='object')continue;
      const id=article.articleId??article.id;
      if(typeof id!=='string'||typeof article.locale!=='string'||typeof article.title!=='string'||typeof article.appVersion!=='string'||typeof article.contentHash!=='string')continue;
      const uri=`help://${id}#guide`;
      const bundled=readArticle(id,article.locale);
      if(bundled&&article.locale===bundled.locale&&article.title===bundled.title&&article.appVersion===bundled.appVersion&&article.contentHash===contentHash(bundled)&&resolveCitation(uri,article.locale))sources.push({uri,title:article.title,appVersion:article.appVersion,locale:article.locale,contentHash:article.contentHash});
    }
    const item=value?.item;
    if(item&&Number.isSafeInteger(item.id)&&item.id>=0){
      const rawStatus=typeof item.status==='string'?item.status:typeof item.status?.type==='string'?item.status.type:'unknown';
      const status=rawStatus.toLowerCase();
      return {sources,download:{id:item.id,title:typeof item.title==='string'?item.title:typeof item.name==='string'?item.name:'',status,percent:status!=='unknown'&&typeof item.percent==='number'&&Number.isFinite(item.percent)?Math.max(0,Math.min(100,item.percent)):null,historical:value.historical===true}};
    }
    return {sources};
  }catch{return {sources:[]};}
}
