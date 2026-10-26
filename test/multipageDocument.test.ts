import {describe,it,expect} from 'vitest';
import {packMultipageDocument,readMultipageDocument} from '../src/persisted/multipageDocument';
import type {PersistedDocument} from '../src/persisted/persistedTypes';
const page=(x:number):PersistedDocument=>({model:{points:[{id:'a',x,y:10,style:{}}],lines:[],circles:[],angles:[],polygons:[]},measurementScale:x});
describe('multipage native document',()=>{
  it('keeps ordered independent pages, the active page and backwards-compatible current geometry',()=>{
    const pages=[page(1),page(2),page(3)],packed=packMultipageDocument(pages,1);
    expect(packed.model).toEqual(pages[1].model);
    const restored=readMultipageDocument(JSON.parse(JSON.stringify(packed)))!;
    expect(restored.pages).toEqual(pages);expect(restored.index).toBe(1);
    restored.pages[1].model.points![0].x=99;
    expect(pages[1].model.points![0].x).toBe(2);expect(packed.pages![1].model.points![0].x).toBe(2);
  });
  it('retains multipage mode with a single page',()=>{
    expect(readMultipageDocument(packMultipageDocument([page(1)],0))?.pages).toHaveLength(1);
    expect(readMultipageDocument(page(1))).toBeNull();
  });
  it('normalizes out-of-range page indexes',()=>{
    expect(readMultipageDocument(packMultipageDocument([page(1),page(2)],80))?.index).toBe(1);
    expect(readMultipageDocument({...packMultipageDocument([page(1)],0),activePage:-5})?.index).toBe(0);
    expect(readMultipageDocument({...packMultipageDocument([page(1)],0),activePage:NaN})?.index).toBe(0);
  });
  it('rejects empty or malformed books instead of losing the current document',()=>{
    for(const data of [{pages:[]},{pages:[null]},{pages:[{}]},{pages:[{model:{},pages:[]}]}])expect(()=>readMultipageDocument(data)).toThrow();
    expect(()=>packMultipageDocument([],0)).toThrow();
  });
  it('does not nest books when building a new presentation',()=>{
    const packed=packMultipageDocument([packMultipageDocument([page(1)],0)],0);
    expect(packed.pages![0].pages).toBeUndefined();expect(readMultipageDocument(packed)?.pages).toHaveLength(1);
  });
});
