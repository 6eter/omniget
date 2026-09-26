import {describe,it,expect} from 'vitest';
import {readArticle,contentHash} from './docs';
import {parseHelpToolResult,mergeSources} from './tool-results';
describe('Help runtime tool results',()=>{
 it('adds valid sources returned by subsequent document tools in their actual locale',()=>{
  const article=readArticle('quota','pt')!;
  const source={articleId:'quota',title:article.title,locale:'pt',appVersion:article.appVersion,contentHash:contentHash(article)};
  const parsed=parseHelpToolResult(JSON.stringify(source));
  expect(parsed.sources[0]).toEqual({uri:'help://quota#guide',title:source.title,locale:'pt',appVersion:'0.10',contentHash:source.contentHash});
  expect(mergeSources(parsed.sources,parseHelpToolResult(JSON.stringify([source])).sources)).toHaveLength(1);
  expect(parseHelpToolResult(JSON.stringify({...source,articleId:'invented'})).sources).toEqual([]);
  expect(parseHelpToolResult(JSON.stringify({...source,contentHash:'forged'})).sources).toEqual([]);
 });
 it('keeps historical queue receipts without inventing completion or percentage',()=>{
  expect(parseHelpToolResult(JSON.stringify({historical:true,item:{id:7,title:'Clip',status:{type:'queued'}}})).download).toEqual({id:7,title:'Clip',status:'queued',percent:null,historical:true});
  expect(parseHelpToolResult(JSON.stringify({item:{id:8,status:{type:'Active'},percent:0}})).download?.status).toBe('active');
  expect(parseHelpToolResult(JSON.stringify({item:{id:9,percent:0}})).download?.percent).toBeNull();
  expect(parseHelpToolResult('not JSON')).toEqual({sources:[]});
 });
});
