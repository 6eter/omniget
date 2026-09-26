import { describe,it,expect } from 'vitest';
import { articles,searchDocs,resolveCitation,contentHash } from './docs';
describe('bundled Help',()=>{
 it('ships matching versioned PT, EN and RU guides',()=>{expect(articles('pt').map(a=>a.id)).toEqual(articles('en').map(a=>a.id));expect(articles('en')).toHaveLength(20);expect(articles('ru').map(a=>a.id)).toEqual(articles('en').map(a=>a.id));});
 it('uses deterministic lexical ranking and bounded sources',()=>{expect(searchDocs('Claude','pt')[0].id).toBe('claude');expect(searchDocs('qzxv-not-found','pt')).toEqual([]);expect(searchDocs('','en',999)).toHaveLength(20);});
 it('only resolves citations to shipped guides',()=>{expect(resolveCitation('help://claude#guide','pt')).toBe('/help?article=claude#guide');expect(resolveCitation('help://invented#guide','en')).toBeNull();expect(resolveCitation('javascript:alert(1)','en')).toBeNull();});
 it('has explicit English fallback and stable hashes',()=>{expect(articles('fr')[0].locale).toBe('en');expect(contentHash(articles('pt')[0])).toMatch(/^[a-f0-9]{8}$/);});
});
